/** Colours, fonts and the design size. The values live in data/theme.json (docs/theme.md); this file only turns them into numbers. */
import theme from "../../../data/theme.json";

/** design width and safe-area height (see screen.ts) */
export { W, H, SCREEN } from "./screen";

type Palette = keyof typeof theme.palette;
type UiName = keyof typeof theme.ui;
const hex = (s: string): number => parseInt(s.slice(1), 16);
const table = (o: Record<string, string>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, hex(v)]));

/** Every UI colour by its job (bg, panel, text, gold, ...). */
export const C = Object.fromEntries(Object.entries(theme.ui).map(([k, p]) => [k, hex(theme.palette[p as Palette])])) as Record<UiName, number>;

export interface ButtonStyle { fill: number; ink: number; line?: number; ring?: number }
const button = (b: Record<string, string>): ButtonStyle => ({ fill: C[b.fill as UiName], ink: C[b.ink as UiName], line: b.line ? C[b.line as UiName] : undefined, ring: b.ring ? C[b.ring as UiName] : undefined });
/** Kinds of buttons: primary (one main action per screen), icon (round symbol buttons), secondary (outline). */
export const BUTTON = { primary: button(theme.buttons.primary), icon: button(theme.buttons.icon), secondary: button(theme.buttons.secondary), lockedAlpha: theme.buttons.lockedAlpha };

export const RARITY: Record<string, number> = table(theme.rarity);
export const RARITY_PIPS: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4, artifact: 5 };

/** Fill of an item tile by its first type, so types can be told apart without art. */
export const TAG_FILL: Record<string, number> = table(theme.tagFill);

export const FONT = theme.fonts;
