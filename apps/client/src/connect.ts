/** Wires the start against the backend (online.ts) into the running app: address, app version, identity, storage. */
import { createApi } from "./api";
import { devIdentity, profileFromServer, startOnline, type IdentitySource, type OnlineState } from "./online";
import type { Game } from "./game";

const DEV_PLAYER_KEY = "backpack-space.devPlayer";

/** Development builds sign in as a development player; Game Center / Play Games come with their plugin. */
const identity: IdentitySource = async () => {
  if (!import.meta.env.DEV && import.meta.env.MODE !== "devtools") return null;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(DEV_PLAYER_KEY);
  } catch {
    /* storage unavailable */
  }
  const { player, keep } = devIdentity(location.search, stored);
  try {
    localStorage.setItem(DEV_PLAYER_KEY, keep);
  } catch {
    /* storage unavailable */
  }
  return { platform: "dev", player };
};

export const APP_VERSION = __APP_VERSION__;

/** Runs the start; when it succeeds the server's profile replaces the device's. */
export async function connect(game: Game): Promise<OnlineState> {
  const base = import.meta.env.VITE_BACKEND_URL;
  const api = base ? createApi({ base, appVersion: APP_VERSION, fetch: (url, init) => fetch(url, init) }) : null;
  const state = await startOnline(api, APP_VERSION, identity);
  if (state.kind === "ready") game.setProfile(profileFromServer(state.profile, game.profile));
  game.online = state;
  return state;
}

/** States that keep the player out of the game until they change. */
export function blocking(state: OnlineState): boolean {
  return state.kind !== "ready" && state.kind !== "offline";
}
