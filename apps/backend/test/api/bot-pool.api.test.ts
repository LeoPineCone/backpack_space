import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { DynamoBackpackPool, documentClient } from "../../src/adapters/dynamodb.js";
import type { DomainContext } from "../../src/domain/context.js";
import { findOpponent } from "../../src/domain/matching.js";
import { defaultSettings, fakePorts } from "../../src/fakes/index.js";
import { BotNames, buckets, replaceBotPool, seedPool } from "../../src/seed/bot-pool.js";
import { createTables, localClient } from "../../local/tables.js";

// Only when the tests started their own DynamoDB Local (not against a deployed backend).
const endpoint = inject("dbEndpoint");

describe.skipIf(!endpoint)("bot pool on DynamoDB Local", () => {
  it("is written by the seed step and found by the matching in every bucket", { timeout: 60_000 }, async () => {
    const data = loadGameData();
    const meta = loadMeta(data);
    const names = BotNames.parse(JSON.parse(readFileSync(new URL("../../../../data/bot-names.json", import.meta.url), "utf8")));
    const { entries } = seedPool(data, meta, names, { seed: 3, perBucket: 1, perEasyBucket: 1, playersPerGroup: 4, season: 1, maxLobbies: 4 });
    // its own pool table, so replacing the bots does not race with the runs the other tests play against the server's pool
    const tables = { players: "test-players", backpacks: "test-seed-backpacks", actions: "test-actions" };
    await createTables(localClient(endpoint), tables);
    const values = { ...defaultSettings(), tables };
    const pool = new DynamoBackpackPool(documentClient({ endpoint, region: "local" }), { get: async () => values });
    const r = await replaceBotPool(pool, data, entries, { today: "2026-11-18", seed: 3 });
    expect(r.written).toBe(entries.length);

    const f = fakePorts();
    const ctx: DomainContext = { ports: { ...f.ports, backpacks: pool }, settings: values, events: [] };
    for (const b of buckets(data)) {
      const m = await findOpponent(ctx, { playerId: "me", round: b.round, lives: b.lives, league: 0, met: [] });
      expect(m?.entry).toMatchObject({ origin: "bot", dataVersion: data.dataVersion });
      expect(m?.entry.build.round).toBe(b.round);
    }
    // the seed step run again replaces instead of adding
    expect((await replaceBotPool(pool, data, entries, { today: "2026-11-18", seed: 4 })).removed).toBe(entries.length);
  });
});
