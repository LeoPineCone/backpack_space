import { describe, expect, it } from "vitest";
import { addHeroXp, addLeaguePoints, bookRun, heroLevelRewards, heroRewardId, isEliteLeague, runHeroXp, buildMeta, enterSeason, equip, equipSkin, fitProfile, rename, playerName, heroLevel, heroCosmeticId, leagueGroup, rewardTrack, seasonStartLeague, leagueOf, newProfile, ownsHero, passGalaxies, passLevel, patchId, profileLevel, runGalaxies, seasonAt, unlockPremium, type MetaData, type Profile } from "@backpack-space/core";
import { loadGameData, loadMeta } from "@backpack-space/core/node";

const data = loadGameData();
const meta = loadMeta(data);
const per = meta.leagues.pointsPerLeague;

/** meta.json with a second season that brings a hero (the first of heroes.json stands in for it) */
function withSeason2(): ReturnType<typeof buildMeta> {
  const raw = JSON.parse(JSON.stringify({ ...meta, cosmeticById: undefined, startHeroes: undefined })) as MetaData;
  const hero = data.heroList[0]!.id;
  raw.seasons.push({ id: 2, start: "2027-02-01", hero, pass: { galaxiesPerLevel: 10, levels: [{ premium: { hero } }, { free: { credits: 5 } }] } });
  return buildMeta(raw, data);
}

describe("meta data", () => {
  it("loads data/meta.json and gives every hero its level cosmetics and every league a patch per season", () => {
    for (const h of data.heroList) for (const lv of meta.heroLevels.cosmeticAt) expect(meta.cosmeticById.get(`${h.id}_lv${lv}`)?.kind).toBe("heroCosmetic");
    for (const l of meta.leagues.ids) expect(meta.cosmeticById.get(patchId(1, l))?.kind).toBe("patch");
    expect(meta.leagues.ids).toHaveLength(10);
    expect(meta.leagues.groups).toEqual([2, 3, 3, 2]);
  });
  it("makes the 4 heroes without a season playable from the start", () => {
    expect(meta.startHeroes).toEqual(data.heroList.map((h) => h.id));
  });
  it("puts the 10 leagues into 4 groups (docs/matchmaking.md): Amateur 2, Intermediate 3, Pro 3, Elite 2", () => {
    expect(meta.leagues.ids.map((_, l) => leagueGroup(meta, l).group)).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3]);
    expect(leagueGroup(meta, 6)).toEqual({ group: 2, from: 5, to: 7 });
    expect(() => leagueGroup(meta, 10)).toThrow();
    const raw = JSON.parse(JSON.stringify({ ...meta, cosmeticById: undefined, startHeroes: undefined })) as MetaData;
    raw.leagues.groups = [5, 4];
    expect(() => buildMeta(raw, data)).toThrow(/groups must add up/);
  });
  it("rejects a season hero the premium pass does not give at level 1", () => {
    const raw = JSON.parse(JSON.stringify({ ...meta, cosmeticById: undefined, startHeroes: undefined })) as MetaData;
    raw.seasons.push({ id: 2, start: "2027-02-01", hero: data.heroList[0]!.id, pass: { galaxiesPerLevel: 10, levels: [{ free: { credits: 5 } }] } });
    expect(() => buildMeta(raw, data)).toThrow(/premium pass must give/);
  });
});

