import { RunFightResponse, RunFinishResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { loadGameData } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };
const data = loadGameData();
const hero = data.heroList[0]!;

describe("a whole run over HTTP against the bot pool", () => {
  it("plays every round, repeats give identical bodies, and the end is booked", { timeout: 60_000 }, async () => {
    const s = await fetch(`${url}/session`, { method: "POST", headers, body: JSON.stringify({ platform: "dev", player: `f-${Date.now().toString(36)}` }) });
    const { token, profile } = SessionResponse.parse(await s.json());
    const auth = { ...headers, authorization: `Bearer ${token}` };
    const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });

    let { run } = RunStartResponse.parse(await (await post("/runs", { hero: hero.id, simVersion: data.simVersion })).json());
    const runId = run.runId;
    let rounds = 0;
    while (!run.over) {
      const body = {
        runId,
        round: run.round,
        backpack: { hero: hero.id, round: run.round, bags: hero.bags, items: hero.start },
        actions: ["rr"],
        simVersion: data.simVersion,
      };
      const res = await post("/runs/fight", body);
      expect(res.status).toBe(200);
      const text = await res.text();
      // a repeated request gets the identical body
      expect(await (await post("/runs/fight", body)).text()).toBe(text);
      run = RunFightResponse.parse(JSON.parse(text)).run;
      rounds++;
    }
    expect(rounds).toBeGreaterThanOrEqual(data.rules.lives);
    expect(run.lives === 0 || run.round === data.rules.rounds).toBe(true);

    // two finish requests at the same time: one booking, identical answers
    const [a, b] = await Promise.all([post("/runs/finish", { runId, reason: "finished" }), post("/runs/finish", { runId, reason: "finished" })]);
    const [ta, tb] = [await a.text(), await b.text()];
    expect(tb).toBe(ta);
    const fin = RunFinishResponse.parse(JSON.parse(ta));
    expect(fin.result).toMatchObject({ runId, wins: run.wins, livesLeft: run.lives, roundsPlayed: rounds });
    expect(fin.profile.runs).toBe(profile.runs + 1);
  });
});
