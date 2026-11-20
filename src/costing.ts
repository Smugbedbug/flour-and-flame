// Ingredient costing (v0.4). Prices are optional; nothing here ever invents a price or a density.
//
// Why v0.3 reported "incomplete" so often: it could only convert weight↔weight, volume↔volume or
// count↔count. "½ tsp baking soda" with a price per lb, a "pinch", or butter priced per stick
// marked the line — and therefore the whole recipe — incomplete. v0.4 fixes that by:
//   • using a recorded teaspoon weight (gramsPerTsp) for volume↔weight,
//   • US butter standard for sticks/tbsp (113.4 g/stick, 14.175 g/tbsp),
//   • counts incl. dozen for eggs,
//   • treating "pinch" as too small to cost (shown, never blocks completeness),
//   • following merged duplicates and matching names/aliases.
import type { CatalogIngredient, Ingredient, Recipe } from './types';
import { BUTTER_G_PER_STICK, BUTTER_G_PER_TBSP, isButter } from './units';

// ---------------- names, aliases, matching ----------------
const PHRASES: [RegExp, string][] = [
  [/\bsemi sweet\b/g, 'semisweet'],
  [/\b(ap|plain) flour\b/g, 'all purpose flour'],
  [/\bwhite sugar\b/g, 'granulated sugar'],
  [/\b(large |whole )?eggs?\b/g, 'egg'],
  [/\bchoc\b/g, 'chocolate'],
];

/** Canonical form used for matching only (never shown): "Semi-Sweet Chocolate Chips" → "semisweet chocolate chip". */
export function canonicalName(name: string): string {
  let n = name.toLowerCase().replace(/[’']/g, '').replace(/[-_/,.()]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, to] of PHRASES) n = n.replace(re, to);
  n = n.replace(/\s+/g, ' ').trim();
  // singularize last word (chips→chip) but keep words like "molasses"
  if (!/(ss|ses|us|is)$/.test(n)) n = n.replace(/([a-z]{2,})s$/, '$1');
  return n;
}

/** Follow "merged into" links to the surviving catalog entry. */
export function resolveMerged(id: string | null | undefined, catalog: CatalogIngredient[]): CatalogIngredient | undefined {
  let cur = id ? catalog.find(c => c.id === id) : undefined;
  for (let guard = 0; cur?.mergedInto && guard < 10; guard++) cur = catalog.find(c => c.id === cur!.mergedInto) ?? cur;
  return cur;
}

/** Active (not merged) entries whose name or alias canonically equals the name. */
export function findByName(name: string, catalog: CatalogIngredient[]): CatalogIngredient | undefined {
  const n = canonicalName(name);
  const active = catalog.filter(c => !c.mergedInto);
  return active.find(c => canonicalName(c.name) === n) ?? active.find(c => (c.aliases ?? []).some(a => canonicalName(a) === n));
}

/** Import/editor matching: exact (canonical or alias) → {id, exact:true}; close name → suggestion; else null. */
export function matchCatalog(name: string, catalog: CatalogIngredient[]): { id: string; exact: boolean } | null {
  const exact = findByName(name, catalog);
  if (exact) return { id: exact.id, exact: true };
  const n = canonicalName(name);
  const close = catalog.filter(c => !c.mergedInto).find(c => { const m = canonicalName(c.name); return m.length > 3 && (n.includes(m) || m.includes(n)); });
  return close ? { id: close.id, exact: false } : null;
}

/** Pairs of active entries that look like the same ingredient. */
export function possibleDuplicates(catalog: CatalogIngredient[]): [CatalogIngredient, CatalogIngredient][] {
  const active = catalog.filter(c => !c.mergedInto);
  const out: [CatalogIngredient, CatalogIngredient][] = [];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    const an = [a.name, ...(a.aliases ?? [])].map(canonicalName), bn = [b.name, ...(b.aliases ?? [])].map(canonicalName);
    if (an.some(x => bn.includes(x))) out.push([a, b]);
  }
  return out;
}

// ---------------- interchangeable products ----------------
/** Built-in substitution groups. The first name is the reference for substituteRatio. */
export const SUBSTITUTION_GROUPS: { key: string; names: string[]; note: string }[] = [
  { key: 'vanilla', names: ['Vanilla extract', 'Vanilla bean paste'], note: 'Interchangeable 1:1 by volume unless a product sets its own ratio.' },
];

export function substitutionGroup(name: string) {
  const n = canonicalName(name);
  return SUBSTITUTION_GROUPS.find(g => g.names.some(x => canonicalName(x) === n));
}

/**
 * The ingredient line as it should be shown/costed for a session substitution.
 * Never mutates the master line.
 */
export function effectiveLine(line: Ingredient, chosen: string | undefined, catalog: CatalogIngredient[]): Ingredient {
  if (!chosen || canonicalName(chosen) === canonicalName(line.name)) return line;
  const g = substitutionGroup(line.name);
  if (!g || !g.names.some(x => canonicalName(x) === canonicalName(chosen))) return line;
  const ratio = (name: string) => findByName(name, catalog)?.substituteRatio ?? 1;
  const product = findByName(chosen, catalog);
  return { ...line, name: chosen, amount: Math.round(line.amount * (ratio(chosen) / ratio(line.name)) * 1000) / 1000, catalogIngredientId: product?.id ?? null };
}

export function effectiveRecipe(recipe: Recipe, subs: Record<string, string> | undefined, catalog: CatalogIngredient[]): Recipe {
  if (!subs || !Object.keys(subs).length) return recipe;
  return { ...recipe, ingredients: recipe.ingredients.map(l => effectiveLine(l, subs[l.id], catalog)) };
}

// ---------------- units ----------------
type Dim = 'w' | 'v' | 'c';
const WEIGHT: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.349523125, lb: 453.59237, lbs: 453.59237 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892159, teaspoon: 4.92892159, teaspoons: 4.92892159, tbsp: 14.7867648, tablespoon: 14.7867648, tablespoons: 14.7867648, cup: 236.5882365, cups: 236.5882365, 'fl oz': 29.5735296, floz: 29.5735296 };
const COUNT: Record<string, number> = { each: 1, item: 1, items: 1, egg: 1, eggs: 1, large: 1, whole: 1, dozen: 12 };
const TSP_ML = VOLUME.tsp;

