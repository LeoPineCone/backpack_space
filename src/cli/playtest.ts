/**
 * Play a run by hand, one command at a time, as text: for a playtest by an AI (or a person at a terminal).
 * The run follows the player's rules (packages/core/src/run.ts); opponents are the stored builds of the
 * playground (playground/ghosts.json, `npm run play:ghosts`). State and a log are kept in out/playtest/<name>.json.
 *
 *   npm run playtest -- new <name> --hero quill [--seed 1] [--goal "Big beasts"]
 *   npm run playtest -- <name> show
 *   npm run playtest -- <name> "buy 2 3 2 0; reroll; fight"      several commands, separated by ";"
 *   npm run playtest -- <name> report                             writes out/playtest/<name>.md
 *
 * Commands: show | info <item id> | spots <loose n | item id> | buy <slot> [x y rot] | place <loose n> x y rot |
 *   move <item n> x y rot | bag <bag n> x y rot | drop <item n> | sell <item n> | sellloose <n> | sellbag <n> |
 *   reroll | freeze <slot> | lock <item n> | pick <n> | tidy | fight | note <text>
 * "tidy" lets the bots' arranger lay out everything (a help a player does not have; the log marks it).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Rng,
  arrange,
  boardOf,
  buildOf,
  buy,
  compile,
  describeHero,
  describeItem,
  dropItem,
  finishRound,
  moveBag,
  moveItem,
  newRun,
  pendingMerges,
  placeLoose,
  reroll,
  sellBag,
  sellItem,
  sellLoose,
  sellPrice,
  simulate,
  starred,
  takeSpecial,
  toggleFreeze,
  toggleLock,
  type Build,
  type ItemDef,
  type RunState,
} from "@backpack-space/core";
import { ROOT, loadGameData } from "@backpack-space/core/node";
import { parseArgs } from "./args";

interface RoundLog {
  round: number;
  actions: string[];
  notes: string[];
  fight?: string;
  won?: boolean;
  build?: string[];
}
interface Save {
  name: string;
  hero: string;
  seed: number;
  goal: string;
  rng: number;
  run: RunState;
  log: RoundLog[];
}

const DIR = join(ROOT, "out", "playtest");
const data = loadGameData();
const { flags, rest } = parseArgs();
const out: string[] = [];
const say = (s = "") => out.push(s);
const def = (id: string): ItemDef => {
  const d = data.items.get(id);
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
};
const file = (name: string) => join(DIR, `${name}.json`);
const num = (s: string | undefined, what: string): number => {
  const n = Number(s);
  if (s === undefined || !Number.isInteger(n)) throw new Error(`${what}: a whole number is needed`);
  return n;
};

function recipesOf(id: string): string[] {
  const made = data.recipes.find((r) => r.out === id);
  const uses = (data.recipesWith.get(id) ?? []).map((r) => `${r.in.map((i) => def(i).name).join(" + ")} = ${def(r.out).name}`);
  return [...(made ? [`made from ${made.in.map((i) => def(i).name).join(" + ")}`] : []), ...uses.map((u) => `merges: ${u}`)];
}
function card(id: string, withRecipes = true): string {
  const d = def(id);
  const kind = d.isBag
    ? `bag, ${d.size} cells ${d.shape.join("/")}`
    : `${d.tags.filter((t) => t !== "crafted").join(", ")}; ${d.crafted ? "crafted" : d.rarity}; ${d.size} cell${d.size === 1 ? "" : "s"} ${d.shape.join("/")}`;
  const text = describeItem(d, data).join(" ");
  const rec = withRecipes ? recipesOf(id) : [];
  return `${d.name} [${id}] (${kind})${text ? `: ${text}` : ""}${rec.length ? ` {${rec.join("; ")}}` : ""}`;
}

function show(s: Save): void {
  const r = s.run,
    rules = data.rules,
    hero = data.heroes.get(r.hero)!;
  say(
    `# ${s.name}: ${hero.name}, round ${r.round}/${rules.rounds}, lives ${r.lives}, wins ${r.wins}, gold ${r.gold}${r.over ? " — RUN OVER" : ""}${s.goal ? ` (goal: ${s.goal})` : ""}`,
  );
  say(`Hero: ${describeHero(hero, data).join(" ")}`);
  if (r.merged.length)
    say(`Merged after the last fight: ${r.merged.map((m) => `${m.in.map((i) => def(i).name).join(" + ")} = ${def(m.out).name}`).join("; ")}`);
  if (r.special) {
    say("");
    say('FREE PICK (choose one with "pick <n>" before anything else):');
    r.special.forEach((id, i) => say(`  ${i}: ${card(id)}`));
  }
  say("");
  say(`Shop (reroll costs ${rules.shop.rerollCost}):`);
  r.offers.forEach((o, i) => say(o ? `  ${i}: ${o.price} gold${o.sale ? " (sale)" : ""}${o.frozen ? " (frozen)" : ""} — ${card(o.item)}` : `  ${i}: (bought)`));
  say("");
  say(`Backpack (x → , y ↓; "." no bag, "__" empty bag cell, number = item n):`);
  const b = boardOf(rules.grid.w, rules.grid.h, r.bags, r.items, data.shape);
  say(`     ${Array.from({ length: b.w }, (_, x) => String(x).padStart(2)).join(" ")}`);
  for (let y = 0; y < b.h; y++) {
    const row = Array.from({ length: b.w }, (_, x) => {
      const k = y * b.w + x;
      return b.bag[k]! < 0 ? " ." : b.occ[k]! < 0 ? "__" : String(b.occ[k]).padStart(2);
    });
    if (row.some((c) => c !== " .")) say(`  ${String(y).padStart(2)} ${row.join(" ")}`);
  }
  say("");
  say("Items:");
  r.items.forEach((p, i) => {
    const st = starred(b, r.items, i, data.shape);
    const hasStars = data.shape(p.item, p.rot).stars.length > 0;
    say(
      `  ${i}: at ${p.x},${p.y} rot ${p.rot}${p.lock ? " (locked)" : ""} — ${card(p.item)}${hasStars ? ` [stars touch: ${st.length ? st.map((j) => def(r.items[j]!.item).name).join(", ") : "nothing"}]` : ""}`,
    );
  });
  say(`Bags: ${r.bags.map((p, i) => `${i}: ${def(p.item).name} at ${p.x},${p.y} rot ${p.rot}`).join("; ")}`);
  if (r.loose.length) {
    say(`Loose (not in the fight; limit ${rules.shop.looseLimit} for buying loose):`);
    r.loose.forEach((id, i) => say(`  ${i}: ${card(id)} — sells for ${sellPrice(data, id)}`));
  }
  const due = pendingMerges(data, r.bags, r.items);
  if (due.length)
    say(`Will merge after the next fight: ${due.map((c) => `${c.recipe.in.map((i) => def(i).name).join(" + ")} = ${def(c.recipe.out).name}`).join("; ")}`);
}

/** Every spot where the item fits, as "x y rot". */
function spots(s: Save, id: string): string[] {
  const r = s.run,
    d = def(id),
    res: string[] = [];
  for (let rot = 0; rot < 4; rot++)
    for (let y = 0; y < data.rules.grid.h; y++)
      for (let x = 0; x < data.rules.grid.w; x++) {
        const p = { item: id, x, y, rot };
        try {
          if (d.isBag) boardOf(data.rules.grid.w, data.rules.grid.h, [...r.bags, p], r.items, data.shape);
          else boardOf(data.rules.grid.w, data.rules.grid.h, r.bags, [...r.items, p], data.shape);
          res.push(`${x} ${y} ${rot}`);
        } catch {
          /* does not fit */
        }
      }
  return res;
}

