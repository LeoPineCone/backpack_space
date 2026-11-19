/**
 * Account export and deletion (ACC-08, docs/backend.md "Account deletion and export").
 *
 * GET /account/export: the player's partition of `players` and their entries in `actions`, as they are stored.
 *
 * DELETE /account: first the player id goes on the list of deleted accounts (partition `DELETED` of the table
 * `backpacks`, which a restore of `players` does not roll back), then the store lookup, the partition, the recorded
 * actions and the customer at RevenueCat are deleted. The player's backpacks stay in the pool as opponents but lose
 * player id, owner, name and patch. Every step can run again, so a deletion that stopped half-way, or a restore of
 * `players`, is finished by `deleteAgain` (the timed job `deleted`).
 */
import type { AccountDeleteResponse, AccountExportResponse } from "@backpack-space/api";
import type { Item, Write } from "../ports/index.js";
import type { DomainContext, Ports } from "./context.js";
import { logEvent } from "./log.js";
import { IDENTITY, playerKey } from "./players.js";

export const DELETED = "DELETED";
/** DynamoDB writes at most 100 items in one transaction; deletes go in smaller steps */
const CHUNK = 25;

export async function accountExport(ctx: DomainContext): Promise<AccountExportResponse> {
  const playerId = ctx.playerId!;
  const [player, actions] = await Promise.all([ctx.ports.players.query(playerKey(playerId)), ctx.ports.actions.byPlayer(playerId)]);
  return { playerId, player, actions };
}

export async function accountDelete(ctx: DomainContext): Promise<AccountDeleteResponse> {
  const playerId = ctx.playerId!;
  await ctx.ports.backpacks.put({ pk: DELETED, sk: playerId, at: ctx.ports.clock.now() });
  await erase(ctx.ports, playerId);
  logEvent(ctx, "account_deleted", {});
  return { deleted: true };
}

/** Deletes everything of a player that is still there; safe to run any number of times. */
export async function erase(ports: Ports, playerId: string): Promise<number> {
  const { players, backpacks, actions, random } = ports;
  const pk = playerKey(playerId);
  const items = await players.query(pk);
  const lookup = items.find((i) => i.sk === IDENTITY)?.lookup;
  let changed = 0;
  if (typeof lookup === "string") {
    const l = await players.get(lookup, "PLAYER");
    // only a lookup that still names this player: the identity may already have a new one
    if (l?.playerId === playerId) {
      await players.transact([{ delete: { pk: lookup, sk: "PLAYER" } }]);
      changed++;
    }
  }
  // the IDENTITY entry goes last, so a repeat still finds the lookup
  const ordered = [...items.filter((i) => i.sk !== IDENTITY), ...items.filter((i) => i.sk === IDENTITY)];
  for (let i = 0; i < ordered.length; i += CHUNK) {
    const writes: Write[] = ordered.slice(i, i + CHUNK).map((it) => ({ delete: { pk: it.pk, sk: it.sk } }));
    if (!(await players.transact(writes))) throw new Error("account deletion: a delete failed");
    changed += writes.length;
  }
  for (const a of await actions.byPlayer(playerId)) {
    await actions.remove(a.pk, a.sk);
    changed++;
  }
  for (const b of await backpacks.byPlayer(playerId)) {
    await backpacks.put(anonymous(b, random.uint32()));
    changed++;
  }
  await ports.revenuecat.deleteCustomer(playerId);
  return changed;
}

/** A pool backpack without anything that points to its player: the build and its keys stay. */
function anonymous(b: Item, random: number): Item {
  const { playerId: _p, appVersion: _a, ...rest } = b;
  return { ...rest, owner: `gone-${(random >>> 0).toString(16)}`, name: `Pilot ${100 + (random % 900)}`, patch: null };
}

/** Every id on the list of deleted accounts. */
export async function deletedIds(ports: Ports): Promise<string[]> {
  const ids: string[] = [];
  let from = "";
  for (;;) {
    const page = await ports.backpacks.range(DELETED, from, "￿", 100);
    ids.push(...page.map((i) => i.sk));
    if (page.length < 100) return ids;
    from = `${page.at(-1)!.sk}\u0000`;
  }
}

/** After a restore of `players` (or a deletion that stopped): deletes every listed account again. */
export async function deleteAgain(ports: Ports): Promise<{ seen: number; changed: number }> {
  const ids = await deletedIds(ports);
  let changed = 0;
  for (const id of ids) changed += await erase(ports, id);
  return { seen: ids.length, changed };
}
