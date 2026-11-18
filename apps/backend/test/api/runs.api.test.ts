import { RunCurrentResponse, RunFinishResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };
const data = loadGameData();
const hero = loadMeta(data).startHeroes[0]!;

const signIn = async () => {
  const s = await fetch(`${url}/session`, {
    method: "POST",
    headers,
    body: JSON.stringify({ platform: "dev", player: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }),
  });
  const { token, profile } = SessionResponse.parse(await s.json());
  const auth = { ...headers, authorization: `Bearer ${token}` };
  return {
    profile,
    current: async () => RunCurrentResponse.parse(await (await fetch(`${url}/runs/current`, { headers: auth })).json()).run,
    start: async (simVersion = data.simVersion) => fetch(`${url}/runs`, { method: "POST", headers: auth, body: JSON.stringify({ hero, simVersion }) }),
    finish: async (runId: string, reason: string) => fetch(`${url}/runs/finish`, { method: "POST", headers: auth, body: JSON.stringify({ runId, reason }) }),
  };
};

describe("runs over HTTP", () => {
  it("starts a run, keeps it open across a second start and resumes it at the same round", async () => {
    const p = await signIn();
    expect(await p.current()).toBeNull();
    const res = await p.start();
    expect(res.status).toBe(200);
    const { run } = RunStartResponse.parse(await res.json());
    expect(run).toMatchObject({ hero, round: 1, wins: 0, lives: data.rules.lives });
    expect(RunStartResponse.parse(await (await p.start()).json()).run).toEqual(run);
    expect(await p.current()).toEqual(run);
  });

  it("ends a run the app has no copy of and books it once", async () => {
    const p = await signIn();
    const { run } = RunStartResponse.parse(await (await p.start()).json());
    const a = await p.finish(run.runId, "no_local_copy");
    expect(a.status).toBe(200);
    const first = RunFinishResponse.parse(await a.json());
    expect(first.result).toMatchObject({ runId: run.runId, roundsPlayed: 0, wins: 0 });
    expect(first.profile.runs).toBe(p.profile.runs + 1);
    const again = RunFinishResponse.parse(await (await p.finish(run.runId, "no_local_copy")).json());
    expect(again).toEqual(first);
    expect(await p.current()).toBeNull();
  });

  it("refuses another simulation version and a finish for an unknown run", async () => {
    const p = await signIn();
    const old = await p.start("0.0000");
    expect(old.status).toBe(426);
    expect(await old.json()).toEqual({ error: "update_required" });
    expect((await p.finish("nope", "gave_up")).status).toBe(409);
  });
});
