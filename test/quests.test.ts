import { describe, expect, it } from "vitest";
import { bookRun, finishRound, newProfile, newRun, questData, questRule, questsOn, reroll, weekOf, type QuestRule } from "@backpack-space/core";
import { loadGameData, loadMeta } from "@backpack-space/core/node";

const data = loadGameData();
const meta = loadMeta(data);
const q = meta.quests;
const rule = (id: string): QuestRule => q.rules.find((r) => r.id === id)!;
const hero = data.heroList[0]!.id;

describe("quest rules change only the rules of the run (CORE-07)", () => {
  it("a short flight has fewer rounds and lives, and ends after its last round", () => {
    const d = questData(data, rule("shortFlight"));
    const run = newRun(d, hero, 7);
    expect(run.lives).toBe(2);
    for (let i = 0; i < 6; i++) finishRound(run, d, true);
    expect(run.over).toBe(true);
    expect(run.results).toHaveLength(6);
  });

  it("one shot: the first lost fight ends the run", () => {
    const d = questData(data, rule("oneShot"));
    const run = newRun(d, hero, 7);
    finishRound(run, d, true);
    finishRound(run, d, false);
    expect(run.over).toBe(true);
  });

  it("gold rain pays more gold every round", () => {
    const normal = newRun(data, hero, 7);
    const rich = newRun(questData(data, rule("goldRain")), hero, 7);
    expect(rich.gold - normal.gold).toBe(rule("goldRain").goldBonus);
  });

  it("no reroll refuses every reroll, even with gold", () => {
    const d = questData(data, rule("noReroll"));
    const run = newRun(d, hero, 7);
    run.gold = 100;
    expect(reroll(run, d)).toBe(false);
    expect(run.gold).toBe(100);
    expect(reroll(newRun(data, hero, 7), data)).toBe(true);
  });

  it("far light offers the rarities of later rounds", () => {
    const d = questData(data, rule("farLight"));
    const ahead = rule("farLight").rarityAhead!;
    expect(d.rules.shop.rarityOdds[0]).toEqual(data.rules.shop.rarityOdds[ahead]);
    expect(d.rules.shop.rarityOdds.at(-1)).toEqual(data.rules.shop.rarityOdds.at(-1));
  });

  it("no gifts: no free pick after any round", () => {
    const d = questData(data, rule("noGifts"));
    const run = newRun(d, hero, 7);
    for (let i = 0; i < 7; i++) {
      finishRound(run, d, true);
      expect(run.special).toBeNull();
    }
  });

  it("early nova shortens every phase of the star clock", () => {
    const d = questData(data, rule("earlyNova"));
    expect(d.rules.battle.phases.every((p) => p.seconds === rule("earlyNova").phaseSeconds)).toBe(true);
    expect(data.rules.battle.phases.every((p) => p.seconds > rule("earlyNova").phaseSeconds!)).toBe(true);
  });

  it("leaves the game data itself as it was", () => {
    const before = JSON.stringify(data.rules);
    for (const r of q.rules) questData(data, r);
    expect(JSON.stringify(data.rules)).toBe(before);
  });
});

describe("which quests are open (META-06)", () => {
  it("gives the dailies of the day and the weeklies of its week, the same on every call", () => {
    const qs = questsOn(q, "2026-11-18");
    expect(qs.filter((x) => x.kind === "daily")).toHaveLength(q.perDay);
    expect(qs.filter((x) => x.kind === "weekly")).toHaveLength(q.perWeek);
    expect(new Set(qs.filter((x) => x.kind === "daily").map((x) => x.rule)).size).toBe(q.perDay);
    expect(questsOn(q, "2026-11-18")).toEqual(qs);
    for (const x of qs) {
      expect(x.id).toBe(`${x.kind[0]}${x.period}:${x.rule}`);
      expect(questRule(q, x.id)?.id).toBe(x.rule);
      expect(q[x.kind]).toContain(x.rule);
    }
  });

  it("keeps the weekly through its week and changes the dailies from day to day", () => {
    expect(weekOf("2026-11-18")).toBe("2026-11-16");
    expect(weekOf("2026-11-16")).toBe("2026-11-16");
    expect(weekOf("2026-11-22")).toBe("2026-11-16");
    expect(weekOf("2026-11-23")).toBe("2026-11-23");
    const week = ["16", "17", "18", "19", "20", "21", "22"].map((d) => questsOn(q, `2026-11-${d}`));
    const weekly = week.map((qs) => qs.filter((x) => x.kind === "weekly"));
    expect(weekly.every((w) => JSON.stringify(w) === JSON.stringify(weekly[0]))).toBe(true);
    const dailies = new Set(
      week.map((qs) =>
        qs
          .filter((x) => x.kind === "daily")
          .map((x) => x.rule)
          .join(),
      ),
    );
    expect(dailies.size).toBeGreaterThan(1);
  });
});

describe("booking a quest run", () => {
  it("pays Galaxies and hero XP like a run, but no league points", () => {
    const p = newProfile(meta);
    const summary = { hero, wins: 9, livesLeft: 1, roundsPlayed: 12 };
    const normal = bookRun(meta, p, summary);
    const quest = bookRun(meta, p, summary, { quest: true });
    expect(quest.galaxies).toBe(normal.galaxies);
    expect(quest.xp).toBe(normal.xp);
    expect(normal.points).toBeGreaterThan(0);
    expect(quest.points).toBe(0);
    expect(quest.profile.season.points).toBe(p.season.points);
  });
});

describe("week of a day", () => {
  it("is the Monday before or on it, across months and years", () => {
    expect(weekOf("2026-12-02")).toBe("2026-11-30");
    expect(weekOf("2027-01-01")).toBe("2026-12-28");
    expect(weekOf("2028-03-01")).toBe("2028-02-28");
  });
});
