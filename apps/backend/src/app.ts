/**
 * The whole backend as one router: every route with its domain function. The local server serves this; each cloud
 * Lambda builds its own router with only its routes (docs/backend.md "Lambdas"). Routes are added here as their
 * issues land.
 */
import type { Ports } from "./domain/context.js";
import { createRouter, type DomainFn, type TokenCheck } from "./http/router.js";
import type { RouteName } from "@backpack-space/api";
import { config } from "./domain/config.js";

export const DOMAIN_ROUTES: Partial<Record<RouteName, DomainFn>> = { config };

/** Until session tokens exist (sign-in issue), every token is refused. */
export const checkToken: TokenCheck = async () => null;

export function createApp(ports: Ports) {
  return createRouter({ ports, routes: DOMAIN_ROUTES, tokens: checkToken });
}