function fight(s: Save, rng: Rng, log: RoundLog): void {
  const r = s.run;
  if (r.special) throw new Error("take the free pick first (pick <n>)");
  const ghosts = JSON.parse(readFileSync(join(ROOT, "playground", "ghosts.json"), "utf8")) as Build[][];
  const pool = ghosts[r.round - 1] ?? [];
  if (!pool.length) throw new Error("no stored opponent for this round (npm run play:ghosts)");
  const foe = rng.pick(pool),
    mine = buildOf(r),
    seed = rng.int(1 << 30);
  const a = compile(mine, data),
    b = compile(foe, data);
  const res = simulate(a, b, data.rules, seed);
  const won = res.winner === 0;
  const round = r.round;
  const top = (side: 0 | 1, build: Build) =>
    res.stats[side].itemDamage
      .map((v, i) => ({ v, n: def(build.items[i]!.item).name }))
      .filter((x) => x.v > 0)
      .sort((x, y) => y.v - x.v)
      .slice(0, 6)
      .map((x) => `${x.n} ${x.v}`)
      .join(", ");
  const line = (side: 0 | 1) => {
    const st = res.stats[side];
    return `weapons and pets ${st.weapon}, direct ${st.direct}, burn ${st.burn}, toxin ${st.toxin}, spikes ${st.spikes}; healed ${st.healed}, shielded ${st.shielded}; attacks ${st.attacks}`;
  };
  const text = [
    `Round ${round}: ${won ? "WON" : res.winner === -1 ? "DRAW (counts as lost)" : "LOST"} against ${data.heroes.get(foe.hero)!.name} after ${res.seconds} s${res.supernova ? " (Supernova reached)" : ""}. Health left: you ${Math.max(0, Math.round(res.hp[0]))}/${res.maxHp[0]}, enemy ${Math.max(0, Math.round(res.hp[1]))}/${res.maxHp[1]}.`,
    `  You: ${line(0)}. Top items: ${top(0, mine) || "none"}.`,
    `  Enemy: ${line(1)}. Top items: ${top(1, foe) || "none"}.`,
    `  Enemy build: ${foe.items.map((p) => def(p.item).name).join(", ")}.`,
  ].join("\n");
  say(text);
  log.fight = text;
  log.won = won;
  log.build = mine.items.map((p) => def(p.item).name);
  finishRound(r, data, won, rng);
  if (r.over) say(`RUN OVER: ${r.wins} wins, ${r.lives} lives left.`);
  else {
    s.log.push({ round: r.round, actions: [], notes: [] });
    say("");
    show(s);
  }
}

