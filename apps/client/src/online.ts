/**
 * Start of the app against the backend (docs/backend.md, docs/ux.md M11): ask for the configuration, sign in
 * silently, load the profile. The outcome is one state the app shows; the server's profile and date replace the
 * device's (UX-03). Without a backend address (the hosted preview, `npm run client` alone) the app stays offline
 * and keeps its local profile.
 */
import type { ConfigResponse, ProfileBody, SessionRequest } from "@backpack-space/api";
import type { Profile } from "@backpack-space/core";
import type { Api, ApiFailure } from "./api";

/** What the start leads to. */
export type OnlineState =
  | { kind: "offline" }
  | { kind: "ready"; config: ConfigResponse; token: string; expiresAt: number; profile: ProfileBody }
  | { kind: "maintenance"; textKey?: string }
  | { kind: "update" }
  | { kind: "noNetwork" }
  | { kind: "signInFailed" };

/** The identity of the device: the development identity in development builds, Game Center or Play Games later. */
export type IdentitySource = () => Promise<SessionRequest | null>;

/** -1, 0 or 1 like a comparison of "major.minor.patch" versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The state an error code leads to (UX-02). */
export function stateOfFailure(error: ApiFailure, textKey?: string): OnlineState {
  switch (error) {
    case "maintenance":
      return textKey ? { kind: "maintenance", textKey } : { kind: "maintenance" };
    case "update_required":
      return { kind: "update" };
    case "identity_rejected":
    case "unauthorized":
      return { kind: "signInFailed" };
    default:
      // no answer, a broken answer or a server error: the same "try again" state
      return { kind: "noNetwork" };
  }
}

export async function startOnline(api: Api | null, appVersion: string, identity: IdentitySource): Promise<OnlineState> {
  if (!api) return { kind: "offline" };
  const config = await api.call("config", {});
  if (!config.ok) return stateOfFailure(config.error, config.textKey);
  const c = config.value;
  if (c.maintenance.on) return stateOfFailure("maintenance", c.maintenance.textKey);
  if (compareVersions(appVersion, c.minAppVersion) < 0) return { kind: "update" };
  const who = await identity();
  if (!who) return { kind: "signInFailed" };
  const session = await api.call("session", who);
  if (!session.ok) return stateOfFailure(session.error, session.textKey);
  return { kind: "ready", config: c, token: session.value.token, expiresAt: session.value.expiresAt, profile: session.value.profile };
}

/** The profile the app plays with: the server's, with the Credits the device knows until RevenueCat tells them (M4). */
export function profileFromServer(server: ProfileBody, local: Profile): Profile {
  return { ...structuredClone(server), credits: local.credits };
}

/** The development identity ("player-1", "player-2", …): `?player=` in the address, else the one kept on this device. */
export function devIdentity(search: string, stored: string | null): { player: string; keep: string } {
  const asked = new URLSearchParams(search).get("player");
  const ok = (p: string | null): p is string => !!p && /^[a-z0-9-]{1,32}$/.test(p);
  const player = ok(asked) ? asked : ok(stored) ? stored : "player-1";
  return { player, keep: player };
}
