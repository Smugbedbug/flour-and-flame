// Display-only measurement helpers. Nothing here changes stored recipe quantities.
import type { Ingredient } from './types';
import { convert, normalizeIngredientName } from './logic';

/**
 * US butter standard used throughout the app (documented in docs/MEASUREMENTS.md):
 *   1 stick = 1/2 cup = 8 tablespoons = 4 oz = 113.4 g
 *   1 tablespoon = 14.175 g
 */
export const BUTTER_G_PER_STICK = 113.4;
export const BUTTER_G_PER_TBSP = BUTTER_G_PER_STICK / 8;

const FRACTIONS: [number, string][] = [[0, ''], [0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '']];
const SPOON_UNITS = new Set(['tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons', 'cup', 'cups']);
const COUNT_UNITS = new Set(['each', 'item', 'items', 'egg', 'eggs', 'large', 'whole']);
const WEIGHT_UNITS = new Set(['g', 'gram', 'grams', 'kg', 'oz', 'lb', 'lbs']);

/** Round to the nearest quarter and render with fraction glyphs, e.g. 1.5 -> "1½". */
export function quarter(value: number): string {
  const q = Math.round(value * 4) / 4;
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  const glyph = FRACTIONS.find(([f]) => Math.abs(f - frac) < 1e-6)?.[1] ?? '';
  if (whole === 0 && glyph) return glyph;
  return `${whole}${glyph}`;
}

function grams(value: number): string {
  if (value >= 1000) return `${Math.round(value).toLocaleString('en-US')} g`;
  if (value < 10) return `${Math.round(value * 10) / 10} g`;
  return `${Math.round(value)} g`;
}

/** Format one quantity in its own unit. Spoons/cups/counts use quarter increments. */
export function formatAmount(amount: number, unit: string): string {
  const u = unit.trim().toLowerCase();
  if (WEIGHT_UNITS.has(u)) {
    if (u === 'g' || u === 'gram' || u === 'grams') return grams(amount);
    return `${Math.round(amount * 100) / 100} ${unit}`;
  }
  if (SPOON_UNITS.has(u) || COUNT_UNITS.has(u)) {
    if (amount > 0 && amount < 0.125) return `< ¼ ${unit}`;
    const q = quarter(amount);
    const approx = amount > 0 && Math.abs(Math.round(amount * 4) / 4 - amount) / amount > 0.04 ? '≈ ' : '';
    return u === 'each' ? `${approx}${q}` : `${approx}${q} ${unit}`;
  }
  return `${Math.round(amount * 100) / 100} ${unit}`;
}

export function isButter(name: string): boolean {
  const n = normalizeIngredientName(name);
  if (!/\bbutter\b/.test(n)) return false;
  // Exclude non-dairy-butter products and already-browned butter (its weight per tbsp differs).
  return !/(peanut|almond|cashew|nut|seed|cocoa|apple|cookie|buttermilk|butterscotch|brown(ed)? butter|ghee)/.test(n);
}

/** Grams of butter for an ingredient line, or null when its unit isn't a weight/tbsp/stick. */
export function butterGrams(amount: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === 'stick' || u === 'sticks') return amount * BUTTER_G_PER_STICK;
  if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return amount * BUTTER_G_PER_TBSP;
  return convert(amount, u, 'g');
}

/** "170 g ≈ 12 tbsp ≈ 1½ sticks" — all three derived from the same gram value, so they scale together. */
export function butterDisplay(amount: number, unit: string): { grams: string; tbsp: string; sticks: string } | null {
  const g = butterGrams(amount, unit);
  if (g === null || g <= 0) return null;
  const tbsp = Math.round((g / BUTTER_G_PER_TBSP) * 2) / 2;
  const sticks = g / BUTTER_G_PER_STICK;
  const tbspText = Number.isInteger(tbsp) ? `${tbsp}` : `${Math.floor(tbsp)}½`.replace(/^0/, '');
  const stickText = quarter(sticks) || '<¼';
  return { grams: grams(g), tbsp: `${tbspText} tbsp`, sticks: `${stickText} ${Math.round(sticks * 4) / 4 === 1 ? 'stick' : 'sticks'}` };
}

/** Secondary measurements in the SAME dimension only (never guesses density). */
export function secondaryAmounts(amount: number, unit: string): string[] {
  const u = unit.trim().toLowerCase();
  const out: string[] = [];
  if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') {
    if (amount >= 3) out.push(formatAmount(amount / 3, 'tbsp'));
  } else if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') {
    if (amount < 1 && amount > 0) out.push(formatAmount(amount * 3, 'tsp'));
    if (amount >= 4) out.push(formatAmount(amount / 16, 'cup'));
  } else if (u === 'oz' || u === 'lb' || u === 'lbs' || u === 'kg') {
    const g = convert(amount, u, 'g');
    if (g !== null) out.push(grams(g));
  }
  return out;
}

export type TileDisplay = { primary: string; secondary: string[]; note?: string };

export function ingredientDisplay(line: Ingredient, factor: number, eggNote: string | null): TileDisplay {
  const amount = Math.round(line.amount * factor * 1000) / 1000;
  if (isButter(line.name)) {
    const b = butterDisplay(amount, line.unit);
    if (b) return { primary: b.grams, secondary: [b.tbsp, b.sticks] };
  }
  return { primary: formatAmount(amount, line.unit), secondary: secondaryAmounts(amount, line.unit), note: eggNote ?? undefined };
}
