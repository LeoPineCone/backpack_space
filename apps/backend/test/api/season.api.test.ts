import { SessionResponse } from "@backpack-space/api";
import { buildMeta, patchId, seasonStartLeague, type MetaData } from "@backpack-space/core";
import { describe, expect, inject, it } from "vitest";
import { createApp } from "../../src/app.js";
import { DynamoActionStore, DynamoPlayerStore, documentClient } from "../../src/adapters/dynamodb.js";
import type { DomainContext } from "../../src/domain/context.js";
import { loadProfile, playerKey } from "../../src/domain/players.js";
import { fakePorts, testGame } from "../../src/fakes/index.js";
import { runJob } from "../../src/jobs/index.js";
import { createTables, localClient } from "../../local/tables.js";

// The jobs read whole tables, so this test has tables of its own (only when the tests started their own database).
const endpoint = inject("dbEndpoint");

const { data, meta: meta1 } = testGame();
function withSeason2() {
  const raw = JSON.parse(JSON.stringify({ ...meta1, cosmeticById: undefined, startHeroes: undefined })) as MetaData;
  const hero = data.heroList[0]!.id;
  raw.seasons.push({ id: 2, start: "2027-02-01", hero, pass: { galaxiesPerLevel: 10, levels: [{ premium: { hero } }] } });
  return buildMeta(raw, data);
}

describe.skipIf(!endpoint)("timed jobs on DynamoDB Local (BE-14)", () => {
  it("the season job moves a profile through a season change exactly once, and the actions job deletes expired actions", async () => {
    const suffix = Date.now().toString(36);
    const tables = { players: `jobs-players-${suffix}`, backpacks: `jobs-backpacks-${suffix}`, actions: `jobs-actions-${suffix}` };
    await createTables(localClient(endpoint), tables);
    const f = fakePorts();
    const meta = withSeason2();
    f.settings.values = { ...f.settings.values, tables, season: { id: 2, start: "2027-02-01", end: "2027-04-30" } };
    const doc = documentClient({ endpoint, region: "local" });
    f.ports.players = new DynamoPlayerStore(doc, f.settings);
    f.ports.actions = new DynamoActionStore(doc, f.settings);
    f.ports.game = { data, meta };
    f.clock.ms = Date.parse("2027-01-31T20:00:00Z");

    const app = createApp(f.ports);
    const res = await app({
      method: "POST",
      path: "/session",
      headers: { "x-app-version": "1.0.0" },
      body: JSON.stringify({ platform: "dev", player: "jobs" }),
    });
    const { token, profile } = SessionResponse.parse(JSON.parse(res.body));
    expect(profile.season.id).toBe(1);
    const playerId = f.ports.tokens.check(token, f.settings.values, f.clock.now())!.playerId;
    // the player reached league 5 in season 1
    const head = (await f.ports.players.get(playerKey(playerId), "PROFILE"))!;
    const per = meta.leagues.pointsPerLeague;
    await f.ports.players.transact([{ put: { ...head, season: { ...(head.season as object), points: 5 * per, peak: 5 } } }]);

    f.clock.ms = Date.parse("2027-02-01T00:10:00Z");
    expect(await runJob(f.ports, "season")).toEqual({ job: "season", seen: 1, changed: 1 });
    const ctx: DomainContext = { ports: f.ports, settings: f.settings.values, events: [] };
    const after = (await loadProfile(ctx, playerId))!;
    const drop = seasonStartLeague(meta, 5);
    expect(after.profile.season).toMatchObject({ id: 2, points: drop * per, peak: drop });
    expect(after.profile.cosmetics).toContain(patchId(1, meta.leagues.ids[5]!));
    expect((await f.ports.players.get(playerKey(playerId), `OWN#${patchId(1, meta.leagues.ids[5]!)}`))?.origin).toBe("league");

    // a second run changes nothing
    expect(await runJob(f.ports, "season")).toEqual({ job: "season", seen: 1, changed: 0 });
    expect((await loadProfile(ctx, playerId))!.version).toBe(after.version);

    const nowSec = Math.floor(f.clock.now() / 1000);
    await f.ports.actions.put({ pk: "RUN#old", sk: "R01", expiresAt: nowSec - 60 });
    await f.ports.actions.put({ pk: "RUN#new", sk: "R01", expiresAt: nowSec + 60 });
    expect(await runJob(f.ports, "actions")).toEqual({ job: "actions", seen: 1, changed: 1 });
    expect(await runJob(f.ports, "actions")).toEqual({ job: "actions", seen: 0, changed: 0 });
  });
});
