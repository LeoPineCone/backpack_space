import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");

describe("local backend over HTTP", () => {
  it("answers an unknown path with not_found as JSON", async () => {
    const res = await fetch(`${url}/no-such-path`, { headers: { "x-app-version": "1.0.0" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("lets the development client on another port call it", async () => {
    const res = await fetch(`${url}/config`, { method: "OPTIONS", headers: { origin: "http://localhost:5173" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain("x-app-version");
  });
});
