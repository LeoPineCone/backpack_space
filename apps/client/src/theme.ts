/** Colours, fonts and the design size. Placeholder look until real assets exist. */
export const W = 390;
export const H = 844;

export const C = {
  bg: 0x0d1326,
  bgDeep: 0x070b18,
  backdrop: 0x141c38,
  panel: 0x1a2340,
  line: 0x3a476e,
  text: 0xeef1fb,
  dim: 0xa9b4d6,
  gold: 0xf5b942,
  goldInk: 0x1a1300,
  cyan: 0x5cc8ff,
  cyanInk: 0x04202e,
  bag: 0x24305a,
  bagLine: 0x4a5a8c,
  gridLine: 0x2a3558,
  good: 0x6fe3a1,
  bad: 0xff7a59,
} as const;

export const RARITY: Record<string, number> = { common: 0x8892b0, rare: 0x5cc8ff, epic: 0xc9a0ff, legendary: 0xf5b942, artifact: 0xff7a59 };
export const RARITY_PIPS: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4, artifact: 5 };

/** Fill of an item tile by its first type, so types can be told apart without art. */
export const TAG_FILL: Record<string, number> = {
  weapon: 0x6b3340, armor: 0x2f4a7a, accessory: 0x56397a, pet: 0x7a5230, food: 0x6a6a2c, mechanical: 0x485468, organic: 0x2f6a45, bag: 0x24305a,
};

export const FONT = { display: '"Chakra Petch", "Trebuchet MS", sans-serif', text: 'Inter, system-ui, sans-serif' } as const;
