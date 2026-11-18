import { SessionResponse } from "@backpack-space/api";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const run = Date.now().toString(36);

const signIn = async (player: string) => {
  const res = await fetch(`${url}/session`, {
    method: "POST",
    headers: { "x-app-version": "1.0.0", "content-type": "application/json" },
    body: JSON.stringify({ platform: "dev", player }),
  });
  expect(res.status).toBe(200);
  return SessionResponse.parse(await res.json());
};

describe("POST /session over HTTP", () => {
  it("signs two development players in with their own tokens and the same player again", async () => {
    const a = await signIn(`a-${run}`);
    const b = await signIn(`b-${run}`);
    expect(a.token).not.toBe(b.token);
    const again = await signIn(`a-${run}`);
    expect(again.profile).toEqual(a.profile);
    expect(again.expiresAt).toBeGreaterThanOrEqual(a.expiresAt);
  });
});
