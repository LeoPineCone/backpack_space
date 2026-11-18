/**
 * The whole backend as one router: every route with its domain function. The local server serves this; each cloud
 * Lambda builds its own router with only its routes (docs/backend.md "Lambdas"). Routes are added here as their
 * issues land.
 */
import type { Ports } from "./domain/context.js";
import { createRouter, type DomainFn, type TokenCheck } from "./http/router.js";
import type { TokenBuckets } from "./http/throttle.js";
import type { RouteName } from "@backpack-space/api";
import { config } from "./domain/config.js";
import { profile, profileEquip, profileName, profileSkin } from "./domain/profile.js";
import { runFight } from "./domain/fight.js";
import { runCurrent, runFinish, runStart } from "./domain/runs.js";
import { session } from "./domain/session.js";

export const DOMAIN_ROUTES: Partial<Record<RouteName, DomainFn>> = {
  config,
  session,
  profile,
  profileEquip,
  profileSkin,
  profileName,
  runCurrent,
  runStart,
  runFight,
  runFinish,
};

/** The player id comes from the session token only (ACC-04). */
export const checkToken: TokenCheck = async (token, ctx) => ctx.ports.tokens.check(token, ctx.settings, ctx.ports.clock.now())?.playerId ?? null;

/** `throttle`: the local server applies the request limits itself (in the cloud the HTTP API does). */
export function createApp(ports: Ports, opts: { throttle?: TokenBuckets } = {}) {
  return createRouter({ ports, routes: DOMAIN_ROUTES, tokens: checkToken, ...opts });
}
