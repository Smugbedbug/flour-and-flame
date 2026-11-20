// Major food allergens (the nine the FDA requires on labels). Stored on recipes so the
// order form and, later, cottage food labels can show "Contains: …" without retyping it.
import type { Recipe } from './types';

export const ALLERGENS = ['Milk', 'Eggs', 'Wheat', 'Soy', 'Peanuts', 'Tree nuts', 'Sesame', 'Fish', 'Shellfish'] as const;
export type Allergen = typeof ALLERGENS[number];

const ALIASES: Record<string, Allergen> = {
  milk: 'Milk', dairy: 'Milk',
  egg: 'Eggs', eggs: 'Eggs',
  wheat: 'Wheat',
  soy: 'Soy', soya: 'Soy', soybean: 'Soy', soybeans: 'Soy',
  peanut: 'Peanuts', peanuts: 'Peanuts',
  'tree nut': 'Tree nuts', 'tree nuts': 'Tree nuts', treenuts: 'Tree nuts',
  sesame: 'Sesame',
  fish: 'Fish',
  shellfish: 'Shellfish', 'crustacean shellfish': 'Shellfish',
};

/** "eggs", "Soybeans", "tree nuts" → the standard name; null if it isn't one of the nine. */
export function normalizeAllergen(v: unknown): Allergen | null {
  if (typeof v !== 'string') return null;
  return ALIASES[v.trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
}

/** Standard names, no duplicates, in the usual label order. Unknown entries are dropped. */
export function cleanAllergens(list: unknown): Allergen[] {
  if (!Array.isArray(list)) return [];
  const set = new Set(list.map(normalizeAllergen).filter(Boolean) as Allergen[]);
  return ALLERGENS.filter(a => set.has(a));
}

/** Problems with a recipe's allergen fields (empty = fine). */
export function allergenProblems(r: Record<string, unknown>): string[] {
  const p: string[] = [];
  for (const k of ['allergens', 'mayContain'] as const) {
    const v = r[k];
    if (v === undefined) continue;
    if (!Array.isArray(v)) { p.push(`"${k}" must be a list, e.g. ["Wheat", "Milk", "Eggs"] (or [] for none).`); continue; }
    const bad = v.filter(x => !normalizeAllergen(x));
    if (bad.length) p.push(`"${k}" has ${bad.map(b => `"${String(b)}"`).join(', ')}; use only: ${ALLERGENS.join(', ')}.`);
  }
  if (r.allergenNote !== undefined && typeof r.allergenNote !== 'string') p.push('"allergenNote" must be text.');
  return p;
}

/** Recipe with allergen lists in standard form (used on import). */
export function withCleanAllergens<T extends Partial<Recipe>>(r: T): T {
  const out = { ...r };
  if (r.allergens !== undefined) out.allergens = cleanAllergens(r.allergens);
  if (r.mayContain !== undefined) out.mayContain = cleanAllergens(r.mayContain).filter(a => !(out.allergens ?? []).includes(a));
  return out;
}

const lower = (a: Allergen) => a === 'Tree nuts' ? 'tree nuts' : a.toLowerCase();

/** "Contains: wheat, milk, eggs" — or "" when the recipe has no allergen info yet. "No major allergens" when checked and empty. */
export function containsLine(r: Pick<Recipe, 'allergens'>): string {
  if (!r.allergens) return '';
  const list = cleanAllergens(r.allergens);
  return list.length ? `Contains: ${list.map(lower).join(', ')}` : 'No major allergens';
}

export function mayContainLine(r: Pick<Recipe, 'mayContain'>): string {
  const list = cleanAllergens(r.mayContain);
  return list.length ? `May contain: ${list.map(lower).join(', ')}` : '';
}

/** One line for customers, e.g. "Contains: wheat, milk, eggs (pecans) · May contain: peanuts". */
export function allergenSummary(r: Pick<Recipe, 'allergens' | 'mayContain' | 'allergenNote'>): string {
  const c = containsLine(r);
  if (!c) return '';
  const note = r.allergenNote?.trim();
  return [note ? `${c} (${note})` : c, mayContainLine(r)].filter(Boolean).join(' · ');
}
