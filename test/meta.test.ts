import { describe, expect, it } from "vitest";
import { addLeaguePoints, bookRun, buildMeta, enterSeason, equip, fitProfile, heroLevel, leagueOf, newProfile, ownsHero, passLevel, patchId, profileLevel, runGalaxies, seasonAt, unlockPremium, type MetaData, type Profile } from "@backpack-space/core";
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
    expect(meta.leagues.seasonDrop).toBe(2);
  });
  it("makes the 4 heroes without a season playable from the start", () => {
    expect(meta.startHeroes).toEqual(data.heroList.map((h) => h.id));
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
    const b = bookRun(meta, p, { hero: "rook", wins: 9, livesLeft: 2, roundsPlayed: 12 });
    expect(b.galaxies).toBe(11);
    expect(runGalaxies(meta, { hero: "rook", wins: 0, livesLeft: -1, roundsPlayed: 4 })).toBe(0);
    expect(b.profile.galaxies).toBe(11);
    expect(b.profile.season.galaxies).toBe(11);
    expect(b.profile.heroXp.rook).toBe(12 * meta.run.heroXp.perRound + 9 * meta.run.heroXp.perWin);
    expect(b.points).toBe(meta.leagues.pointsByWins[9]);
    expect(b.profile.runs).toBe(1);
    // the input profile stays as it was
    expect(p.galaxies).toBe(0);
  });
  it("unlocks hero cosmetics, planet steps and free pass rewards when their thresholds are crossed", () => {
    let p = newProfile(meta);
    const all = [];
    for (let i = 0; i < 40; i++) { const b = bookRun(meta, p, { hero: "venn", wins: 12, livesLeft: 4, roundsPlayed: 12 }); all.push(...b.rewards); p = b.profile; }
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
  it("pays the league patch at the end of a season and starts the next one 2 leagues lower", () => {
    const m = withSeason2();
    let p = newProfile(m);
    p = { ...p, season: { ...p.season, points: per * 5 + 40, peak: 5 } };
    const c = enterSeason(m, p, 2)!;
    expect(c.patch).toBe(patchId(1, m.leagues.ids[5]!));
    expect(c.profile.cosmetics).toContain(c.patch);
    expect(c.league).toEqual([5, 3]);
    expect(c.profile.season).toMatchObject({ id: 2, galaxies: 0, premium: false, points: per * 3, peak: 3 });
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
});

describe("stored profiles", () => {
  it("drop cosmetics that no longer exist and fall back to the start background", () => {
    const p = newProfile(meta);
    const stored = { ...p, cosmetics: [...p.cosmetics, "bg_gone"], equipped: { background: "bg_gone", patch: "patch_gone" } } as Profile;
    const f = fitProfile(meta, JSON.parse(JSON.stringify(stored)))!;
    expect(f.cosmetics).not.toContain("bg_gone");
    expect(f.equipped).toEqual({ background: meta.start.background, patch: null });
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
    expect(equip(meta, p, "background", "bg_ice")).toBeNull();
    expect(equip(meta, p, "patch", "bg_home")).toBeNull();
    expect(equip(meta, p, "background", "bg_home")!.equipped.background).toBe("bg_home");
  });
});
