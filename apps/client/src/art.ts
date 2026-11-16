/**
 * Real pictures from `apps/client/art/`. The file path (without extension) is the id: `art/planets/rime.jpg` is
 * "planets/rime". Vite bundles every file there, so the app works offline. A picture that does not exist yet is not
 * an error: `artTexture` returns null and the screen keeps its placeholder.
 */
import { Assets, Texture } from "pixi.js";

const URLS = import.meta.glob<string>("../art/**/*.{png,jpg,webp}", { eager: true, query: "?url", import: "default" });
const byId = new Map<string, string>(Object.entries(URLS).map(([path, url]) => [path.replace(/^\.\.\/art\//, "").replace(/\.\w+$/, ""), url]));
const textures = new Map<string, Texture>();

export const hasArt = (id: string): boolean => byId.has(id);

/** Loads all pictures; few for now. A picture that fails to load just stays missing. */
export async function loadArt(): Promise<void> {
  await Promise.all([...byId].map(async ([id, url]) => {
    try { textures.set(id, await Assets.load<Texture>(url)); } catch { /* keep the placeholder */ }
  }));
}

export const artTexture = (id: string): Texture | null => textures.get(id) ?? null;
