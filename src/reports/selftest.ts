/**
 * Can we trust the measuring tool?
 *   npm run report:selftest -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--jobs N] [--boost 25] [--boost-path venn/jungle]
 *
 * Three runs of the paths measurement (report:paths):
 *   A  seed S                     B  seed S+1, same game data     C  seed S, one path's hero items made stronger
 * Checks: (1) a lobby gives the same result on one core and on many; (2) A and B differ only by as much as their
 * ± says (if the ± were too small, the reports would show changes that are only chance); (3) C finds the
 * stronger paths clearly, so the tool can see a real change of that size.
 */
import { aggregatePaths, blockSe, measurePathLobby, type PathGroup } from "../sim/paths";
import { jobsFrom, runParallel, type WorkerTask } from "../sim/parallel";
import { loadTargets, pct, pts, startReport } from "./common";

const r = startReport({
  id: "selftest",
  title: "Self-test of the measuring tool",
  question: "Does the paths measurement give the same result every time, is its ± honest, and does it see a real change?",
  presets: { quick: { lobbies: 24 }, normal: { lobbies: 60 }, precise: { lobbies: 120 } },
  explain: { lobbies: "lobbies per run (three runs)" },
});
const data = r.data;
const L = r.n.lobbies, jobs = jobsFrom(r.flags), ratings = !r.flags["no-ratings"];
const boostPct = Number(r.flags.boost ?? 25);
// one path only: win shares are relative, so stronger items for several heroes at once would cancel out
const boost = [{ path: r.flags["boost-path"] ?? "venn/jungle", pct: boostPct }];
const boostHero = boost[0]!.path.split("/")[0]!;
const run = async (label: string, task: Omit<WorkerTask, "from" | "to">) => {
  const out = await runParallel(task, L, jobs, (i) => measurePathLobby(data, task.seed, i), (d) => r.progress(`${label}: lobby ${d}/${L}`));
  return { seats: out, groups: aggregatePaths(out) };
};
const A = await run("A", { kind: "paths", seed: r.seed, ratings });
const B = await run("B", { kind: "paths", seed: r.seed + 1, ratings });
const C = await run("C", { kind: "paths", seed: r.seed, ratings, boost });
const T = loadTargets();

// (1) same lobby, same result
r.log();
r.log("## 1. Same lobbies, same result");
const again = [0, 1].map((i) => measurePathLobby(data, r.seed, i));
const same = JSON.stringify(again) === JSON.stringify(A.seats.slice(0, 2));
r.log(`Lobbies 1–2 of run A played again in this process (A ran on ${Math.min(jobs, L)} cores): ${same ? "identical" : "DIFFERENT"}.`);
r.target({ min: 1, what: "a lobby gives the same result again, on one core or many (1 = yes)" }, [same ? 1 : 0], false);

// (2) A against B
r.log();
r.log("## 2. Is the ± honest? Two independent runs (A, B)");
const keys = [...A.groups.keys()].filter((k) => !k.endsWith("/*")).sort();
const name = (k: string) => { const [h, p] = k.split("/"); const hero = data.heroes.get(h!)!; return `${hero.name.split(" ")[0]}: ${hero.paths.find((x) => x.id === p)?.name ?? "open"}`; };
const show = (g: PathGroup) => `${pct(g.all.p)} ±${Math.max(1, Math.round(100 * g.all.se))}`;
const zs: number[] = [];
const rows = keys.map((k) => {
  const a = A.groups.get(k)!, b = B.groups.get(k)!;
  const z = (a.all.p - b.all.p) / Math.sqrt(a.all.se ** 2 + b.all.se ** 2);
  zs.push(z);
  return [name(k), show(a), show(b), pts(a.all.p - b.all.p), z.toFixed(1)];
});
r.table(["path", "A", "B", "A − B", "in ± (z)"], rows, { center: 0, span: 3, cols: [4], highIsBad: true });
const rms = Math.sqrt(zs.reduce((s, z) => s + z * z, 0) / zs.length);
r.log(`z = difference divided by its expected error. If the ± is honest, z is mostly between −2 and +2 and its root mean square is about 1.`);
r.log(`Root mean square of z: ${rms.toFixed(2)} (${zs.filter((z) => Math.abs(z) > 2).length} of ${zs.length} beyond ±2; about 1 in 20 is normal). Above 1.5: the ± is too small; below 0.6: too careful.`);
r.target(T.selftestNoise!, [rms], false);

// (3) A against C
r.log();
r.log(`## 3. Does it see a real change? Run C: the hero items of ${name(boost[0]!.path)} ${boostPct} % stronger (weapon damage and effect numbers)`);
const rowsC: (string | number)[][] = [];
const strength: number[] = [];
for (const k of keys.filter((k) => k.startsWith(`${boostHero}/`))) {
  const a = A.groups.get(k)!, c = C.groups.get(k)!;
  const se = blockSe(c.all.blocks.map((x, i) => x - a.all.blocks[i]!));
  const d = c.all.p - a.all.p;
  const boosted = boost.some((b) => b.path === k);
  if (boosted) strength.push(d / se);
  rowsC.push([name(k) + (boosted ? " (stronger)" : ""), show(a), show(c), `${pts(d)} ±${Math.max(1, Math.round(100 * se))}`, (d / se).toFixed(1)]);
}
r.table(["path", "A", "C", "change (paired)", "in ± "], rowsC, { center: 0, span: 4, cols: [4] });
r.log("Paired: A and C play the same lobbies, only the stronger items differ, so the change is measured much more exactly than A − B.");
r.log("The stronger path should rise by clearly more than its ± (target: at least 3×). Every bot of the hero can buy these items, so the hero's other bots rise too, usually less.");
r.target(T.selftestBoost!, strength, false);
r.done();