/** Amount in a base unit (g, ml or count). Butter sticks/tbsp/tsp use the US butter weight standard. */
export function toBase(amount: number, unit: string, butter: boolean): { dim: Dim; value: number } | null {
  const u = unit.trim().toLowerCase();
  if (butter) {
    if (u === 'stick' || u === 'sticks') return { dim: 'w', value: amount * BUTTER_G_PER_STICK };
    if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return { dim: 'w', value: amount * BUTTER_G_PER_TBSP };
    if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return { dim: 'w', value: (amount * BUTTER_G_PER_TBSP) / 3 };
  }
  if (u in WEIGHT) return { dim: 'w', value: amount * WEIGHT[u] };
  if (u in VOLUME) return { dim: 'v', value: amount * VOLUME[u] };
  if (u in COUNT) return { dim: 'c', value: amount * COUNT[u] };
  return null;
}

/** Converts a recipe quantity into the product's package base, using the product's teaspoon weight if needed. */
export function quantityInPackageBase(amount: number, unit: string, product: CatalogIngredient, butter: boolean): { value: number } | { problem: string } {
  const from = toBase(amount, unit, butter);
  const to = product.packageUnit ? toBase(1, product.packageUnit, butter) : null;
  if (!from) return { problem: `unit “${unit}” can't be costed` };
  if (!to) return { problem: `package unit “${product.packageUnit}” isn't supported${product.packageUnit === 'stick' ? ' (sticks are for butter only)' : ''}` };
  if (from.dim === to.dim) return { value: from.value };
  const gpt = product.gramsPerTsp;
  if (from.dim === 'v' && to.dim === 'w') return gpt ? { value: (from.value / TSP_ML) * gpt } : { problem: `recipe uses ${unit}, price is by weight. Add the teaspoon weight` };
  if (from.dim === 'w' && to.dim === 'v') return gpt ? { value: (from.value / gpt) * TSP_ML } : { problem: `recipe uses ${unit}, price is by volume. Add the teaspoon weight` };
  const gpe = product.gramsPerEach;
  if (from.dim === 'w' && to.dim === 'c') return gpe ? { value: from.value / gpe } : { problem: `recipe uses ${unit} but the price is per ${product.packageUnit}. Add the grams per item` };
  if (from.dim === 'c' && to.dim === 'w') return gpe ? { value: from.value * gpe } : { problem: `recipe uses ${unit} but the price is per ${product.packageUnit}. Add the grams per item` };
  return { problem: from.dim === 'c' || to.dim === 'c' ? `recipe uses ${unit} but the price is per ${product.packageUnit}` : 'units don’t match' };
}

