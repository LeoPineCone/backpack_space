/**
 * Players and their profile in the table `players` (docs/backend.md):
 *   ID#<platform>#<storeId> / PLAYER   the lookup from store identity to player id (ACC-03)
 *   P#<playerId> / PROFILE             name, Galaxies, hero XP, equipped things, season state, runs, version
 *   P#<playerId> / OWN#<thing>         one entry per owned cosmetic or hero, with origin and date
 *   P#<playerId> / IDENTITY            the key of the lookup above, so that deleting the account removes it (ACC-08)
 * The profile the app gets is put together from PROFILE and the OWN# entries. No Credits: they live at RevenueCat.
 */
import type { ProfileBody } from "@backpack-space/api";
import { enterSeason, newProfile } from "@backpack-space/core";
import type { CheckedIdentity, Item, Write } from "../ports/index.js";
import type { DomainContext } from "./context.js";
import { isoDay } from "./config.js";
import { logEvent } from "./log.js";
import { seasonNow } from "./season.js";

export const playerKey = (playerId: string) => `P#${playerId}`;
export const identityKey = (id: CheckedIdentity) => `ID#${id.platform}#${id.storeId}`;
const OWN = "OWN#";

/**
 * Where an owned thing came from (STORE-04): a booked run unlocks it by a hero level, the planet track or the season
 * pass (META-01); a season change hands out the league patch (META-03); the store adds Credits and purchases. A refund
 * removes exactly the entries of its origin.
 */
export type Origin = "start" | "pass" | "level" | "planet" | "league" | "credits" | "purchase";

/** The stored profile: the PROFILE item and the owned things, with its version number. */
export interface StoredProfile {
  profile: ProfileBody;
  /** counts every write of PROFILE; a write only succeeds on the version it read */
  version: number;
  /** milliseconds since 1970 */
  createdAt: number;
}

/** The partition item that names the store lookup of a player. */
export const IDENTITY = "IDENTITY";

/**
 * The player id of a store identity, made (with a new profile) at the first sign-in. A lookup whose player is gone (a
 * deleted account the lookup of which survived, ACC-08) counts as none: the identity gets a new player.
 */
export async function findOrCreatePlayer(ctx: DomainContext, identity: CheckedIdentity): Promise<{ playerId: string; created: boolean }> {
  const { players, random, clock } = ctx.ports;
  const lookup = await players.get(identityKey(identity), "PLAYER");
  if (lookup && (await players.get(playerKey(String(lookup.playerId)), "PROFILE"))) return { playerId: String(lookup.playerId), created: false };

  const playerId = random.id();
  const now = clock.now();
  const profile = startProfile(ctx);
  const writes: Write[] = [
    // a lookup of a gone player is replaced; otherwise only the first of two sign-ins at the same time writes one
    { put: { pk: identityKey(identity), sk: "PLAYER", playerId, createdAt: now }, ...(lookup ? {} : { ifNotExists: true }) },
    { put: { pk: playerKey(playerId), sk: IDENTITY, lookup: identityKey(identity) }, ifNotExists: true },
    ...profileWrites(playerId, profile, { version: 0, createdAt: now }, now, "start"),
  ];
  if (await players.transact(writes)) return { playerId, created: true };
  // two first sign-ins at the same time: the other one won, use its player
  const winner = await players.get(identityKey(identity), "PLAYER");
  if (!winner) throw new Error("player lookup missing after a failed first sign-in");
  return { playerId: String(winner.playerId), created: false };
}

/** A new profile as the core makes it (lowest league, 0 points), for the season running now. */
export function startProfile(ctx: DomainContext): ProfileBody {
  const meta = ctx.ports.game.meta;
  const { credits: _credits, ...profile } = newProfile(meta, seasonNow(meta, ctx.settings, ctx.ports.clock.now()).id);
  return profile;
}

/**
 * The player's profile, in the season running now: a profile of an earlier season is moved into it first and stored
 * (a player who was away gets the season change when they next appear, META-03).
 */
