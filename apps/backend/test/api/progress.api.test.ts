import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ProfileResponse, RunCurrentResponse, RunFinishResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { heroCosmeticId, heroLevel, leagueOf, passLevel } from "@backpack-space/core";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { describe, expect, inject, it } from "vitest";
import { documentClient } from "../../src/adapters/dynamodb.js";

// The standing of a run and the profile are set directly in the table: only when the tests started their own database.
const endpoint = inject("dbEndpoint");
const url = inject("apiUrl");
const headers = { "x-app-version": "1.0.0", "content-type": "application/json" };
const data = loadGameData();
const meta = loadMeta(data);
const hero = meta.startHeroes[0]!;
const players = "test-players";

describe.skipIf(!endpoint)("progress booked by the server (META-01, META-02, META-04)", () => {
  it("a run moves hero level, league, planet track and pass, and each unlock is owned once with its track", async () => {
    const db = documentClient({ endpoint, region: "local" });
    const player = `p-${Date.now().toString(36)}`;
    const s = await fetch(`${url}/session`, { method: "POST", headers, body: JSON.stringify({ platform: "dev", player }) });
    const { token, profile: start } = SessionResponse.parse(await s.json());
    const auth = { ...headers, authorization: `Bearer ${token}` };
    // a new player starts in the lowest league with 0 points
    expect(start.season).toMatchObject({ points: 0, peak: 0 });
    const lookup = await db.send(new GetCommand({ TableName: players, Key: { pk: `ID#dev#${player}`, sk: "PLAYER" } }));
    const pk = `P#${String(lookup.Item!.playerId)}`;

    // just below a hero level with a cosmetic, the first planet, a pass level and the next league
    const level = meta.heroLevels.cosmeticAt[0]!;
    const xpBefore = meta.heroLevels.xp[level - 2]! - 50;
    const firstPlanet = meta.planetTrack[0]!;
    const perPass = meta.seasons[0]!.pass.galaxiesPerLevel;
    const season = { ...start.season, galaxies: perPass + 5, points: meta.leagues.pointsPerLeague - 20, peak: 0 };
    await db.send(
      new UpdateCommand({
        TableName: players,
        Key: { pk, sk: "PROFILE" },
        UpdateExpression: "SET heroXp = :xp, galaxies = :g, season = :s",
        ExpressionAttributeValues: { ":xp": { [hero]: xpBefore }, ":g": firstPlanet.galaxies - 5, ":s": season },
      }),
    );
    // a run that is over with 9 wins and 2 lives left
    const { run } = RunStartResponse.parse(
      await (await fetch(`${url}/runs`, { method: "POST", headers: auth, body: JSON.stringify({ hero, simVersion: data.simVersion }) })).json(),
    );
    await db.send(
      new UpdateCommand({
        TableName: players,
        Key: { pk, sk: "RUN" },
        UpdateExpression: "SET wins = :w, lives = :l, #round = :r, #over = :o",
        ExpressionAttributeNames: { "#round": "round", "#over": "over" },
        ExpressionAttributeValues: { ":w": 9, ":l": 2, ":r": data.rules.rounds, ":o": true },
      }),
    );

    // the app asks for the open run: the server books the run that is over
    const current = RunCurrentResponse.parse(await (await fetch(`${url}/runs/current`, { headers: auth })).json());
    expect(current.run).toBeNull();
    const booked = current.finished!;
    const { result, profile } = booked;
    expect(result.level).toEqual([heroLevel(meta, xpBefore).level, heroLevel(meta, profile.heroXp[hero]!).level]);
    expect(result.level[1]).toBeGreaterThanOrEqual(level);
    expect(result.league).toEqual([0, leagueOf(meta, profile.season.points)]);
    expect(result.league[1]).toBe(1);
    expect(result.pass).toEqual([passLevel(meta, season), passLevel(meta, profile.season)]);
    expect(result.pass[1]).toBeGreaterThan(result.pass[0]);
    const skin = heroCosmeticId(hero, level);
    expect(result.rewards).toEqual(expect.arrayContaining([{ cosmetic: skin }, firstPlanet.reward]));
    expect(profile.cosmetics).toEqual(expect.arrayContaining([skin, (firstPlanet.reward as { cosmetic: string }).cosmetic]));

    // each unlock is an ownership entry with the track it came from
    const owned = (
      await db.send(
        new QueryCommand({
          TableName: players,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :own)",
          ExpressionAttributeValues: { ":pk": pk, ":own": "OWN#" },
        }),
      )
    ).Items!;
    const origin = (id: string) => owned.find((o) => o.sk === `OWN#${id}`)?.origin;
    expect(origin(skin)).toBe("level");
    expect(origin((firstPlanet.reward as { cosmetic: string }).cosmetic)).toBe("planet");

    // booked once: a repeat gets the same answer and the profile does not move again
    const again = RunFinishResponse.parse(
      await (await fetch(`${url}/runs/finish`, { method: "POST", headers: auth, body: JSON.stringify({ runId: run.runId, reason: "finished" }) })).json(),
    );
    expect(again).toEqual(booked);
    const now = ProfileResponse.parse(await (await fetch(`${url}/profile`, { headers: auth })).json()).profile;
    // the stored profile lists owned things in key order
    expect({ ...now, cosmetics: [...now.cosmetics].sort() }).toEqual({ ...profile, cosmetics: [...profile.cosmetics].sort() });
    expect(now.runs).toBe(start.runs + 1);

    // the league reached is a floor: a run without wins cannot take it away
    const { run: next } = RunStartResponse.parse(
      await (await fetch(`${url}/runs`, { method: "POST", headers: auth, body: JSON.stringify({ hero, simVersion: data.simVersion }) })).json(),
    );
    const lost = RunFinishResponse.parse(
      await (await fetch(`${url}/runs/finish`, { method: "POST", headers: auth, body: JSON.stringify({ runId: next.runId, reason: "gave_up" }) })).json(),
    );
    expect(lost.result.points).toBeLessThan(0);
    expect(lost.result.league).toEqual([1, 1]);
    expect(lost.profile.season.points).toBe(meta.leagues.pointsPerLeague);
  });
});
