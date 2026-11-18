import { playerName } from "@backpack-space/core";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { DomainContext } from "../src/domain/context.js";
import { bucketKey, dataMajor, findOpponent, type PoolEntry } from "../src/domain/matching.js";
import { fakePorts } from "../src/fakes/index.js";
import { BotNames, buckets, replaceBotPool, seedPool, type SeedEntry } from "../src/seed/bot-pool.js";

const data = loadGameData();
const meta = loadMeta(data);
const names = BotNames.parse(JSON.parse(readFileSync(new URL("../../../data/bot-names.json", import.meta.url), "utf8")));
const PER = 2;

let gen: ReturnType<typeof seedPool>;
beforeAll(() => {
  gen = seedPool(data, meta, names, { seed: 7, perBucket: PER, perEasyBucket: 1, playersPerGroup: 6, season: 1, maxLobbies: 6 });
});

const byBucket = (entries: SeedEntry[], tier: string) => {
  const m = new Map<string, SeedEntry[]>();
  for (const e of entries.filter((x) => x.tier === tier)) m.set(`${e.round}/${e.lives}`, [...(m.get(`${e.round}/${e.lives}`) ?? []), e]);
  return m;
};

describe("bot pool generation", () => {
  it("has 42 buckets: 12 rounds, the standings each round can have", () => {
    expect(buckets(data)).toHaveLength(42);
  });

  it("fills every bucket of both tiers with the asked number of backpacks", () => {
    const bot = byBucket(gen.entries, "bot");
    const easy = byBucket(gen.entries, "easy");
    for (const b of buckets(data)) {
      expect(bot.get(`${b.round}/${b.lives}`)).toHaveLength(PER);
      expect(easy.get(`${b.round}/${b.lives}`)).toHaveLength(1);
    }
    for (const e of gen.entries) expect(e.build.round).toBe(e.round);
  });

  it("makes bot players with valid, distinct names, a league inside their group and a real patch", () => {
    const seen = new Set<string>();
    for (const p of gen.players) {
      expect(playerName(p.name)).toBe(p.name);
      expect(seen.has(p.name)).toBe(false);
      seen.add(p.name);
      expect(meta.cosmeticById.get(p.patch)?.kind).toBe("patch");
    }
    for (const g of meta.leagues.groups.keys()) expect(gen.players.some((p) => p.group === g && p.skill !== "easy")).toBe(true);
    expect(gen.entries.filter((e) => e.tier === "easy").every((e) => e.owner.skill === "easy")).toBe(true);
  });

  it("is the same for the same seed", () => {
    const again = seedPool(data, meta, names, { seed: 7, perBucket: PER, perEasyBucket: 1, playersPerGroup: 6, season: 1, maxLobbies: 6 });
    expect(again.entries.map((e) => [e.owner.id, e.round, e.lives])).toEqual(gen.entries.map((e) => [e.owner.id, e.round, e.lives]));
  });
});

describe("writing the bot pool", () => {
  it("replaces old bot backpacks, keeps player backpacks, and the easy tier goes to new players", async () => {
    const f = fakePorts();
    const pool = f.ports.backpacks as unknown as { items: Map<string, PoolEntry> };
    const major = dataMajor(data.dataVersion);
    await f.ports.backpacks.put({ pk: bucketKey("bot", major, 1, 4), sk: "G00#00000000#old" });
    await f.ports.backpacks.put({ pk: bucketKey("player", major, 1, 4), sk: "G00#00000000#mine" });
    const r = await replaceBotPool(f.ports.backpacks, data, gen.entries, { today: "2026-11-18", seed: 7 });
    expect(r).toEqual({ removed: 1, written: gen.entries.length });
    const items = [...pool.items.values()];
    expect(items.some((i) => i.sk.endsWith("#old"))).toBe(false);
    expect(items.some((i) => i.sk.endsWith("#mine"))).toBe(true);
    expect(items.filter((i) => i.origin === "easy")).toHaveLength(gen.entries.filter((e) => e.tier === "easy").length);

    const ctx: DomainContext = { ports: f.ports, settings: await f.ports.settings.get(), events: [] };
    for (const b of buckets(data)) {
      const req = { playerId: "me", round: b.round, lives: b.lives, league: 0, met: [] };
      expect((await findOpponent(ctx, { ...req, newPlayer: true }))?.entry.origin).toBe("easy");
      expect((await findOpponent(ctx, req))?.entry).toMatchObject({ origin: "bot", dataVersion: data.dataVersion, at: "2026-11-18" });
    }
    // a second run of the command replaces, it does not add
    const again = await replaceBotPool(f.ports.backpacks, data, gen.entries, { today: "2026-11-19", seed: 8 });
    expect(again.removed).toBe(gen.entries.length);
    expect(pool.items.size).toBe(gen.entries.length + 1);
  });

  it("has a matching easy-runs setting in the meta data", () => {
    expect(meta.matching.easyRuns).toBeGreaterThanOrEqual(2);
  });
});
