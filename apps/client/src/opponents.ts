/**
 * Where opponents come from. Planned: saved backpacks of real players, preferably from the player's league,
 * with pre-built configurations while there are few (docs/retention.md). Until there is a server the game
 * uses `GhostOpponents`: stored bot builds from the design tools.
 */
import { compile, type Build, type GameData } from "@backpack-space/core";
import { GHOSTS } from "./data";

export interface OpponentSource {
  /** an opponent for this round of the player's run; `league` is the player's league index */
  pick(player: Build, league: number): Build;
  /** offers the player's backpack of a round as an opponent for others (no-op until there is a server) */
  submit(build: Build, league: number): void;
}

/** Stored bot builds of this round (or the nearest round that has one); the league is not used yet. */
export class GhostOpponents implements OpponentSource {
  constructor(private readonly data: GameData, private readonly ghosts: Build[][] = GHOSTS) {}

  pick(player: Build): Build {
    const order: number[] = [];
    for (let r = player.round - 1; r >= 0; r--) order.push(r);
    for (let r = player.round; r < this.ghosts.length; r++) order.push(r);
    for (const r of order) {
      const pool = [...(this.ghosts[r] ?? [])];
      while (pool.length) {
        const g = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
        try { compile(g, this.data); return g; } catch { /* stale ghost: the data changed since it was stored */ }
      }
    }
    return { ...player };
  }

  submit(): void { /* no server yet */ }
}
