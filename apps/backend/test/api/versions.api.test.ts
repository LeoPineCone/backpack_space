import { RunCurrentResponse, RunFightResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";
import { startServer } from "../../local/server.js";

// Other deployments against the same DynamoDB Local: only when the tests started their own.
const endpoint = inject("dbEndpoint");
const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };
const data = loadGameData();
const meta = loadMeta(data);
const hero = data.heroList[0]!;
const tables = { players: "test-players", backpacks: "test-backpacks", actions: "test-actions" };
const current = { data, meta };
const nextBuild = (simVersion: string, dataVersion: string) => ({ data: { ...data, simVersion, dataVersion }, meta });
const major = Number(data.dataVersion.split(".")[0]);

const client = (base: string, token: string) => {
  const auth = { ...headers, authorization: `Bearer ${token}` };
  return {
    post: (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) }),
    current: async () => RunCurrentResponse.parse(await (await fetch(`${base}/runs/current`, { headers: auth })).json()),
  };
};
const fightBody = (runId: string, round: number, simVersion: string) => ({
  runId,
  round,
  backpack: { hero: hero.id, round, bags: hero.bags, items: hero.start },
  actions: [],
  simVersion,
});

describe.skipIf(!endpoint)("versions over HTTP (RUN-12, RUN-13)", () => {
  it("a rollout accepts the previous build, any other version gets update_required, and a major change books the open run", async () => {
    const s = await fetch(`${url}/session`, { method: "POST", headers, body: JSON.stringify({ platform: "dev", player: `v-${Date.now().toString(36)}` }) });
    const { token } = SessionResponse.parse(await s.json());
    const now = client(url, token);
    const { run } = RunStartResponse.parse(await (await now.post("/runs", { hero: hero.id, simVersion: data.simVersion })).json());

    // the new deployment carries the new build and the previous one
    const rollout = await startServer(
      { port: 0, dynamodb: { endpoint, region: "local" }, tables },
      { write: () => {} },
      { game: nextBuild("next-sim", data.dataVersion), previousGame: current },
    );
    const major2 = await startServer(
      { port: 0, dynamodb: { endpoint, region: "local" }, tables },
      { write: () => {} },
      { game: nextBuild("major-sim", `${major + 1}.0`) },
    );
    try {
      const r = client(rollout.url, token);
      const a = RunFightResponse.parse(await (await r.post("/runs/fight", fightBody(run.runId, 1, data.simVersion))).json());
      expect((await r.post("/runs/fight", fightBody(run.runId, a.run.round, "next-sim"))).status).toBe(200);
      const old = await r.post("/runs/fight", fightBody(run.runId, a.run.round + 1, "0.0"));
      expect(old.status).toBe(426);
      expect(await old.json()).toEqual({ error: "update_required" });

      // after a data major change the open run is ended and booked as it stands
      const m = client(major2.url, token);
      const cur = await m.current();
      expect(cur.run).toBeNull();
      expect(cur.finished?.result).toMatchObject({ runId: run.runId, roundsPlayed: 2 });
    } finally {
      await rollout.close();
      await major2.close();
    }
  });
});