function run(s: Save, cmd: string): void {
  const [op, ...a] = cmd.trim().split(/\s+/);
  const r = s.run,
    rng = new Rng(s.rng);
  const log = s.log[s.log.length - 1]!;
  const spot = (i: number) => ({ x: num(a[i], "x"), y: num(a[i + 1], "y"), rot: num(a[i + 2] ?? "0", "rot") });
  const done = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`${cmd}: not possible (${what})`);
    log.actions.push(what);
    say(`ok: ${what}`);
  };
  if (op === "show") show(s);
  else if (op === "info") say(card(a[0] ?? ""));
  else if (op === "spots") {
    const id = /^\d+$/.test(a[0] ?? "") ? r.loose[Number(a[0])] : a[0];
    if (!id) throw new Error("spots: loose n or item id");
    const sp = spots(s, id);
    say(`${def(id).name} fits at (x y rot): ${sp.length ? sp.join(" | ") : "nowhere"}`);
  } else if (op === "note") {
    log.notes.push(a.join(" "));
    say("noted");
  } else if (r.over) throw new Error("the run is over");
  else if (op === "pick") {
    if (!r.special) throw new Error("no free pick open");
    const id = r.special[num(a[0], "pick")];
    if (!id) throw new Error("pick: no such option");
    const others = r.special.filter((x) => x !== id).map((x) => def(x).name);
    takeSpecial(r, num(a[0], "pick"));
    done(true, `picked ${def(id).name} (left: ${others.join(", ")}); it lies loose`);
  } else if (r.special) throw new Error("take the free pick first (pick <n>)");
  else if (op === "buy") {
    const slot = num(a[0], "slot"),
      o = r.offers[slot];
    if (!o) throw new Error("buy: empty slot");
    const name = def(o.item).name,
      price = o.price;
    done(buy(r, data, slot, a.length > 1 ? spot(1) : undefined), `bought ${name} for ${price}${a.length > 1 ? ` at ${a.slice(1).join(",")}` : " (loose)"}`);
  } else if (op === "place") {
    const i = num(a[0], "loose n"),
      id = r.loose[i];
    if (!id) throw new Error("place: no such loose item");
    done(placeLoose(r, data, i, spot(1)), `placed ${def(id).name} at ${a.slice(1).join(",")}`);
  } else if (op === "move") {
    const i = num(a[0], "item n"),
      p = r.items[i];
    if (!p) throw new Error("move: no such item");
    done(moveItem(r, data, i, spot(1)), `moved ${def(p.item).name} to ${a.slice(1).join(",")}`);
  } else if (op === "bag") {
    const i = num(a[0], "bag n"),
      p = r.bags[i];
    if (!p) throw new Error("bag: no such bag");
    done(moveBag(r, data, i, spot(1)), `moved bag ${def(p.item).name} to ${a.slice(1).join(",")}`);
  } else if (op === "drop") {
    const i = num(a[0], "item n"),
      p = r.items[i];
    if (!p) throw new Error("drop: no such item");
    dropItem(r, i);
    done(true, `took ${def(p.item).name} out (loose)`);
  } else if (op === "sell") {
    const i = num(a[0], "item n"),
      p = r.items[i];
    if (!p) throw new Error("sell: no such item");
    const g = sellPrice(data, p.item);
    sellItem(r, data, i);
    done(true, `sold ${def(p.item).name} for ${g}`);
  } else if (op === "sellloose") {
    const i = num(a[0], "loose n"),
      id = r.loose[i];
    if (!id) throw new Error("sellloose: no such loose item");
    const g = sellPrice(data, id);
    sellLoose(r, data, i);
    done(true, `sold ${def(id).name} for ${g}`);
  } else if (op === "sellbag") {
    const i = num(a[0], "bag n"),
      p = r.bags[i];
    if (!p) throw new Error("sellbag: no such bag");
    done(sellBag(r, data, i), `sold bag ${def(p.item).name}`);
  } else if (op === "reroll") done(reroll(r, data, rng), "rerolled the shop");
  else if (op === "freeze") done(toggleFreeze(r, num(a[0], "slot")), `froze or released offer ${a[0]}`);
  else if (op === "lock") done(toggleLock(r, num(a[0], "item n")), `locked or unlocked item ${a[0]}`);
  else if (op === "tidy") {
    const ids = [...r.items.map((p) => p.item), ...r.loose.filter((id) => !def(id).isBag)];
    const res = arrange(data, r.bags, ids, rng);
    r.items = res.items;
    r.loose = [...r.loose.filter((id) => def(id).isBag), ...res.left];
    done(true, `tidy (arranger laid out ${res.items.length} items, ${res.left.length} left loose)`);
  } else if (op === "fight") fight(s, rng, log);
  else throw new Error(`unknown command "${op}"`);
  if (op === "buy" || op === "place" || op === "move") {
    // A merge is easy to overlook in text, so say it right after the move that sets it up.
    const due = pendingMerges(data, r.bags, r.items);
    if (due.length)
      say(
        `  note: will merge after the next fight: ${due.map((c) => `${c.recipe.in.map((i) => def(i).name).join(" + ")} = ${def(c.recipe.out).name}`).join("; ")} (lock an item to keep it)`,
      );
  }
  s.rng = rng.state;
}

