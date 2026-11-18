/** In-memory implementations of the ports for tests and for local use where a real service is not available. */
import type {
  ActionStore,
  BackpackPool,
  CheckedIdentity,
  Clock,
  IdentityCheck,
  Item,
  LogSink,
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
  async transact(writes: Write[]): Promise<boolean> {
    for (const w of writes) {
      if ("put" in w) {
        const old = this.items.get(key(w.put.pk, w.put.sk));
        if (w.ifNotExists && old) return false;
        if (w.ifVersion !== undefined && (old?.version ?? 0) !== w.ifVersion) return false;
      } else if (w.ifExists && !this.items.has(key(w.delete.pk, w.delete.sk))) return false;
    }
    for (const w of writes) {
      if ("put" in w) this.items.set(key(w.put.pk, w.put.sk), structuredClone(w.put));
      else this.items.delete(key(w.delete.pk, w.delete.sk));
    }
    return true;
  }
}

export class FakeBackpackPool implements BackpackPool {
  readonly items: Item[] = [];
  async put(item: Item): Promise<void> {
    this.items.push(structuredClone(item));
  }
}

export class FakeActionStore implements ActionStore {
  readonly items: Item[] = [];
  async put(item: Item): Promise<void> {
    this.items.push(structuredClone(item));
  }
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
  async balance(playerId: string): Promise<number> {
    return this.balances.get(playerId) ?? 0;
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
