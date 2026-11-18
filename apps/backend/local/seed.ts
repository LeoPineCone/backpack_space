/**
 * `npm run seed` (DEV-06): fills the opponent pool with bot backpacks played by the core's bots and replaces the bot
 * backpacks that were there (player backpacks stay). A command, not a deployment: bot backpacks can be replaced without
 * an app update.
 *
 *   npm run seed                      a small set for local and test (5 per bucket)
 *   npm run seed -- --launch          the launch set: 50 per round and run standing (2,100), plus the easy tier
 *   npm run seed -- --per 10 --seed 3 own size and seed
 *   npm run seed -- --dry             only generate and count, write nothing
 */
import { readFileSync } from "node:fs";
import { loadGameData, loadMeta, loadRatings } from "@backpack-space/core/node";
import { DynamoBackpackPool, documentClient } from "../src/adapters/dynamodb.js";
import { isoDay } from "../src/domain/config.js";
import { BotNames, buckets, replaceBotPool, seedPool } from "../src/seed/bot-pool.js";
import { loadLocalSettings, toSettingsValues } from "./settings.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};

const data = loadGameData();
const meta = loadMeta(data);
const names = BotNames.parse(JSON.parse(readFileSync(new URL("../../../data/bot-names.json", import.meta.url), "utf8")));
const { values } = loadLocalSettings();
const perBucket = value("per") ?? (flag("launch") ? 50 : 5);
const seed = value("seed") ?? 1;
const started = Date.now();
const { players, entries } = seedPool(data, meta, names, {
  seed,
  perBucket,
  playersPerGroup: flag("launch") ? 50 : 8,
  season: values.season.id,
  ratings: loadRatings(),
});
const tiers = (t: string) => entries.filter((e) => e.tier === t).length;
console.log(
  `Generated ${entries.length} bot backpacks (${tiers("bot")} normal, ${tiers("easy")} easy, ${entries.filter((e) => e.borrowed).length} borrowed from a near standing) of ${players.length} bot players over ${buckets(data).length} buckets in ${((Date.now() - started) / 1000).toFixed(1)} s.`,
);
if (flag("dry")) process.exit(0);

const settings = toSettingsValues(values);
const pool = new DynamoBackpackPool(documentClient(values.dynamodb), { get: async () => settings });
const r = await replaceBotPool(pool, data, entries, { today: isoDay(Date.now()), seed });
console.log(`Pool ${settings.tables.backpacks}: removed ${r.removed} old bot backpacks, wrote ${r.written}.`);
