import { QuestsResponse, RunFightResponse, RunFinishResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { loadGameData } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };
const data = loadGameData();
const hero = data.heroList[0]!;

describe("a quest run over HTTP (META-06, CORE-07)", () => {
  it("plays a quest open today, books it once without league points and marks it played", { timeout: 60_000 }, async () => {
    const s = await fetch(`${url}/session`, { method: "POST", headers, body: JSON.stringify({ platform: "dev", player: `q-${Date.now().toString(36)}` }) });
    const { token, profile } = SessionResponse.parse(await s.json());
    const auth = { ...headers, authorization: `Bearer ${token}` };
    const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    const list = async () => QuestsResponse.parse(await (await fetch(`${url}/quests`, { headers: auth })).json()).quests;

    const open = await list();
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((q) => !q.played)).toBe(true);
    const quest = open[0]!;

    let { run } = RunStartResponse.parse(await (await post("/runs", { hero: hero.id, simVersion: data.simVersion, quest: quest.id })).json());
    expect(run.quest).toBe(quest.id);
    const runId = run.runId;
    while (!run.over) {
      const res = await post("/runs/fight", {
        runId,
        round: run.round,
        backpack: { hero: hero.id, round: run.round, bags: hero.bags, items: hero.start },
        actions: [],
        simVersion: data.simVersion,
      });
      expect(res.status).toBe(200);
      run = RunFightResponse.parse(await res.json()).run;
    }

    const [a, b] = await Promise.all([post("/runs/finish", { runId, reason: "finished" }), post("/runs/finish", { runId, reason: "finished" })]);
    const [ta, tb] = [await a.text(), await b.text()];
    expect(tb).toBe(ta);
    const fin = RunFinishResponse.parse(JSON.parse(ta));
    expect(fin.result).toMatchObject({ runId, quest: quest.id, points: 0 });
    expect(fin.profile.runs).toBe(profile.runs + 1);
    expect(fin.profile.season.points).toBe(profile.season.points);

    expect((await list()).find((q) => q.id === quest.id)?.played).toBe(true);
    const again = await post("/runs", { hero: hero.id, simVersion: data.simVersion, quest: quest.id });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "quest_unavailable" });
  });
});
