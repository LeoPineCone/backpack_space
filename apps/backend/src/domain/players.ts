/**
 * Players and their profile in the table `players` (docs/backend.md):
 *   ID#<platform>#<storeId> / PLAYER   the lookup from store identity to player id (ACC-03)
 *   P#<playerId> / PROFILE             name, Galaxies, hero XP, equipped things, season state, runs, version
 *   P#<playerId> / OWN#<thing>         one entry per owned cosmetic or hero, with origin and date
 * The profile the app gets is put together from PROFILE and the OWN# entries. No Credits: they live at RevenueCat.
 */
import type { ProfileBody } from "@backpack-space/api";
import { newProfile } from "@backpack-space/core";
import type { CheckedIdentity, Item, Write } from "../ports/index.js";
import type { DomainContext } from "./context.js";
import { isoDay } from "./config.js";

export const playerKey = (playerId: string) => `P#${playerId}`;
export const identityKey = (id: CheckedIdentity) => `ID#${id.platform}#${id.storeId}`;
const OWN = "OWN#";

/**
 * Where an owned thing came from (STORE-04): a booked run unlocks it by a hero level, the planet track or the season
 * pass (META-01); the store adds Credits and purchases. A refund removes exactly the entries of its origin.
 */
export type Origin = "start" | "pass" | "level" | "planet" | "credits" | "purchase";

/** The stored profile: the PROFILE item and the owned things, with its version number. */
export interface StoredProfile {
  profile: ProfileBody;
  /** counts every write of PROFILE; a write only succeeds on the version it read */
  version: number;
  /** milliseconds since 1970 */
  createdAt: number;
}

/** The player id of a store identity, made (with a new profile) at the first sign-in. */
export async function findOrCreatePlayer(ctx: DomainContext, identity: CheckedIdentity): Promise<{ playerId: string; created: boolean }> {
  const { players, random, clock } = ctx.ports;
  const lookup = await players.get(identityKey(identity), "PLAYER");
  if (lookup) return { playerId: String(lookup.playerId), created: false };

  const playerId = random.id();
  const now = clock.now();
  const profile = startProfile(ctx);
  const writes: Write[] = [
    { put: { pk: identityKey(identity), sk: "PLAYER", playerId, createdAt: now }, ifNotExists: true },
    ...profileWrites(playerId, profile, { version: 0, createdAt: now }, now, "start"),
  ];
  if (await players.transact(writes)) return { playerId, created: true };
  // two first sign-ins at the same time: the other one won, use its player
  const winner = await players.get(identityKey(identity), "PLAYER");
  if (!winner) throw new Error("player lookup missing after a failed first sign-in");
  return { playerId: String(winner.playerId), created: false };
}

/** A new profile as the core makes it (lowest league, 0 points), for the season of the settings. */
export function startProfile(ctx: DomainContext): ProfileBody {
  const meta = ctx.ports.game.meta;
  const season = meta.seasons.some((s) => s.id === ctx.settings.season.id) ? ctx.settings.season.id : undefined;
  const { credits: _credits, ...profile } = newProfile(meta, season);
  return profile;
}

export async function loadProfile(ctx: DomainContext, playerId: string): Promise<StoredProfile | null> {
  return assemble(await ctx.ports.players.query(playerKey(playerId)));
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
      equipped: p.equipped,
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
