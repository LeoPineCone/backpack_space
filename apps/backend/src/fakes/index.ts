/** In-memory implementations of the ports for tests and for local use where a real service is not available. */
import type {
  ActionStore,
  BackpackPool,
  CheckedIdentity,
  Clock,
  IdentityCheck,
  Item,
  LogSink,
  Page,
  PlayerStore,
  Random,
  RevenueCat,
  Settings,
  SettingsValues,
  StoreSignIn,
  Write,
} from "../ports/index.js";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import type { Game, Ports } from "../domain/context.js";
import { hmacTokens } from "../http/token.js";

/** A clock that only moves when told to. */
export class FakeClock implements Clock {
  constructor(public ms = Date.UTC(2026, 10, 18, 12)) {}
  now(): number {
    return this.ms;
  }
  advance(seconds: number): void {
    this.ms += seconds * 1000;
  }
}

/** Counts up, so ids and seeds are predictable in tests. */
export class FakeRandom implements Random {
  private n = 0;
  id(): string {
    return `id${(++this.n).toString().padStart(6, "0")}`;
  }
  uint32(): number {
    return (++this.n * 2654435761) >>> 0;
  }
}

export const defaultSettings = (): SettingsValues => ({
  maintenance: { on: false },
  minAppVersion: "0.1.0",
  season: { id: 1, start: "2026-11-01", end: "2027-01-31" },
  devIdentity: true,
  tokenKeys: [{ id: "k1", secret: "test-secret-1" }],
  tokenLifetime: 3600,
  tables: { players: "players", backpacks: "backpacks", actions: "actions" },
});

export class FakeSettings implements Settings {
  constructor(public values: SettingsValues = defaultSettings()) {}
  async get(): Promise<SettingsValues> {
    return this.values;
  }
}

const key = (pk: string, sk: string) => `${pk}\u0000${sk}`;

export class FakePlayerStore implements PlayerStore {
  readonly items = new Map<string, Item>();
  async get(pk: string, sk: string): Promise<Item | null> {
    const it = this.items.get(key(pk, sk));
    return it ? structuredClone(it) : null;
  }
  async query(pk: string): Promise<Item[]> {
    return [...this.items.values()]
      .filter((i) => i.pk === pk)
      .sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0))
      .map((i) => structuredClone(i));
  }
  /** pages of `pageSize` items; the cursor is the position */
  pageSize = 100;
  async scan(sk: string, next?: string): Promise<Page> {
    return page(
      [...this.items.values()].filter((i) => i.sk === sk),
      next,
      this.pageSize,
    );
  }
  async transact(writes: Write[]): Promise<boolean> {
    for (const w of writes) {
      if ("put" in w) {
        const old = this.items.get(key(w.put.pk, w.put.sk));
        if (w.ifNotExists && old) return false;
        if (w.ifVersion !== undefined && (old?.version ?? 0) !== w.ifVersion) return false;
      } else {
        const old = this.items.get(key(w.delete.pk, w.delete.sk));
        if (w.ifExists && !old) return false;
        if (w.ifVersion !== undefined && (!old || old.version !== w.ifVersion)) return false;
      }
    }
    for (const w of writes) {
      if ("put" in w) this.items.set(key(w.put.pk, w.put.sk), structuredClone(w.put));
      else this.items.delete(key(w.delete.pk, w.delete.sk));
    }
    return true;
  }
}

export class FakeBackpackPool implements BackpackPool {
  readonly items = new Map<string, Item>();
  /** how many reads were made (the matching must stay cheap) */
  reads = 0;
  async put(item: Item): Promise<void> {
    this.items.set(key(item.pk, item.sk), structuredClone(item));
  }
  async remove(pk: string, sk: string): Promise<void> {
    this.items.delete(key(pk, sk));
  }
  async range(pk: string, from: string, to: string, limit: number): Promise<Item[]> {
    this.reads++;
    return [...this.items.values()]
      .filter((i) => i.pk === pk && i.sk >= from && i.sk <= to)
      .sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0))
      .slice(0, limit)
      .map((i) => structuredClone(i));
  }
  async byPlayer(playerId: string): Promise<Item[]> {
    return [...this.items.values()].filter((i) => i.playerId === playerId).map((i) => structuredClone(i));
  }
}

export class FakeActionStore implements ActionStore {
  readonly items: Item[] = [];
  pageSize = 100;
  async put(item: Item): Promise<void> {
    const at = this.items.findIndex((i) => i.pk === item.pk && i.sk === item.sk);
    if (at >= 0) this.items.splice(at, 1);
    this.items.push(structuredClone(item));
  }
  async expired(nowSec: number, next?: string): Promise<Page> {
    const old = this.items.filter((i) => typeof i.expiresAt === "number" && i.expiresAt < nowSec).map((i) => ({ pk: i.pk, sk: i.sk }));
    return page(old, next, this.pageSize);
  }
  async remove(pk: string, sk: string): Promise<void> {
    const at = this.items.findIndex((i) => i.pk === pk && i.sk === sk);
    if (at >= 0) this.items.splice(at, 1);
  }
  async byPlayer(playerId: string): Promise<Item[]> {
    return this.items.filter((i) => i.playerId === playerId).map((i) => structuredClone(i));
  }
}

/** A page of `all` from position `next`. */
function page(all: Item[], next: string | undefined, size: number): Page {
  const from = Number(next ?? 0);
  const items = all.slice(from, from + size).map((i) => structuredClone(i));
  return from + size < all.length ? { items, next: String(from + size) } : { items };
}

/** Accepts a fixed list of identities: request JSON string -> identity. */
export class FakeIdentityCheck implements IdentityCheck {
  constructor(public accept: (request: StoreSignIn) => CheckedIdentity | null = () => null) {}
  async check(request: StoreSignIn): Promise<CheckedIdentity | null> {
    return this.accept(request);
  }
}

export class FakeRevenueCat implements RevenueCat {
  readonly balances = new Map<string, number>();
  readonly deleted: string[] = [];
  async balance(playerId: string): Promise<number> {
    return this.balances.get(playerId) ?? 0;
  }
  async deleteCustomer(playerId: string): Promise<void> {
    this.balances.delete(playerId);
    this.deleted.push(playerId);
  }
}

export class MemoryLog implements LogSink {
  readonly lines: Record<string, unknown>[] = [];
  write(line: Record<string, unknown>): void {
    this.lines.push(line);
  }
}

/** All ports as fakes, for domain and router tests. */
export function fakePorts() {
  const clock = new FakeClock();
  const settings = new FakeSettings();
  const players = new FakePlayerStore();
  const log = new MemoryLog();
  const identity = new FakeIdentityCheck();
  const ports: Ports = {
    clock,
    random: new FakeRandom(),
    settings,
    players,
    backpacks: new FakeBackpackPool(),
    actions: new FakeActionStore(),
    identity,
    tokens: hmacTokens,
    game: testGame(),
    revenuecat: new FakeRevenueCat(),
    log,
  };
  return { ports, clock, settings, players, log, identity };
}

let game: Game | undefined;
/** The game data of /data, read once per test file. */
export function testGame(): Game {
  if (!game) {
    const data = loadGameData();
    game = { data, meta: loadMeta(data) };
  }
  return game;
}
