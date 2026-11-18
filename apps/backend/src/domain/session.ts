/**
 * POST /session (ACC-02 to ACC-04, DEV-05): checks the identity, finds or makes the player, answers with a session
 * token and the profile. The store identity is used only as the lookup key: it is in no answer and no log line.
 */
import type { SessionRequest, SessionResponse } from "@backpack-space/api";
import type { CheckedIdentity } from "../ports/index.js";
import { ApiError, type DomainContext } from "./context.js";
import { findOrCreatePlayer, loadProfile } from "./players.js";

export async function checkIdentity(ctx: DomainContext, req: SessionRequest): Promise<CheckedIdentity> {
  if (req.platform === "dev") {
    // the development identity exists only where the setting does (locally); test and production refuse it
    if (ctx.settings.devIdentity !== true) throw new ApiError("identity_rejected");
    return { platform: "dev", storeId: req.player };
  }
  const identity = await ctx.ports.identity.check(req, ctx.settings);
  if (!identity || identity.platform !== req.platform) throw new ApiError("identity_rejected");
  return identity;
}

export async function session(ctx: DomainContext, body: unknown): Promise<SessionResponse> {
  const identity = await checkIdentity(ctx, body as SessionRequest);
  const { playerId } = await findOrCreatePlayer(ctx, identity);
  const stored = await loadProfile(ctx, playerId);
  if (!stored) throw new Error("player without profile");
  ctx.playerId = playerId;
  const { token, expiresAt } = ctx.ports.tokens.issue({ playerId, platform: identity.platform }, ctx.settings, ctx.ports.clock.now());
  return { token, expiresAt, profile: stored.profile };
}