// ---------------- recipe cost ----------------
export type LineStatus = 'priced' | 'optional' | 'negligible' | 'free' | 'no-match' | 'no-price' | 'unit-mismatch';
export type LineCost = {
  lineId: string;
  name: string;
  status: LineStatus;
  cost: number | null;
  product?: CatalogIngredient;
  /** plain-language reason when not priced */
  message?: string;
  /** a priced entry with the same name exists: suggest merging */
  duplicateOf?: CatalogIngredient;
};
export type RecipeCost = {
  /** null whenever any required ingredient can't be priced — never a misleading $0.00 */
  total: number | null;
  complete: boolean;
  /** sum of the lines that could be priced (for "at least $x" hints only) */
  pricedSubtotal: number;
  lines: LineCost[];
  issues: LineCost[];
  priced: number;
  required: number;
  /** legacy field: names needing attention */
  missing: string[];
};

function isPinch(unit: string) { return /^(pinch|pinches|dash|dashes|to taste)$/i.test(unit.trim()); }
/** Plain water costs nothing (unless you give it a price). */
export function isWater(name: string) { return /^(hot |cold |warm |boiling |ice |tap |filtered |room temperature )?water$/.test(canonicalName(name)); }

// Recipes available to cost "made from recipe" ingredients (set by the app; tests can pass opts.recipes).
let registry: Recipe[] = [];
export function setCostingRecipes(recipes: Recipe[]) { registry = recipes; }
type Ctx = { recipes: Recipe[]; depth: number };

export function lineCost(line: Ingredient, catalog: CatalogIngredient[], factor = 1, ctx: Ctx = { recipes: registry, depth: 0 }): LineCost {
  const base: Omit<LineCost, 'status' | 'cost'> = { lineId: line.id, name: line.name };
  if (line.optional) return { ...base, status: 'optional', cost: null, message: 'optional; not included' };
  if (isPinch(line.unit)) return { ...base, status: 'negligible', cost: 0, message: 'a pinch; too small to cost' };
  let product = resolveMerged(line.catalogIngredientId, catalog);
  if (!product) product = findByName(line.name, catalog);
  if (!product) return isWater(line.name) ? { ...base, status: 'free', cost: 0, message: 'water; free' } : { ...base, status: 'no-match', cost: null, message: 'not in the price list' };
  base.product = product;
  if (product.free || (isWater(product.name) && product.price === undefined)) return { ...base, status: 'free', cost: 0, message: 'costs nothing' };
  // Made from one of your own recipes → cost per gram from that recipe
  if (product.fromRecipeId) {
    const sub = ctx.recipes.find(r => r.id === product!.fromRecipeId && !r.deletedAt);
    if (!sub) return { ...base, status: 'unit-mismatch', cost: null, message: 'its linked recipe was not found' };
    if (ctx.depth > 4) return { ...base, status: 'unit-mismatch', cost: null, message: 'recipes use each other in a loop' };
    if (!sub.yieldWeightG) return { ...base, status: 'unit-mismatch', cost: null, message: `enter the finished batch weight of “${sub.title}”` };
    const subCost = recipeCost(sub, catalog, { recipes: ctx.recipes, depth: ctx.depth + 1 });
    if (!subCost.complete) return { ...base, status: 'unit-mismatch', cost: null, message: `“${sub.title}” costing is incomplete (${subCost.issues.length} item${subCost.issues.length > 1 ? 's' : ''})` };
    const q = toBase(line.amount * factor, line.unit, false);
    const grams = q?.dim === 'w' ? q.value : q?.dim === 'v' && product.gramsPerTsp ? (q.value / TSP_ML) * product.gramsPerTsp : null;
    if (grams === null) return { ...base, status: 'unit-mismatch', cost: null, message: `recipe uses ${line.unit}; use grams (or add the teaspoon weight)` };
    return { ...base, status: 'priced', cost: (subCost.total! / sub.yieldWeightG) * grams };
  }
  // Priced like another ingredient (e.g. egg yolk = whole egg)
  if (product.costAs) {
    const target = resolveMerged(product.costAs, catalog);
    if (target && target.id !== product.id && !target.costAs) product = { ...target, gramsPerTsp: product.gramsPerTsp ?? target.gramsPerTsp, gramsPerEach: product.gramsPerEach ?? target.gramsPerEach };
  }
  const butter = isButter(line.name) || isButter(product.name);
  if (product.price === undefined || product.packageAmount === undefined || !product.packageUnit) {
    const twin = findByName(product.name, catalog.filter(c => c.id !== product!.id && c.price !== undefined));
    return { ...base, status: 'no-price', cost: null, message: 'no price yet', duplicateOf: twin };
  }
  const pkg = toBase(product.packageAmount, product.packageUnit, butter);
  const q = quantityInPackageBase(line.amount * factor, line.unit, product, butter);
  if ('problem' in q || !pkg || pkg.value <= 0) return { ...base, status: 'unit-mismatch', cost: null, message: 'problem' in q ? q.problem : 'check package size' };
  return { ...base, status: 'priced', cost: product.price * (q.value / pkg.value) };
}