function report(s: Save): string {
  const hero = data.heroes.get(s.hero)!;
  const lines = [
    `# Playtest ${s.name}: ${hero.name}${s.goal ? `, goal "${s.goal}"` : ""}`,
    "",
    `Seed ${s.seed}. Result: ${s.run.wins} wins, ${s.run.lives} lives left, ${s.run.results.map((w) => (w ? "W" : "L")).join("")}.`,
    "",
  ];
  for (const l of s.log) {
    if (!l.actions.length && !l.notes.length && !l.fight) continue;
    lines.push(`## Round ${l.round}${l.won === undefined ? "" : l.won ? " — won" : " — lost"}`, "");
    if (l.actions.length) lines.push(`Actions: ${l.actions.join("; ")}.`, "");
    if (l.build) lines.push(`Build: ${l.build.join(", ")}.`, "");
    if (l.fight) lines.push("```", l.fight, "```", "");
    for (const n of l.notes) lines.push(`- ${n}`);
    if (l.notes.length) lines.push("");
  }
  return lines.join("\n");
}

try {
  mkdirSync(DIR, { recursive: true });
  if (rest[0] === "new") {
    const name = rest[1],
      hero = flags.hero;
    if (!name || !hero) throw new Error("usage: playtest new <name> --hero <id> [--seed n] [--goal text]");
    const seed = Number(flags.seed ?? 1),
      rng = new Rng(seed);
    const s: Save = { name, hero, seed, goal: flags.goal ?? "", rng: 0, run: newRun(data, hero, rng), log: [{ round: 1, actions: [], notes: [] }] };
    s.rng = rng.state;
    writeFileSync(file(name), JSON.stringify(s));
    show(s);
  } else {
    const name = rest[0];
    if (!name || !existsSync(file(name))) throw new Error(`no playtest "${name ?? ""}" (start one with: playtest new <name> --hero <id>)`);
    const s = JSON.parse(readFileSync(file(name), "utf8")) as Save;
    const cmds = rest
      .slice(1)
      .join(" ")
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!cmds.length) cmds.push("show");
    for (const c of cmds) {
      if (c === "report") {
        const p = join(DIR, `${name}.md`);
        writeFileSync(p, report(s));
        say(`report written: ${p}`);
        continue;
      }
      try {
        run(s, c);
      } catch (e) {
        say(`ERROR ${(e as Error).message}`);
        say("(the commands after it were not run)");
        break;
      }
      writeFileSync(file(name), JSON.stringify(s));
    }
  }
} catch (e) {
  say(`ERROR ${(e as Error).message}`);
  process.exitCode = 1;
}
console.log(out.join("\n"));
