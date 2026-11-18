import { ProfileResponse, SessionResponse } from "@backpack-space/api";
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
