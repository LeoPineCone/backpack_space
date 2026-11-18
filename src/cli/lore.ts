/** Writes lore/graph.html: places, heroes and items of lore/planets.json as a graph you can tap through. `npm run lore` */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadGameData, loadItemArt } from "@backpack-space/core/node";
import { checkLore, loadLore } from "../lore/lore";

const d = loadGameData(),
  art = loadItemArt(),
  places = loadLore();
const problems = checkLore(d, places);
if (problems.length) {
  console.error(`Lore problems:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

interface Node {
  id: string;
  label: string;
  group: string;
  sub: string;
  lines: string[];
}
const nodes: Node[] = [],
  links: [string, string, string][] = [];
const seen = new Set<string>();
const add = (n: Node) => {
  if (!seen.has(n.id)) {
    seen.add(n.id);
    nodes.push(n);
  }
};

for (const p of places) {
  add({
    id: `place:${p.id}`,
    label: p.name,
    group: "place",
    sub: `${p.kind}${p.status === "draft" ? " · draft" : ""}`,
    lines: [`Traits: ${p.traits.join("; ")}.`, `Life: ${p.life}`, `Background idea: ${p.background}`],
  });
  if (p.orbits) links.push([`place:${p.id}`, `place:${p.orbits}`, "orbits"]);
  for (const h of p.heroes) {
    const hero = d.heroes.get(h)!;
    add({ id: `hero:${h}`, label: hero.name, group: "hero", sub: hero.title, lines: [] });
    links.push([`place:${p.id}`, `hero:${h}`, "home of"]);
  }
  for (const i of p.items) {
    const it = d.items.get(i)!,
      a = art[i];
    const owner = it.hero ? d.heroes.get(it.hero)?.name : undefined;
    add({
      id: `item:${i}`,
      label: it.name,
      group: "item",
      sub: `${it.tags.filter((t) => t !== "crafted").join(", ")} · ${it.rarity}${owner ? ` · ${owner}` : ""}`,
      lines: a ? [a.brief, `Picture: ${a.description}`] : [],
    });
    links.push([`place:${p.id}`, `item:${i}`, "origin of"]);
    if (it.hero && seen.has(`hero:${it.hero}`)) links.push([`item:${i}`, `hero:${it.hero}`, "hero item"]);
  }
}
// hero items whose hero is on the graph but whose place link came first
for (const n of nodes) {
  if (n.group !== "item") continue;
  const it = d.items.get(n.id.slice(5))!;
  if (it.hero && seen.has(`hero:${it.hero}`) && !links.some(([a, b]) => a === n.id && b === `hero:${it.hero}`))
    links.push([n.id, `hero:${it.hero}`, "hero item"]);
}

const data = JSON.stringify({ nodes, links }).replace(/</g, "\\u003c");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backpack Space lore</title>
<style>
:root{--bg:#12162a;--panel:#1a2038;--ink:#0b0d14;--text:#e6dcc3;--muted:#9a937f;--place:#c9962e;--hero:#a63d2a;--item:#1f8a8f;--line:#3a4466}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,sans-serif}
header{padding:12px 16px 4px}h1{font-size:18px;margin:0}header p{margin:2px 0 0;color:var(--muted);font-size:13px}
.legend{display:flex;gap:14px;flex-wrap:wrap;padding:6px 16px;font-size:13px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
main{display:flex;flex-wrap:wrap;gap:12px;padding:0 16px 16px}
#wrap{flex:1 1 560px;min-width:0;background:var(--ink);border-radius:10px;overflow:auto}
svg{display:block;width:100%;height:auto}@media (max-width:700px){svg{min-width:760px}}
#info{flex:1 1 280px;background:var(--panel);border-radius:10px;padding:14px 16px;align-self:flex-start}
#info h2{margin:0;font-size:17px}#info .sub{color:var(--muted);font-size:13px;margin-bottom:8px}#info p{margin:6px 0}
#info ul{margin:8px 0 0;padding-left:18px}#info li{cursor:pointer;color:var(--place)}
.n text{fill:var(--text);font-size:12px;paint-order:stroke;stroke:var(--ink);stroke-width:3px;user-select:none}
.n{cursor:pointer;touch-action:none}.dim{opacity:.18}line{stroke:var(--line);stroke-width:1.5}line.hl{stroke:var(--text)}
</style></head><body>
<header><h1>Backpack Space – places and what comes from them</h1><p>Generated from lore/planets.json by npm run lore. Tap a node or its name; drag to move it. On a phone, swipe the graph sideways.</p></header>
<div class="legend"><span><i style="background:var(--place)"></i>place</span><span><i style="background:var(--hero)"></i>hero</span><span><i style="background:var(--item)"></i>item</span></div>
<main><div id="wrap"><svg id="g" viewBox="0 0 900 700"></svg></div><aside id="info"><h2>Tap a node</h2><div class="sub">Places are drafts until decided.</div></aside></main>
<script>
const D=${data};
const W=900,H=700,R={place:16,hero:12,item:8};
const N=D.nodes.map((n,i)=>({...n,x:W/2+Math.cos(i*2.4)*(60+i*6),y:H/2+Math.sin(i*2.4)*(60+i*6),vx:0,vy:0}));
const byId=Object.fromEntries(N.map(n=>[n.id,n]));const L=D.links.map(([a,b,t])=>({a:byId[a],b:byId[b],t}));
function step(k){for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){const a=N[i],b=N[j];let dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy||1;const f=Math.min(2200/d2,4)*k,d=Math.sqrt(d2);dx/=d;dy/=d;a.vx+=dx*f;a.vy+=dy*f;b.vx-=dx*f;b.vy-=dy*f}
for(const l of L){const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,d=Math.hypot(dx,dy)||1,want=l.t==="orbits"?70:l.a.group==="place"&&l.b.group==="hero"?80:60,f=(d-want)*0.03*k;l.a.vx+=dx/d*f;l.a.vy+=dy/d*f;l.b.vx-=dx/d*f;l.b.vy-=dy/d*f}
for(const n of N){n.vx+=(W/2-n.x)*0.002*k;n.vy+=(H/2-n.y)*0.002*k;if(n.fixed){n.vx=n.vy=0;continue}n.x+=n.vx;n.y+=n.vy;n.vx*=0.6;n.vy*=0.6;n.x=Math.max(30,Math.min(W-130,n.x));n.y=Math.max(20,Math.min(H-20,n.y))}}
for(let i=0;i<500;i++)step(1);
const svg=document.getElementById("g"),NS="http://www.w3.org/2000/svg";
const el=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
const lines=L.map(l=>{const e=el("line",{});svg.appendChild(e);return e});
const col={place:"var(--place)",hero:"var(--hero)",item:"var(--item)"};
const gs=N.map(n=>{const g=el("g",{class:"n"});g.appendChild(el("circle",{r:R[n.group],fill:col[n.group],stroke:"#0b0d14","stroke-width":2}));const t=el("text",{x:R[n.group]+4,y:4});t.textContent=n.label;g.appendChild(t);svg.appendChild(g);return g});
function draw(){L.forEach((l,i)=>{lines[i].setAttribute("x1",l.a.x);lines[i].setAttribute("y1",l.a.y);lines[i].setAttribute("x2",l.b.x);lines[i].setAttribute("y2",l.b.y)});N.forEach((n,i)=>gs[i].setAttribute("transform","translate("+n.x+","+n.y+")"))}
draw();
const info=document.getElementById("info");
function esc(s){return s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c])}
function select(n){const nb=new Set([n.id]);L.forEach((l,i)=>{const on=l.a===n||l.b===n;lines[i].classList.toggle("hl",on);if(on){nb.add(l.a.id);nb.add(l.b.id)}});
N.forEach((m,i)=>gs[i].classList.toggle("dim",!nb.has(m.id)));
const rel=L.filter(l=>l.a===n||l.b===n).map(l=>{const o=l.a===n?l.b:l.a;return '<li data-id="'+o.id+'">'+esc(o.label)+' <span style="color:var(--muted)">('+esc(l.a===n?l.t:{"origin of":"comes from","home of":"lives at","orbits":"orbited by","hero item":"item of"}[l.t])+')</span></li>'}).join("");
info.innerHTML="<h2>"+esc(n.label)+'</h2><div class="sub">'+esc(n.group+" · "+n.sub)+"</div>"+n.lines.map(s=>"<p>"+esc(s)+"</p>").join("")+(rel?"<ul>"+rel+"</ul>":"");
info.querySelectorAll("li").forEach(li=>li.onclick=()=>select(byId[li.dataset.id]))}
let drag=null,moved=false,start=null;
function pt(e){const r=svg.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}}
gs.forEach((g,i)=>g.addEventListener("pointerdown",e=>{drag=N[i];moved=false;start=pt(e);drag.fixed=true;g.setPointerCapture(e.pointerId)}));
svg.addEventListener("pointermove",e=>{if(!drag)return;const p=pt(e);if(!moved&&Math.hypot(p.x-start.x,p.y-start.y)<6)return;drag.x=p.x;drag.y=p.y;moved=true;for(let i=0;i<3;i++)step(0.3);draw()});
const up=()=>{if(drag&&!moved)select(drag);if(drag)drag.fixed=false;drag=null};gs.forEach(g=>g.addEventListener("pointerup",up));svg.addEventListener("pointerup",up);
</script></body></html>
`;
writeFileSync(join(ROOT, "lore", "graph.html"), html);
console.log(`lore/graph.html written (${places.length} places, ${nodes.length} nodes, ${links.length} links).`);
