/**
 * Every route of the backend: method, path, whether it needs the session token, and its schemas. The backend's router
 * and the app's API client both read this list, so the two cannot drift apart. Routes are added by the issues that
 * build them.
 */
import { z } from "zod";
import { ConfigResponse, ProfileResponse, SessionRequest, SessionResponse } from "./schemas.js";

export interface Route<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
  method: "GET" | "POST" | "DELETE";
  path: string;
  /** needs a session token; the player id comes only from it */
  auth: boolean;
  request: Req;
  response: Res;
}

/** GET requests carry no body; their request schema is this empty object. */
export const NoBody = z.strictObject({});

export const ROUTES = {
  config: { method: "GET", path: "/config", auth: false, request: NoBody, response: ConfigResponse },
  session: { method: "POST", path: "/session", auth: false, request: SessionRequest, response: SessionResponse },
  profile: { method: "GET", path: "/profile", auth: true, request: NoBody, response: ProfileResponse },
} as const satisfies Record<string, Route>;
export type RouteName = keyof typeof ROUTES;
export type RequestOf<N extends RouteName> = z.infer<(typeof ROUTES)[N]["request"]>;
export type ResponseOf<N extends RouteName> = z.infer<(typeof ROUTES)[N]["response"]>;