describe("after a run", () => {
  it("pays Galaxies = wins + lives left, hero XP and league points", () => {
    const p = newProfile(meta);
    const b = bookRun(meta, p, { hero: "rook", wins: 9, livesLeft: 2, roundsPlayed: 12, completed: true });
    expect(b.galaxies).toBe(11);
    expect(runGalaxies(meta, { hero: "rook", wins: 0, livesLeft: -1, roundsPlayed: 4, completed: false })).toBe(0);
    expect(b.profile.galaxies).toBe(11);
    expect(b.profile.season.galaxies).toBe(11);
    expect(b.profile.heroXp.rook).toBe(12 * meta.run.heroXp.perRound + meta.run.heroXp.completedBonus);
    expect(b.points).toBe(meta.leagues.pointsByWins[9]);
    expect(b.profile.runs).toBe(1);
    // the input profile stays as it was
    expect(p.galaxies).toBe(0);
  });
  it("prices pass levels: the first levels as listed, then flat", () => {
    const pass = { galaxiesPerLevel: 20, firstLevels: [10, 10, 10, 10] };
    expect([1, 2, 5, 6, 50].map((l) => passGalaxies(pass, l))).toEqual([0, 10, 40, 60, 940]);
    expect(passGalaxies({ galaxiesPerLevel: 10 }, 3)).toBe(20);
    const s = meta.seasons[0]!;
    expect(passLevel(meta, { id: s.id, galaxies: 39 })).toBe(4);
    expect(passLevel(meta, { id: s.id, galaxies: 40 })).toBe(5);
    expect(passLevel(meta, { id: s.id, galaxies: 10_000 })).toBe(s.pass.levels.length);
  });
  it("unlocks hero cosmetics, planet steps and free pass rewards when their thresholds are crossed", () => {
    let p = newProfile(meta);
    const all = [];
    for (let i = 0; i < 60; i++) { const b = bookRun(meta, p, { hero: "venn", wins: 12, livesLeft: 4, roundsPlayed: 12, completed: true }); all.push(...b.rewards); p = b.profile; }
    const lv = heroLevel(meta, p.heroXp.venn!).level;
    for (const at of meta.heroLevels.cosmeticAt.filter((l) => l <= lv)) expect(p.cosmetics).toContain(`venn_lv${at}`);
    for (const s of meta.planetTrack.filter((s) => s.galaxies <= p.galaxies)) if ("cosmetic" in s.reward) expect(p.cosmetics).toContain(s.reward.cosmetic);
    expect(passLevel(meta, p.season)).toBe(meta.seasons[0]!.pass.levels.length);
    // premium rewards wait for the premium pass
    for (const l of meta.seasons[0]!.pass.levels) if (l.premium && "cosmetic" in l.premium) expect(p.cosmetics).not.toContain(l.premium.cosmetic);
    const u = unlockPremium(meta, p);
    for (const l of meta.seasons[0]!.pass.levels) if (l.premium && "cosmetic" in l.premium) expect(u.profile.cosmetics).toContain(l.premium.cosmetic);
    expect(unlockPremium(meta, u.profile).rewards).toEqual([]);
    // every reward is handed out once
    const ids = all.flatMap((r) => ("cosmetic" in r ? [r.cosmetic] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("counts hero levels from the XP table", () => {
    expect(heroLevel(meta, 0)).toMatchObject({ level: 1, into: 0, need: meta.heroLevels.xp[0] });
    expect(heroLevel(meta, meta.heroLevels.xp[0]!).level).toBe(2);
    expect(heroLevel(meta, 1e9)).toMatchObject({ level: meta.heroLevels.xp.length + 1, need: 0 });
  });
});

describe("leagues", () => {
  it("climbs with points and never drops below the highest league reached", () => {
    let s = { points: 0, peak: 0 };
    s = addLeaguePoints(meta, s, -50);
    expect(s).toEqual({ points: 0, peak: 0 });
    s = addLeaguePoints(meta, s, per * 2 + 30);
    expect(leagueOf(meta, s.points)).toBe(2);
    expect(s.peak).toBe(2);
    s = addLeaguePoints(meta, s, -20);
    expect(s.points).toBe(per * 2 + 10); // points inside a league can be lost
    s = addLeaguePoints(meta, s, -100);
    expect(s.points).toBe(per * 2); // but not the league
    expect(leagueOf(meta, 1e9)).toBe(meta.leagues.ids.length - 1);
  });
  it("starts a new season in the highest league of the next lower group; Amateur stays", () => {
    // leagues from the lowest: Amateur 0-1, Intermediate 2-4, Pro 5-7, Elite 8-9 (league 10 ... league 1)
    const start = [0, 1, 1, 1, 1, 4, 4, 4, 7, 7];
    expect(start.map((_, l) => seasonStartLeague(meta, l))).toEqual(start);
    for (let l = 0; l < start.length; l++) {
      const { group } = leagueGroup(meta, l);
      const after = seasonStartLeague(meta, l);
      // never up; one group down, except in the lowest group
      expect(after).toBeLessThanOrEqual(l);
      expect(leagueGroup(meta, after).group).toBe(Math.max(0, group - 1));
      if (group > 0) expect(leagueGroup(meta, after).to).toBe(after);
    }
  });
  it("pays the league patch at the end of a season and starts the next one a group lower", () => {
    const m = withSeason2();
    let p = newProfile(m);
    p = { ...p, season: { ...p.season, points: per * 5 + 40, peak: 5 } };
    const c = enterSeason(m, p, 2)!;
    expect(c.patch).toBe(patchId(1, m.leagues.ids[5]!));
    expect(c.profile.cosmetics).toContain(c.patch);
    expect(c.league).toEqual([5, 4]);
    expect(c.profile.season).toMatchObject({ id: 2, galaxies: 0, premium: false, points: per * 4, peak: 4 });
    const elite = enterSeason(m, { ...p, season: { ...p.season, points: per * 9, peak: 9 } }, 2)!;
    expect(elite.league).toEqual([9, 7]);
    const amateur = enterSeason(m, { ...p, season: { ...p.season, points: per * 1 + 30, peak: 1 } }, 2)!;
    expect(amateur.league).toEqual([1, 1]);
    expect(amateur.profile.season).toMatchObject({ points: per, peak: 1 });
    expect(enterSeason(m, c.profile, 2)).toBeNull();
    expect(enterSeason(m, newProfile(m), 2)!.league).toEqual([0, 0]);
    // the patch can be worn on the profile
    const worn = equip(m, c.profile, "patch", c.patch)!;
    expect(worn.equipped.patch).toBe(c.patch);
    expect(equip(m, c.profile, "patch", patchId(1, m.leagues.ids[9]!))).toBeNull();
  });
  it("finds the season of a date", () => {
    const m = withSeason2();
    expect(seasonAt(m, "2026-10-01")).toBe(1);
    expect(seasonAt(m, "2027-01-31")).toBe(1);
    expect(seasonAt(m, "2027-02-01T10:00:00Z")).toBe(2);
  });
});

describe("reward tracks", () => {
  it("names the track a booked reward comes from", () => {
    expect(rewardTrack(meta, { cosmetic: heroCosmeticId(meta.startHeroes[0]!, meta.heroLevels.cosmeticAt[0]!) })).toBe("level");
    for (const step of meta.planetTrack) expect(rewardTrack(meta, step.reward)).toBe("planet");
    const pass = meta.seasons[0]!.pass.levels.flatMap((l) => [l.free, l.premium]).find((r) => r && "cosmetic" in r)!;
    expect(rewardTrack(meta, pass)).toBe("pass");
  });
});

describe("hero levels", () => {
  const t = meta.heroLevels.xp;
  const top = t.length + 1, last = top - meta.heroLevels.eliteLevels;
  const capNormal = t[last - 2]!;
  const run = (o: Partial<{ roundsPlayed: number; completed: boolean }> = {}) => ({ hero: "venn", wins: 6, livesLeft: 1, roundsPlayed: 12, completed: false, ...o });
  /** a profile in a league (0 = the lowest) with some XP on venn */
  const at = (league: number, xp: number): Profile => {
    const p = newProfile(meta);
    p.season.points = league * per;
    p.season.peak = league;
    p.heroXp.venn = xp;
    return p;
  };
  const elite = meta.leagues.ids.length - 1;

  it("pay XP per round played, wins do not count, a completed run gets the bonus", () => {
    expect(runHeroXp(meta, run({ roundsPlayed: 7 }))).toBe(7 * meta.run.heroXp.perRound);
    expect(runHeroXp(meta, { ...run({ roundsPlayed: 7 }), wins: 0 })).toBe(runHeroXp(meta, run({ roundsPlayed: 7 })));
    expect(runHeroXp(meta, run({ completed: true }))).toBe(12 * meta.run.heroXp.perRound + meta.run.heroXp.completedBonus);
  });
  it("get early levels fast and later ones slower; the top 3 are Elite levels", () => {
    const steps = t.map((x, i) => x - (i ? t[i - 1]! : 0));
    expect(top).toBe(23);
    expect(last).toBe(20);
    expect(heroLevel(meta, 0).eliteFrom).toBe(21);
    // the shortest run (4 lost rounds) already reaches level 2
    expect(heroLevel(meta, runHeroXp(meta, run({ roundsPlayed: 4 }))).level).toBe(2);
    for (let i = 1; i < last - 1; i++) expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
  });
  it("stop at level 20 outside the Elite league group; what goes past is lost", () => {
    expect(isEliteLeague(meta, elite)).toBe(true);
    expect(isEliteLeague(meta, elite - meta.leagues.groups.at(-1)!)).toBe(false);
    expect(addHeroXp(meta, capNormal - 100, 5000, false)).toBe(capNormal);
    expect(addHeroXp(meta, capNormal, 5000, false)).toBe(capNormal);
    expect(addHeroXp(meta, capNormal, 5000, true)).toBe(capNormal + 5000);
    expect(addHeroXp(meta, t.at(-1)! - 10, 5000, true)).toBe(t.at(-1)!);
    const b = bookRun(meta, at(0, capNormal - 100), run({ completed: true }));
    expect(b.xp).toBe(100);
    expect(b.level).toEqual([last - 1, last]);
    expect(bookRun(meta, at(0, capNormal), run()).xp).toBe(0);
  });
  it("fill the Elite levels only with ranked runs played in the Elite league group, never with quests", () => {
    const p = at(elite, capNormal);
    const ranked = bookRun(meta, p, run({ completed: true }));
    expect(ranked.xp).toBe(runHeroXp(meta, run({ completed: true })));
    expect(bookRun(meta, p, run({ completed: true }), { quest: "d2026-11-19:goldRain" }).xp).toBe(0);
    // a quest still levels a hero below level 20
    expect(bookRun(meta, at(elite, 0), run(), { quest: "d2026-11-19:goldRain" }).xp).toBe(runHeroXp(meta, run()));
    // the league counts as it was when the run was played: a run that brings the player into Elite fills nothing yet
    const below = at(elite - meta.leagues.groups.at(-1)!, capNormal);
    below.season.points = below.season.points + per - 1;
    expect(bookRun(meta, below, { ...run({ completed: true }), wins: 12 }).xp).toBe(0);
  });
  it("give skin, pin and frame at level 20 and a pin and a title at each Elite level", () => {
    expect(heroLevelRewards(meta, "venn", last - 1, last)).toEqual(["skin", "pin", "frame"].map((k) => ({ cosmetic: heroRewardId("venn", last, k) })));
    for (let lv = last + 1; lv <= top; lv++) expect(heroLevelRewards(meta, "venn", lv - 1, lv)).toEqual(["pin", "title"].map((k) => ({ cosmetic: heroRewardId("venn", lv, k) })));
    const title = heroRewardId("venn", top, "title");
    expect(meta.cosmeticById.get(title)).toMatchObject({ kind: "title", hero: "venn", level: top });
    expect(rewardTrack(meta, { cosmetic: title })).toBe("level");
    expect(meta.cosmeticById.get(heroRewardId("venn", last, "skin"))?.kind).toBe("skin");
    const b = bookRun(meta, at(elite, t.at(-2)!), run({ completed: true, roundsPlayed: 12 }));
    expect(b.rewards).toEqual([]);
  });
  it("let the player wear an owned title and take it off", () => {
    const title = heroRewardId("venn", last + 1, "title");
    const p = newProfile(meta);
    expect(equip(meta, p, "title", title)).toBeNull();
    p.cosmetics.push(title);
    const q = equip(meta, p, "title", title)!;
    expect(q.equipped.title).toBe(title);
    expect(equip(meta, q, "title", null)!.equipped.title).toBeNull();
    expect(equip(meta, p, "title", heroRewardId("venn", last, "pin"))).toBeNull();
  });
});

describe("season heroes", () => {
  it("are owned through the premium pass only", () => {
    const m = withSeason2();
    const hero = m.seasons[1]!.hero!;
    expect(m.startHeroes).not.toContain(hero);
    const p = enterSeason(m, newProfile(m), 2)!.profile;
    expect(ownsHero(m, p, hero)).toBe(false);
    const u = unlockPremium(m, p);
    expect(u.rewards).toContainEqual({ hero });
    expect(ownsHero(m, u.profile, hero)).toBe(true);
  });
  it("level 25 % faster in their season with the premium pass", () => {
    const m = withSeason2();
    const hero = m.seasons[1]!.hero!;
    const r = { hero, wins: 5, livesLeft: 0, roundsPlayed: 8, completed: false };
    const base = 8 * m.run.heroXp.perRound;
    expect(runHeroXp(m, r, { id: 2, premium: false })).toBe(base);
    expect(runHeroXp(m, r, { id: 2, premium: true })).toBe(base * 1.25);
    expect(runHeroXp(m, r, { id: 1, premium: true })).toBe(base);
    expect(runHeroXp(m, { ...r, hero: data.heroList[1]!.id }, { id: 2, premium: true })).toBe(base);
  });
});

describe("stored profiles", () => {
  it("drop cosmetics that no longer exist and fall back to the start background", () => {
    const p = newProfile(meta);
    const stored = { ...p, cosmetics: [...p.cosmetics, "bg_gone"], equipped: { background: "bg_gone", patch: "patch_gone" } } as Profile;
    const f = fitProfile(meta, JSON.parse(JSON.stringify(stored)))!;
    expect(f.cosmetics).not.toContain("bg_gone");
    expect(f.equipped).toEqual({ background: meta.start.background, patch: null, picture: meta.start.picture, grid: null, title: null, skins: {} });
    expect(fitProfile(meta, { nonsense: true })).toBeNull();
  });
  it("keep the player's name and give older profiles the start name", () => {
    const p = newProfile(meta);
    expect(p.name).toBe(meta.start.name);
    const { name: _drop, ...old } = { ...p, name: "Nova" };
    expect(fitProfile(meta, { ...p, name: "Nova" })!.name).toBe("Nova");
    expect(fitProfile(meta, old)!.name).toBe(meta.start.name);
  });
  it("add up the levels of all owned heroes for the profile number", () => {
    const p = newProfile(meta);
    expect(profileLevel(meta, p)).toBe(meta.startHeroes.length);
    const q = { ...p, heroXp: { [meta.startHeroes[0]!]: meta.heroLevels.xp[1]! } };
    expect(profileLevel(meta, q)).toBe(meta.startHeroes.length + heroLevel(meta, meta.heroLevels.xp[1]!).level - 1);
  });
  it("equip only owned cosmetics of the right kind", () => {
    const p = newProfile(meta);
    expect(equip(meta, p, "background", "bg_rime")).toBeNull();
    expect(equip(meta, p, "patch", "bg_home")).toBeNull();
    expect(equip(meta, p, "background", "bg_home")!.equipped.background).toBe("bg_home");
    expect(equip(meta, p, "picture", meta.start.picture)!.equipped.picture).toBe(meta.start.picture);
    expect(equip(meta, p, "picture", "bg_home")).toBeNull();
    // a grid background: only an owned one, and it can be taken off again
    const grid = meta.cosmetics.find((c) => c.kind === "grid")!.id;
    expect(equip(meta, p, "grid", grid)).toBeNull();
    const withGrid = equip(meta, { ...p, cosmetics: [...p.cosmetics, grid] }, "grid", grid)!;
    expect(withGrid.equipped.grid).toBe(grid);
    expect(equip(meta, withGrid, "grid", null)!.equipped.grid).toBeNull();
    expect(equip(meta, p, "background", null)).toBeNull();
    expect(fitProfile(meta, { ...withGrid, cosmetics: p.cosmetics })!.equipped.grid).toBeNull();
  });
  it("put a skin only on its own hero, and only when it is owned", () => {
    const hero = meta.startHeroes[0]!, other = meta.startHeroes[1]!;
    const id = `${hero}_lv${meta.heroLevels.cosmeticAt[0]}`;
    const p = newProfile(meta);
    expect(equipSkin(meta, p, hero, id)).toBeNull();
    const q = { ...p, cosmetics: [...p.cosmetics, id] };
    expect(equipSkin(meta, q, other, id)).toBeNull();
    const worn = equipSkin(meta, q, hero, id)!;
    expect(worn.equipped.skins[hero]).toBe(id);
    expect(equipSkin(meta, worn, hero, null)!.equipped.skins[hero]).toBeUndefined();
    // a stored skin that is no longer owned comes off
    expect(fitProfile(meta, { ...worn, cosmetics: p.cosmetics })!.equipped.skins).toEqual({});
  });
  it("rename the player with a tidied name of 1 to 16 characters", () => {
    const p = newProfile(meta);
    expect(rename(meta, p, "  Star   Rider ")!.name).toBe("Star Rider");
    expect(rename(meta, p, "   ")).toBeNull();
    expect(rename(meta, p, "x".repeat(17))).toBeNull();
    expect(rename(meta, p, "Ä".repeat(16))!.name).toBe("Ä".repeat(16));
  });
  it("refuse offensive and political names in English and German, also disguised", () => {
    const refused = [
      "fuck you", "F.U.C.K", "fuuuck", "sh1t head", "Bitch", "Hurensohn", "Scheiße", "SCHEISSE", "Arschl0ch", "Fotze 99",
      "Wichser", "Hitler", "H1tl3r", "Nazi Pilot", "1488", "Sieg Heil", "KKK", "Trump 2028", "Putin", "AfD", "ss trooper", "cunt", "Hure",
    ];
    for (const n of refused) expect(playerName(meta, n), n).toBeNull();
    // the same letters inside harmless words stay allowed
    const fine = ["Scunthorpe", "Grape Ape", "Dickens", "Peacock", "Heilig", "Classic", "Sassy Star", "Cocktail Moth", "Hureka", "Afdal", "Pilot"];
    for (const n of fine) expect(playerName(meta, n), n).toBe(n);
  });
});
