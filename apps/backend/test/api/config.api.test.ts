import { ConfigResponse } from "@backpack-space/api";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");

describe("GET /config over HTTP", () => {
  it("answers with a configuration that matches the contract", async () => {
    const res = await fetch(`${url}/config`, { headers: { "x-app-version": "1.0.0" } });
    expect(res.status).toBe(200);
    const body = ConfigResponse.parse(await res.json());
    expect(body.serverDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