export async function loadProfile(ctx: DomainContext, playerId: string): Promise<StoredProfile | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = assemble(await ctx.ports.players.query(playerKey(playerId)));
    if (!stored) return null;
    const moved = await catchUpSeason(ctx, playerId, stored);
    if (moved) return moved;
    // another request wrote the profile in between: read again
  }
  throw new Error("season change kept colliding");
}

/**
 * Moves a stored profile into the season running now and stores it on the version it read. Returns the profile as
 * it is now (unchanged when it is already in this season), or null when another write came first. Doing it twice
 * changes nothing the second time: the profile is then already in the season.
 */
export async function catchUpSeason(ctx: DomainContext, playerId: string, stored: StoredProfile): Promise<StoredProfile | null> {
  const { game, clock } = ctx.ports;
  const now = clock.now();
  const season = seasonNow(game.meta, ctx.settings, now).id;
  // the core's profile carries Credits; on the server they live at RevenueCat
  const change = enterSeason(game.meta, { ...stored.profile, credits: 0 }, season);
  if (!change) return stored;
  const { credits: _credits, ...profile } = change.profile;
  const writes = profileWrites(playerId, profile, stored, now, (id) => (id === change.patch ? "league" : "pass"), stored.profile);
  if (!(await ctx.ports.players.transact(writes))) return null;
  logEvent(ctx, "season_changed", { from: stored.profile.season.id, to: season, patch: change.patch, league: change.league });
  return { profile, version: stored.version + 1, createdAt: stored.createdAt };
}

/** Puts the profile together from the items of the player's partition. */
export function assemble(items: Item[]): StoredProfile | null {
  const head = items.find((i) => i.sk === "PROFILE");
  if (!head) return null;
  const owned = items.filter((i) => i.sk.startsWith(OWN));
  const p = head as unknown as Omit<ProfileBody, "cosmetics" | "heroes"> & { version: number; createdAt: number };
  return {
    version: p.version,
    createdAt: p.createdAt,
    profile: {
      name: p.name,
      galaxies: p.galaxies,
      heroXp: p.heroXp,
      heroes: owned.filter((o) => o.kind === "hero").map((o) => o.sk.slice(OWN.length)),
      cosmetics: owned.filter((o) => o.kind === "cosmetic").map((o) => o.sk.slice(OWN.length)),
      // profiles stored before the grid or title slot existed wear the plain grid and no title
      equipped: {
        ...p.equipped,
        grid: (p.equipped as { grid?: string | null }).grid ?? null,
        title: (p.equipped as { title?: string | null }).title ?? null,
      },
      season: p.season,
      runs: p.runs,
    },
  };
}

/**
 * The writes that store `next` over a stored profile (`version` 0 = none yet): the PROFILE item only if its version
 * is still the one that was read, plus an OWN# entry for each newly owned thing. Removing ownership is not done here
 * (refunds remove the entries of their origin, M4).
 */
export function profileWrites(
  playerId: string,
  next: ProfileBody,
  stored: { version: number; createdAt: number },
  now: number,
  origin: Origin | ((id: string) => Origin),
  before?: ProfileBody,
): Write[] {
  const pk = playerKey(playerId);
  const { cosmetics, heroes, ...rest } = next;
  const had = new Set([...(before?.cosmetics ?? []), ...(before?.heroes ?? [])]);
  const own = (kind: "cosmetic" | "hero", ids: string[]): Write[] =>
    ids
      .filter((id) => !had.has(id))
      .map((id) => ({ put: { pk, sk: `${OWN}${id}`, kind, origin: typeof origin === "function" ? origin(id) : origin, at: isoDay(now) }, ifNotExists: true }));
  return [
    { put: { pk, sk: "PROFILE", ...rest, version: stored.version + 1, createdAt: stored.createdAt }, ifVersion: stored.version },
    ...own("cosmetic", cosmetics),
    ...own("hero", heroes),
  ];
}

/**
 * Stores a changed profile if nobody else wrote it since it was read (version check). Returns false when another
 * write came first; the caller reads again and decides.
 */
export async function saveProfile(ctx: DomainContext, playerId: string, read: StoredProfile, next: ProfileBody, origin: Origin): Promise<boolean> {
  return ctx.ports.players.transact(profileWrites(playerId, next, read, ctx.ports.clock.now(), origin, read.profile));
}
