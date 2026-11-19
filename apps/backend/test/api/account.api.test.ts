import { AccountExportResponse, RunFightResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { loadGameData } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };
const data = loadGameData();
const hero = data.heroList[0]!;

describe("account export and deletion over HTTP (ACC-08)", () => {
  it("exports what was stored, deletes it, and the same identity starts as a new player", { timeout: 60_000 }, async () => {
    const player = `acc-${Date.now().toString(36)}`;
    const signIn = async () =>
      SessionResponse.parse(await (await fetch(`${url}/session`, { method: "POST", headers, body: JSON.stringify({ platform: "dev", player }) })).json());
    const first = await signIn();
    const auth = { ...headers, authorization: `Bearer ${first.token}` };
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${url}${path}`, { method, headers: auth, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

    const { run } = RunStartResponse.parse(await (await send("POST", "/runs", { hero: hero.id, simVersion: data.simVersion })).json());
    const fight = await send("POST", "/runs/fight", {
      runId: run.runId,
      round: 1,
      backpack: { hero: hero.id, round: 1, bags: hero.bags, items: hero.start },
      actions: [],
      simVersion: data.simVersion,
    });
    RunFightResponse.parse(await fight.json());

    const ex = AccountExportResponse.parse(await (await send("GET", "/account/export")).json());
    expect(ex.player.some((i) => i.sk === "PROFILE")).toBe(true);
    expect(ex.player.some((i) => i.sk === "RUN")).toBe(true);
    expect(ex.actions.length).toBe(1);

    const del = await send("DELETE", "/account");
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });

    const again = await signIn();
    expect(again.profile.runs).toBe(0);
    const ex2 = AccountExportResponse.parse(
      await (await fetch(`${url}/account/export`, { headers: { ...headers, authorization: `Bearer ${again.token}` } })).json(),
    );
    expect(ex2.playerId).not.toBe(ex.playerId);
    expect(ex2.player.some((i) => i.sk === "RUN")).toBe(false);
    expect(ex2.actions).toEqual([]);
  });
});
