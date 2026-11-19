/**
 * Every route of the backend: method, path, whether it needs the session token, and its schemas. The backend's router
 * and the app's API client both read this list, so the two cannot drift apart. Routes are added by the issues that
 * build them.
 */
import { z } from "zod";
import {
  AccountDeleteResponse,
  AccountExportResponse,
  ClientErrorRequest,
  ClientErrorResponse,
  ConfigResponse,
  ProfileEquipRequest,
  ProfileNameRequest,
  ProfileResponse,
  ProfileSkinRequest,
  QuestsResponse,
  RunCurrentResponse,
  RunFightRequest,
  RunFightResponse,
  RunFinishRequest,
  RunFinishResponse,
  RunStartRequest,
  RunStartResponse,
  SessionRequest,
  SessionResponse,
} from "./schemas.js";

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
  profileEquip: { method: "POST", path: "/profile/equip", auth: true, request: ProfileEquipRequest, response: ProfileResponse },
  profileSkin: { method: "POST", path: "/profile/skin", auth: true, request: ProfileSkinRequest, response: ProfileResponse },
  profileName: { method: "POST", path: "/profile/name", auth: true, request: ProfileNameRequest, response: ProfileResponse },
  quests: { method: "GET", path: "/quests", auth: true, request: NoBody, response: QuestsResponse },
  runCurrent: { method: "GET", path: "/runs/current", auth: true, request: NoBody, response: RunCurrentResponse },
  runStart: { method: "POST", path: "/runs", auth: true, request: RunStartRequest, response: RunStartResponse },
  runFight: { method: "POST", path: "/runs/fight", auth: true, request: RunFightRequest, response: RunFightResponse },
  runFinish: { method: "POST", path: "/runs/finish", auth: true, request: RunFinishRequest, response: RunFinishResponse },
  accountExport: { method: "GET", path: "/account/export", auth: true, request: NoBody, response: AccountExportResponse },
  accountDelete: { method: "DELETE", path: "/account", auth: true, request: NoBody, response: AccountDeleteResponse },
  clientError: { method: "POST", path: "/reports/error", auth: false, request: ClientErrorRequest, response: ClientErrorResponse },
} as const satisfies Record<string, Route>;
export type RouteName = keyof typeof ROUTES;
export type RequestOf<N extends RouteName> = z.infer<(typeof ROUTES)[N]["request"]>;
export type ResponseOf<N extends RouteName> = z.infer<(typeof ROUTES)[N]["response"]>;
