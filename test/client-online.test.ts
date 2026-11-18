import { describe, expect, it } from "vitest";
import type { ProfileBody } from "@backpack-space/api";
import { newProfile } from "../packages/core/src/index.js";
import { loadGameData, loadMeta } from "../packages/core/node/load.js";
import { createApi, type FetchFn } from "../apps/client/src/api";
import { compareVersions, devIdentity, profileFromServer, startOnline, stateOfFailure } from "../apps/client/src/online";

const meta = loadMeta(loadGameData());
const { credits: _c, ...serverProfile } = newProfile(meta);
const profile: ProfileBody = { ...serverProfile, name: "From server" };
const config = { minAppVersion: "0.1.0", serverDate: "2026-11-18", season: { id: 1, start: "2026-11-01", end: "2027-01-31" }, maintenance: { on: false } };

/** A backend that answers by path; every request is recorded. */
function backend(answers: Record<string, [number, unknown] | "down">) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fetch: FetchFn = async (url, init) => {
    calls.push({ url, ...init });
    const a = answers[new URL(url).pathname];
    if (!a || a === "down") throw new TypeError("Failed to fetch");
    return { status: a[0], json: async () => a[1] };
  };
  return { api: createApi({ base: "http://backend.test/", appVersion: "0.1.0", fetch }), calls };
}
const dev = async () => ({ platform: "dev" as const, player: "player-1" });
const ok = { "/config": [200, config], "/session": [200, { token: "tok", expiresAt: 1, profile }] } as Record<string, [number, unknown]>;

describe("client API", () => {
  it("sends the app version, the token and JSON, and checks the answer", async () => {
    const { api, calls } = backend({ "/profile": [200, { profile }] });
    const res = await api.call("profile", {}, "tok");
    expect(res).toEqual({ ok: true, value: { profile } });
    expect(calls[0]).toMatchObject({ url: "http://backend.test/profile", method: "GET", headers: { "x-app-version": "0.1.0", authorization: "Bearer tok" } });
    expect(calls[0]!.body).toBeUndefined();
  });

  it("maps answers to the fixed codes, a broken contract and no network", async () => {
    expect(await backend({ "/config": [503, { error: "maintenance", textKey: "status.x" }] }).api.call("config", {})).toEqual({
      ok: false,
      error: "maintenance",
      textKey: "status.x",
    });
    expect(await backend({ "/config": [200, { ...config, extra: 1 }] }).api.call("config", {})).toEqual({ ok: false, error: "bad_answer" });
    expect(await backend({ "/config": [500, "<html>"] }).api.call("config", {})).toEqual({ ok: false, error: "bad_answer" });
    expect(await backend({ "/config": [418, { error: "teapot" }] }).api.call("config", {})).toEqual({ ok: false, error: "bad_answer" });
    expect(await backend({ "/config": "down" }).api.call("config", {})).toEqual({ ok: false, error: "network" });
  });
});

describe("start against the backend", () => {
  it("stays offline without a backend address", async () => {
    expect(await startOnline(null, "0.1.0", dev)).toEqual({ kind: "offline" });
  });

  it("asks for the configuration, signs in and brings the server's profile", async () => {
    const { api, calls } = backend(ok);
    const s = await startOnline(api, "0.1.0", dev);
    expect(s).toEqual({ kind: "ready", config, token: "tok", expiresAt: 1, profile });
    expect(calls.map((c) => c.url)).toEqual(["http://backend.test/config", "http://backend.test/session"]);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ platform: "dev", player: "player-1" });
  });

  it("shows maintenance and an old app from the configuration, before signing in", async () => {
    const m = backend({ ...ok, "/config": [200, { ...config, maintenance: { on: true, textKey: "status.planned" } }] });
    expect(await startOnline(m.api, "0.1.0", dev)).toEqual({ kind: "maintenance", textKey: "status.planned" });
    expect(m.calls).toHaveLength(1);
    const old = backend({ ...ok, "/config": [200, { ...config, minAppVersion: "0.2.0" }] });
    expect(await startOnline(old.api, "0.1.9", dev)).toEqual({ kind: "update" });
  });

  it("shows the states of the error codes", async () => {
    expect(await startOnline(backend({ "/config": "down" }).api, "0.1.0", dev)).toEqual({ kind: "noNetwork" });
    expect(await startOnline(backend({ ...ok, "/session": [401, { error: "identity_rejected" }] }).api, "0.1.0", dev)).toEqual({ kind: "signInFailed" });
    expect(await startOnline(backend({ ...ok, "/session": [426, { error: "update_required" }] }).api, "0.1.0", dev)).toEqual({ kind: "update" });
    expect(await startOnline(backend({ ...ok, "/session": [500, { error: "internal" }] }).api, "0.1.0", dev)).toEqual({ kind: "noNetwork" });
    expect(await startOnline(backend(ok).api, "0.1.0", async () => null)).toEqual({ kind: "signInFailed" });
    expect(stateOfFailure("rate_limited")).toEqual({ kind: "noNetwork" });
  });

  it("plays with the server's profile and keeps the Credits of the device until RevenueCat tells them", () => {
    const local = { ...newProfile(meta), credits: 42, name: "Local" };
    const p = profileFromServer(profile, local);
    expect(p.name).toBe("From server");
    expect(p.credits).toBe(42);
  });

  it("compares app versions by number", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
  });

  it("picks the development player from the address, else the one kept, else player-1", () => {
    expect(devIdentity("?player=player-2", "player-1").player).toBe("player-2");
    expect(devIdentity("", "player-3").player).toBe("player-3");
    expect(devIdentity("?player=NOT OK", null).player).toBe("player-1");
  });
});