export function recipeCost(recipe: Recipe, catalog: CatalogIngredient[], opts: { factor?: number; substitutions?: Record<string, string>; recipes?: Recipe[]; depth?: number } = {}): RecipeCost {
  const r = effectiveRecipe(recipe, opts.substitutions, catalog);
  const ctx: Ctx = { recipes: opts.recipes ?? registry, depth: opts.depth ?? 0 };
  const lines = r.ingredients.map(l => lineCost(l, catalog, opts.factor ?? 1, ctx));
  const issues = lines.filter(l => l.status === 'no-match' || l.status === 'no-price' || l.status === 'unit-mismatch');
  const counted = lines.filter(l => l.status !== 'optional' && l.status !== 'free' && l.status !== 'negligible');
  const pricedSubtotal = lines.reduce((s, l) => s + (l.status === 'priced' ? l.cost! : 0), 0);
  return {
    total: issues.length ? null : pricedSubtotal,
    complete: issues.length === 0,
    pricedSubtotal,
    lines,
    issues,
    priced: counted.length - issues.length,
    required: counted.length,
    missing: issues.map(i => `${i.name} (${i.message})`),
  };
}

// ---------------- pieces / yields ----------------
export function isPanRecipe(r: Recipe): boolean {
  return /\b(pans?|sheets?|trays?)\b/i.test(r.yieldUnit) || ((r.category === 'Brownies' || r.category === 'Crispy Treats') && !!r.piecesPerPan);
}

/** Noun for one finished item, by category. */
export function itemNoun(r: Recipe, plural = true): string {
  if (r.category === 'Cookies') return plural ? 'cookies' : 'cookie';
  if (r.category === 'Brownies') return plural ? 'pieces' : 'piece';
  if (r.category === 'Crispy Treats') return plural ? 'squares' : 'square';
  if (r.category === 'Cupcakes') return plural ? 'cupcakes' : 'cupcake';
  return plural ? 'pieces' : 'piece';
}

/** Expected number of finished items for a batch, or null if it can't be known without inventing data. */
export function expectedItems(r: Recipe, factor = 1, piecesPerPan?: number): number | null {
  if (isPanRecipe(r)) {
    const per = piecesPerPan ?? r.piecesPerPan;
    return per ? Math.round(r.yieldAmount * factor * per * 100) / 100 : null;
  }
  if (/\b(batch|loaf|cake)\b/i.test(r.yieldUnit)) return null;
  return Math.round(r.yieldAmount * factor * 100) / 100;
}

export function costPerItem(cost: RecipeCost, items: number | null): number | null {
  return cost.total !== null && items && items > 0 ? cost.total / items : null;
}

export const money = (n: number) => (n < 0.995 && n > 0 ? `$${n.toFixed(n < 0.1 ? 3 : 2)}` : `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
