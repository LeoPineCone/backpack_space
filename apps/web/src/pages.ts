/** The page templates of the website: plain HTML strings, one shared frame and stylesheet (build.ts writes them). */

export const PAGES = ["home", "support", "imprint", "privacy", "terms"] as const;
export type Page = (typeof PAGES)[number];

export interface Site {
  lang: string;
  languages: { id: string; name: string }[];
  t: (key: string) => string;
  facts: { stores: { apple: string; google: string }; supportEmail: string };
  /** theme colour per UI job (data/theme.json → ui) */
  colors: Record<string, string>;
  heroes: { id: string; name: string; title: string; focus: string }[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isTodo = (s: string) => s.includes("[[TODO:");
/** A text with its placeholders shown marked. */
const text = (s: string) => esc(s).replace(/\[\[TODO:[^\]]*\]\]/g, (m) => `<mark class="todo">${m}</mark>`);

const pathOf = (lang: string, page: Page) => (page === "home" ? `/${lang}/` : `/${lang}/${page}/`);

function css(c: Record<string, string>): string {
  return `
@font-face { font-family: "Chakra Petch"; font-weight: 600; font-display: swap; src: url(/assets/fonts/chakra-petch-latin-600-normal.woff2) format("woff2"); }
@font-face { font-family: "Chakra Petch"; font-weight: 700; font-display: swap; src: url(/assets/fonts/chakra-petch-latin-700-normal.woff2) format("woff2"); }
@font-face { font-family: Inter; font-weight: 400; font-display: swap; src: url(/assets/fonts/inter-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: Inter; font-weight: 600; font-display: swap; src: url(/assets/fonts/inter-latin-600-normal.woff2) format("woff2"); }
:root { ${Object.entries(c)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(" ")} }
* { box-sizing: border-box; }
html { background: var(--bgDeep); }
body { margin: 0; color: var(--text); font: 400 17px/1.55 Inter, system-ui, sans-serif; background: var(--bg) url(/assets/space.jpg) center top / cover fixed; }
a { color: var(--cyan); }
h1, h2, h3, .brand, .btn, nav { font-family: "Chakra Petch", "Trebuchet MS", sans-serif; letter-spacing: 0.04em; }
h1 { font-size: clamp(40px, 9vw, 76px); line-height: 1; margin: 0 0 12px; text-transform: uppercase; color: var(--gold); }
h2 { font-size: 28px; margin: 0 0 16px; text-transform: uppercase; }
h3 { font-size: 20px; margin: 0 0 6px; text-transform: uppercase; color: var(--gold); }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 16px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; }
.brand { color: var(--text); text-decoration: none; font-weight: 700; font-size: 20px; text-transform: uppercase; }
nav { display: flex; gap: 14px; flex-wrap: wrap; font-size: 14px; text-transform: uppercase; }
nav a { color: var(--dim); text-decoration: none; }
nav a[aria-current] { color: var(--gold); }
.panel { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 2px solid var(--line); border-radius: 18px; padding: 22px; box-shadow: 4px 5px 0 var(--ink); }
.hero { padding: 48px 0 32px; display: grid; gap: 24px; }
.lead { font-size: 19px; max-width: 640px; }
.stores { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.btn { display: inline-block; padding: 14px 26px; border-radius: 999px; background: var(--gold); color: var(--goldInk); font-weight: 700; text-decoration: none; text-transform: uppercase; border: 2px solid var(--ink); box-shadow: 3px 4px 0 var(--ink); }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
section { margin: 28px 0; }
.heroes .panel { display: grid; grid-template-rows: auto 1fr; text-align: center; }
.heroes img { width: 100%; max-width: 220px; height: 260px; object-fit: contain; margin: 0 auto 8px; }
.heroes .title { color: var(--dim); font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.heroes p { font-size: 15px; margin: 0; }
.dim { color: var(--dim); }
mark.todo { background: var(--bad); color: var(--ink); padding: 0 4px; border-radius: 4px; }
footer { padding: 28px 0 40px; color: var(--dim); font-size: 14px; display: flex; gap: 16px; flex-wrap: wrap; justify-content: space-between; }
footer a { color: var(--dim); }
.langs { display: flex; gap: 10px; }
.legal { white-space: pre-line; }
`;
}

function frame(s: Site, page: Page, title: string, body: string): string {
  const nav = (p: Page, label: string) => `<a href="${pathOf(s.lang, p)}"${p === page ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  return `<!doctype html>
<html lang="${s.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(s.t("site.description"))}">
${s.languages.map((l) => `<link rel="alternate" hreflang="${l.id}" href="${pathOf(l.id, page)}">`).join("\n")}
<style>${css(s.colors)}</style>
</head>
<body>
<div class="wrap">
<header>
<a class="brand" href="${pathOf(s.lang, "home")}">${esc(s.t("site.title"))}</a>
<nav>${nav("home", s.t("nav.home"))}${nav("support", s.t("nav.support"))}</nav>
</header>
<main>
${body}
</main>
<footer>
<span>${esc(s.t("footer.made"))}</span>
<span>${nav("imprint", s.t("nav.imprint"))} · ${nav("privacy", s.t("nav.privacy"))} · ${nav("terms", s.t("nav.terms"))}</span>
<span class="langs" aria-label="${esc(s.t("nav.language"))}">${s.languages.map((l) => `<a href="${pathOf(l.id, page)}" hreflang="${l.id}"${l.id === s.lang ? ' aria-current="true"' : ""}>${esc(l.name)}</a>`).join("")}</span>
</footer>
</div>
</body>
</html>
`;
}

function storeButton(label: string, url: string): string {
  // a placeholder link goes nowhere and shows what is missing
  return isTodo(url)
    ? `<span><a class="btn" href="#">${esc(label)}</a> ${text(url)}</span>`
    : `<a class="btn" href="${esc(url)}" rel="noopener">${esc(label)}</a>`;
}

function home(s: Site): string {
  const steps = [1, 2, 3]
    .map((i) => `<div class="panel"><h3>${esc(s.t(`home.how.${i}.title`))}</h3><p>${text(s.t(`home.how.${i}.text`))}</p></div>`)
    .join("\n");
  const heroes = s.heroes
    .map(
      (h) =>
        `<div class="panel"><img src="/assets/heroes/${h.id}.webp" alt="${esc(h.name)}" loading="lazy"><div><h3>${esc(h.name)}</h3><div class="title">${esc(h.title)}</div><p>${esc(h.focus)}</p></div></div>`,
    )
    .join("\n");
  return frame(
    s,
    "home",
    `${s.t("site.title")}: ${s.t("home.tagline")}`,
    `<div class="hero">
<h1>${esc(s.t("site.title"))}</h1>
<h2>${esc(s.t("home.tagline"))}</h2>
<p class="lead">${text(s.t("home.lead"))}</p>
<div class="stores" aria-label="${esc(s.t("home.stores"))}">${storeButton(s.t("home.store.apple"), s.facts.stores.apple)}${storeButton(s.t("home.store.google"), s.facts.stores.google)}</div>
</div>
<section><h2>${esc(s.t("home.how.title"))}</h2><div class="grid">${steps}</div></section>
<section class="heroes"><h2>${esc(s.t("home.heroes.title"))}</h2><div class="grid">${heroes}</div></section>
<section class="panel"><h2>${esc(s.t("home.free.title"))}</h2><p>${text(s.t("home.free.text"))}</p></section>`,
  );
}

function support(s: Site): string {
  const mail = s.facts.supportEmail;
  const contact = isTodo(mail) ? text(mail) : `<a href="mailto:${esc(mail)}">${esc(mail)}</a>`;
  return frame(
    s,
    "support",
    `${s.t("support.title")} · ${s.t("site.title")}`,
    `<section class="panel"><h2>${esc(s.t("support.title"))}</h2><p>${text(s.t("support.text"))} ${contact}</p></section>
<section class="panel" id="delete"><h2>${esc(s.t("support.delete.title"))}</h2><p>${text(s.t("support.delete.text"))}</p></section>`,
  );
}

function legal(s: Site, page: "imprint" | "privacy" | "terms"): string {
  return frame(
    s,
    page,
    `${s.t(`${page}.title`)} · ${s.t("site.title")}`,
    `<section class="panel legal"><h2>${esc(s.t(`${page}.title`))}</h2><p>${text(s.t(`${page}.text`))}</p></section>`,
  );
}

export function render(s: Site, page: Page): string {
  return page === "home" ? home(s) : page === "support" ? support(s) : legal(s, page);
}
