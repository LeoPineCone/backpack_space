import { ProfileResponse, SessionResponse } from "@backpack-space/api";
import { NAME_MAX, heroCosmeticId, patchId } from "@backpack-space/core";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };

describe("GET /profile over HTTP", () => {
  it("reads back the profile a development player got at sign-in", async () => {
    const s = await fetch(`${url}/session`, { method: "POST", headers, body: JSON.stringify({ platform: "dev", player: `p-${Date.now().toString(36)}` }) });
    const session = SessionResponse.parse(await s.json());
    const res = await fetch(`${url}/profile`, { headers: { ...headers, authorization: `Bearer ${session.token}` } });
    expect(res.status).toBe(200);
    expect(ProfileResponse.parse(await res.json()).profile).toEqual(session.profile);
  });

  it("refuses without a token", async () => {
    const res = await fetch(`${url}/profile`, { headers });
    expect(res.status).toBe(401);
  });
});

describe("changing the profile over HTTP (ACC-06, ACC-07)", () => {
  const meta = loadMeta(loadGameData());
  const signIn = async () => {
    const s = await fetch(`${url}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ platform: "dev", player: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }),
    });
    const { token, profile } = SessionResponse.parse(await s.json());
    const auth = { ...headers, authorization: `Bearer ${token}` };
    const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    return { profile, post, read: async () => ProfileResponse.parse(await (await fetch(`${url}/profile`, { headers: auth })).json()).profile };
  };

  it("equips owned things and refuses what the player does not own", async () => {
    const p = await signIn();
    const ok = await p.post("/profile/equip", { slot: "background", id: meta.start.background });
    expect(ok.status).toBe(200);
    expect(ProfileResponse.parse(await ok.json()).profile.equipped.background).toBe(meta.start.background);
    const notOwnedBackground = meta.cosmetics.find((c) => c.kind === "background" && !meta.start.cosmetics.includes(c.id))!.id;
    const grid = meta.cosmetics.find((c) => c.kind === "grid")!.id;
    const hero = meta.startHeroes[0]!;
    for (const [path, body] of [
      ["/profile/equip", { slot: "background", id: notOwnedBackground }],
      ["/profile/equip", { slot: "grid", id: grid }],
      ["/profile/equip", { slot: "picture", id: meta.start.background }],
      ["/profile/equip", { slot: "patch", id: patchId(1, meta.leagues.ids[9]!) }],
      ["/profile/skin", { hero, id: heroCosmeticId(hero, meta.heroLevels.cosmeticAt[0]!) }],
    ] as const) {
      const res = await p.post(path, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(await res.json()).toEqual({ error: "not_owned" });
    }
    // taking the grid or patch off always works; the profile is unchanged by the refusals
    expect((await p.post("/profile/equip", { slot: "grid", id: null })).status).toBe(200);
    expect(await p.read()).toEqual(p.profile);
  });

  it("renames with a tidied name and refuses bad names in English and German", async () => {
    const p = await signIn();
    const res = await p.post("/profile/name", { name: "  Star   Rider " });
    expect(res.status).toBe(200);
    expect(ProfileResponse.parse(await res.json()).profile.name).toBe("Star Rider");
    expect((await p.read()).name).toBe("Star Rider");
    for (const name of ["", "x".repeat(NAME_MAX + 1), "Fuck Off", "Hurensohn", "H1tl3r", "Arschloch 7"]) {
      const bad = await p.post("/profile/name", { name });
      expect(bad.status, name).toBe(422);
      expect(await bad.json()).toEqual({ error: "name_rejected" });
    }
    expect((await p.read()).name).toBe("Star Rider");
  });
});
