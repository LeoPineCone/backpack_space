/** GET /profile (ACC-05): the profile as stored on the server, put together from PROFILE and the OWN# entries. */
import type { ProfileResponse } from "@backpack-space/api";
import type { DomainContext } from "./context.js";
import { loadProfile } from "./players.js";

export async function profile(ctx: DomainContext): Promise<ProfileResponse> {
  // the router let the request through only with a valid token, so the player id is set
  const stored = await loadProfile(ctx, ctx.playerId!);
  if (!stored) throw new Error("signed-in player without profile");
  return { profile: stored.profile };
}
