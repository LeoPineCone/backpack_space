import { ConfigResponse } from "@backpack-space/api";
import { describe, expect, it } from "vitest";
import { refreshingSettings } from "../src/adapters/refreshing-settings.js";
import { createApp } from "../src/app.js";
import { defaultSettings, fakePorts } from "../src/fakes/index.js";
import type { SettingsValues } from "../src/ports/index.js";

const get = (version = "1.0.0") => ({ method: "GET", path: "/config", headers: { "x-app-version": version }, body: null });

describe("GET /config", () => {
  it("returns minimum version, season, server date and maintenance", async () => {
    const { ports } = fakePorts();
    const res = await createApp(ports)(get());
    expect(res.status).toBe(200);
    const body = ConfigResponse.parse(JSON.parse(res.body));
    expect(body).toEqual({
      minAppVersion: "0.1.0",
      serverDate: "2026-11-18",
      season: { id: 1, start: "2026-11-01", end: "2027-01-31" },
      maintenance: { on: false },
    });
  });

  it("takes the server date from the clock in UTC", async () => {
    const { ports, clock } = fakePorts();
    clock.ms = Date.UTC(2026, 11, 31, 23, 59);
    expect(JSON.parse((await createApp(ports)(get())).body).serverDate).toBe("2026-12-31");
  });

  it("answers in maintenance and passes the text key on", async () => {
    const { ports, settings } = fakePorts();
    settings.values.maintenance = { on: true, textKey: "maintenance.update" };
    const res = await createApp(ports)(get());
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).maintenance).toEqual({ on: true, textKey: "maintenance.update" });
  });

  it("answers an app below the minimum version, so it can show the update screen", async () => {
    const { ports, settings } = fakePorts();
    settings.values.minAppVersion = "2.0.0";
    const res = await createApp(ports)(get("1.9.9"));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).minAppVersion).toBe("2.0.0");
  });

  it("answers without a version header and refuses a malformed one", async () => {
    const { ports } = fakePorts();
    const app = createApp(ports);
    expect((await app({ method: "GET", path: "/config", headers: {}, body: null })).status).toBe(200);
    expect((await app(get("latest"))).status).toBe(400);
  });
});

describe("settings refresh", () => {
  const source = () => {
    let values: SettingsValues = defaultSettings();
    let fail = false;
    let loads = 0;
    return {
      load: async () => {
        loads++;
        if (fail) throw new Error("parameter store down");
        return structuredClone(values);
      },
      set: (change: (v: SettingsValues) => void) => change(values),
      failNext: (f: boolean) => (fail = f),
      replace: (v: SettingsValues) => (values = v),
      loads: () => loads,
    };
  };

  it("shows a changed setting in the next answer after the refresh time, without a restart", async () => {
    const { ports, clock } = fakePorts();
    const src = source();
    const app = createApp({ ...ports, settings: refreshingSettings(src.load, clock) });
    expect(JSON.parse((await app(get())).body).maintenance.on).toBe(false);

    src.set((v) => (v.maintenance = { on: true }));
    clock.advance(59);
    expect(JSON.parse((await app(get())).body).maintenance.on).toBe(false);
    clock.advance(1);
    expect(JSON.parse((await app(get())).body).maintenance.on).toBe(true);
  });

  it("reads the source at most once per minute", async () => {
    const { clock } = fakePorts();
    const src = source();
    const settings = refreshingSettings(src.load, clock);
    await Promise.all([settings.get(), settings.get(), settings.get()]);
    clock.advance(30);
    await settings.get();
    expect(src.loads()).toBe(1);
    clock.advance(30);
    await settings.get();
    expect(src.loads()).toBe(2);
  });

  it("keeps the last values when a refresh fails and tries again on the next request", async () => {
    const { clock } = fakePorts();
    const src = source();
    const settings = refreshingSettings(src.load, clock);
    await settings.get();
    src.set((v) => (v.minAppVersion = "3.0.0"));
    src.failNext(true);
    clock.advance(60);
    expect((await settings.get()).minAppVersion).toBe("0.1.0");
    src.failNext(false);
    expect((await settings.get()).minAppVersion).toBe("3.0.0");
  });

  it("fails when the very first read fails", async () => {
    const { clock } = fakePorts();
    const src = source();
    src.failNext(true);
    await expect(refreshingSettings(src.load, clock).get()).rejects.toThrow("parameter store down");
  });
});
