/**
 * The profile on the server (ACC-05, ACC-06, ACC-07): GET /profile, and the changes a player makes to it. Equipping
 * and renaming use the core's rules (`equip`, `equipSkin`, `rename` with the name filter); only owned things can be
 * worn. A write only succeeds on the version it read; a collision reads again.
 */
import type { ProfileBody, ProfileEquipRequest, ProfileNameRequest, ProfileResponse, ProfileSkinRequest } from "@backpack-space/api";
import { equip, equipSkin, rename, type Profile } from "@backpack-space/core";
import { ApiError, type DomainContext } from "./context.js";
import { loadProfile, saveProfile } from "./players.js";

export async function profile(ctx: DomainContext): Promise<ProfileResponse> {
  // the router let the request through only with a valid token, so the player id is set
  const stored = await loadProfile(ctx, ctx.playerId!);
  if (!stored) throw new Error("signed-in player without profile");
  return { profile: stored.profile };
}

/** Reads the profile, applies `change` (null: refused with `refusal`) and stores it on the version it read. */
async function changeProfile(ctx: DomainContext, change: (p: Profile) => Profile | null, refusal: "not_owned" | "name_rejected"): Promise<ProfileResponse> {
  const playerId = ctx.playerId!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await loadProfile(ctx, playerId);
    if (!stored) throw new Error("signed-in player without profile");
    // the core's profile carries Credits; on the server they live at RevenueCat
    const next = change({ ...stored.profile, credits: 0 });
    if (!next) throw new ApiError(refusal);
    const { credits: _credits, ...body } = next;
    // nothing new is owned here, so no ownership entries are written
    if (await saveProfile(ctx, playerId, stored, body satisfies ProfileBody, "start")) return { profile: body };
  }
  throw new Error("profile change kept colliding");
}

/** POST /profile/equip */
export async function profileEquip(ctx: DomainContext, body: unknown): Promise<ProfileResponse> {
  const { slot, id } = body as ProfileEquipRequest;
  return changeProfile(ctx, (p) => equip(ctx.ports.game.meta, p, slot, id), "not_owned");
}

/** POST /profile/skin */
export async function profileSkin(ctx: DomainContext, body: unknown): Promise<ProfileResponse> {
  const { hero, id } = body as ProfileSkinRequest;
  return changeProfile(ctx, (p) => equipSkin(ctx.ports.game.meta, p, hero, id), "not_owned");
}

/** POST /profile/name */
export async function profileName(ctx: DomainContext, body: unknown): Promise<ProfileResponse> {
  const { name } = body as ProfileNameRequest;
  return changeProfile(ctx, (p) => rename(ctx.ports.game.meta, p, name), "name_rejected");
}
