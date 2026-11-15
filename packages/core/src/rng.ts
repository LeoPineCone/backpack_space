/** Deterministic randomness (mulberry32). Same seed => same battle, required for server-side verification. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  /** The current position; `new Rng(rng.state)` continues the same sequence (used to save a run). */
  get state(): number { return this.s; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number { return Math.floor(this.next() * maxExclusive); }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick from empty list");
    return arr[this.int(arr.length)]!;
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}
