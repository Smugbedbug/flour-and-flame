// Shopping list: what to bake (dough short for orders, fresh treats for orders, extra batches you add)
// → batch sizes → every ingredient combined → how many packages to buy and roughly what it costs.
// Never guesses a density: amounts that can't be combined are listed separately.
import { orderParts, RESERVES, type BakeryState } from './bakery';
import { canonicalName, findByName, isWater, quantityInPackageBase, resolveMerged, toBase, money, expectedItems } from './costing';
import { suggestBatch, yieldPerBatch, factorLabel, type YieldBasis } from './bakePlan';
import { isButter, BUTTER_G_PER_STICK } from './units';
import type { CatalogIngredient, ProductionRecord, Recipe } from './types';

export type Batch = { recipeId: string; title: string; need: number; factor: number; expected: number; reason: string; basis: YieldBasis['source'] | 'pans' | 'manual'; subFor?: string };
export type ShopAmount = { dim: 'w' | 'v' | 'c' | 'other'; value: number; unit?: string };
export type ShopLine = {
  key: string; name: string; product?: CatalogIngredient; amounts: ShopAmount[]; butter: boolean; pinchOnly: boolean; optional: boolean;
  usedIn: string[]; buy?: { packages: number; text: string; cost: number | null }; cost: number | null; store: string;
};
export type ShoppingList = { batches: Batch[]; cannotSize: { title: string; need: number }[]; lines: ShopLine[]; total: number | null; pricedTotal: number; unpriced: number };

const isPinch = (u: string) => /^(pinch|pinches|dash|dashes|to taste)$/i.test(u.trim());
const TSP_ML = 4.92892159;

function basisFor(r: Recipe, records: ProductionRecord[]): { basis: YieldBasis; kind: Batch['basis'] } | null {
  const b = yieldPerBatch(r, records);
  if (b) return { basis: b, kind: b.source };
  const items = expectedItems(r);
  return items ? { basis: { perBatch: items, source: 'recipe', bakes: 0 }, kind: 'pans' } : null;
}

/** What needs baking for orders. Cookies: dough balls short (freezer counted). Other treats: all pieces for orders not yet baked. */
export function batchesForOrders(b: Pick<BakeryState, 'plan' | 'orders'>, recipes: Recipe[], records: ProductionRecord[], includeRequests: boolean): { batches: Batch[]; cannotSize: { title: string; need: number }[] } {
  const need = new Map<string, { title: string; n: number; why: string }>();
  for (const r of b.plan) {
    const short = Math.max(0, r.reserved + (includeRequests ? r.pending : 0) - r.inFreezer);
    if (short > 0) need.set(r.recipeId, { title: r.recipeTitle, n: short, why: `${short} dough balls short` });
  }
  const fresh = new Map<string, { title: string; n: number }>();
  for (const o of b.orders) {
    if (!(RESERVES.includes(o.status) || (includeRequests && o.status === 'pending'))) continue;
    for (const p of orderParts(o.items)) if (!p.dough) { const f = fresh.get(p.recipeId) ?? { title: p.recipeTitle, n: 0 }; f.n += p.count; fresh.set(p.recipeId, f); }
  }
  for (const [id, f] of fresh) need.set(id, { title: f.title, n: f.n, why: `${f.n} pieces for orders` });
  const batches: Batch[] = [], cannotSize: { title: string; need: number }[] = [];
  for (const [id, x] of need) {
    const r = recipes.find(q => q.id === id && !q.deletedAt);
    const bb = r && basisFor(r, records);
    if (!r || !bb) { cannotSize.push({ title: x.title, need: x.n }); continue; }
    const s = suggestBatch(x.n, bb.basis);
    batches.push({ recipeId: id, title: r.title, need: x.n, factor: s.factor, expected: s.expected, reason: x.why, basis: bb.kind });
  }
  return { batches, cannotSize };
}

function addAmount(list: ShopAmount[], a: ShopAmount, gramsPerTsp?: number) {
  // combine like with like; volume ↔ weight only with a known teaspoon weight
  const conv = (x: ShopAmount): ShopAmount => (x.dim === 'v' && gramsPerTsp ? { dim: 'w', value: (x.value / TSP_ML) * gramsPerTsp } : x);
  const b = conv(a);
  const same = list.find(x => x.dim === b.dim && (b.dim !== 'other' || x.unit === b.unit));
  if (same) same.value += b.value; else list.push({ ...b });
}

/** Combined ingredient list for a set of batches. Homemade ingredients (e.g. caramel) become their own batch. */
export function shoppingList(batchesIn: Batch[], recipes: Recipe[], catalog: CatalogIngredient[], cannotSize: { title: string; need: number }[] = []): ShoppingList {
  const lines = new Map<string, ShopLine>();
  const batches: Batch[] = [...batchesIn];
  const queue = [...batchesIn.map(b => ({ b, depth: 0 }))];
  while (queue.length) {
    const { b, depth } = queue.shift()!;
    const r = recipes.find(x => x.id === b.recipeId);
    if (!r) continue;
    for (const ing of r.ingredients) {
      let product = resolveMerged(ing.catalogIngredientId, catalog) ?? findByName(ing.name, catalog);
      if (product?.costAs) { /* priced like another, but you still buy this item */ }
      if (isWater(ing.name) || product?.free) continue;
      const amt = ing.amount * b.factor;
      // made from one of your recipes → make that recipe too (sized by weight)
      if (product?.fromRecipeId && depth < 3) {
        const sub = recipes.find(x => x.id === product!.fromRecipeId && !x.deletedAt);
        const q = toBase(amt, ing.unit, false);
        const grams = q?.dim === 'w' ? q.value : q?.dim === 'v' && product.gramsPerTsp ? (q.value / TSP_ML) * product.gramsPerTsp : null;
        if (sub?.yieldWeightG && grams) {
          const existing = batches.find(x => x.recipeId === sub.id && x.subFor);
          const f = Math.round((grams / sub.yieldWeightG) * 100) / 100;
          if (existing) { existing.factor = Math.round((existing.factor + f) * 100) / 100; existing.reason += `, ${r.title}`; }
          const nb: Batch = existing ?? { recipeId: sub.id, title: sub.title, need: Math.round(grams), factor: f, expected: 0, reason: `homemade, for ${r.title}`, basis: 'manual', subFor: r.title };
          if (!existing) batches.push(nb);
          queue.push({ b: { ...nb, factor: f }, depth: depth + 1 });
          continue;
        }
      }
      const key = product ? 'p:' + product.id : 'n:' + canonicalName(ing.name);
      const butter = isButter(ing.name) || (!!product && isButter(product.name));
      let line = lines.get(key);
      if (!line) { line = { key, name: product?.name ?? ing.name, product, amounts: [], butter, pinchOnly: true, optional: true, usedIn: [], cost: null, store: product?.store?.trim() || 'Other' }; lines.set(key, line); }
      if (!line.usedIn.includes(r.title)) line.usedIn.push(r.title);
      if (!ing.optional) line.optional = false;
      if (isPinch(ing.unit)) continue;
      line.pinchOnly = false;
      const base = toBase(amt, ing.unit, butter);
      addAmount(line.amounts, base ?? { dim: 'other', value: amt, unit: ing.unit }, product?.gramsPerTsp);
    }
  }
  // packages to buy and cost
  let pricedTotal = 0, unpriced = 0;
  for (const line of lines.values()) {
    const p = line.product;
    if (line.pinchOnly || !p || p.price === undefined || !p.packageAmount || !p.packageUnit || line.amounts.length !== 1 || line.amounts[0].dim === 'other') { if (!line.pinchOnly && !line.optional) unpriced++; continue; }
    const a = line.amounts[0];
    const unit = a.dim === 'w' ? 'g' : a.dim === 'v' ? 'ml' : 'each';
    const q = quantityInPackageBase(a.value, unit, p, line.butter);
    const pkg = toBase(p.packageAmount, p.packageUnit, line.butter);
    if ('problem' in q || !pkg || pkg.value <= 0) { if (!line.optional) unpriced++; continue; }
    const packages = Math.max(1, Math.ceil(q.value / pkg.value - 1e-6));
    line.cost = p.price * (q.value / pkg.value);
    line.buy = { packages, text: `${packages} × ${p.packageAmount} ${p.packageUnit}${p.brand ? ` ${p.brand}` : ''}`, cost: Math.round(p.price * packages * 100) / 100 };
    if (!line.optional) pricedTotal += line.buy.cost!;
  }
  const sorted = [...lines.values()].sort((a, b) => a.store.localeCompare(b.store) || Number(a.optional) - Number(b.optional) || a.name.localeCompare(b.name));
  return { batches, cannotSize, lines: sorted, total: unpriced ? null : Math.round(pricedTotal * 100) / 100, pricedTotal: Math.round(pricedTotal * 100) / 100, unpriced };
}

// ---------------- friendly amounts ----------------
const frac = (n: number) => { const w = Math.floor(n), f = n - w; const q = [[0, ''], [0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾'], [1, '']].reduce((best, c) => (Math.abs(f - (c[0] as number)) < Math.abs(f - (best[0] as number)) ? c : best)); const ww = q[0] === 1 ? w + 1 : w; return `${ww || ''}${q[1]}` || '0'; };
export function amountText(a: ShopAmount, butter: boolean, name = ''): string {
  if (a.dim === 'w') {
    if (butter) { const sticks = a.value / BUTTER_G_PER_STICK; return `${frac(Math.ceil(sticks * 2) / 2)} stick${sticks > 1 ? 's' : ''} (${Math.round(a.value)} g)`; }
    const g = Math.round(a.value);
    return g >= 1000 ? `${(g / 1000).toFixed(2).replace(/\.?0+$/, '')} kg (${(a.value / 453.59237).toFixed(1)} lb)` : `${g} g${g >= 100 ? ` (${(a.value / 28.3495).toFixed(1)} oz)` : ''}`;
  }
  if (a.dim === 'v') {
    const tsp = a.value / TSP_ML;
    if (tsp >= 12) return `${frac(tsp / 48)} cup${tsp / 48 > 1.01 ? 's' : ''}`;
    if (tsp >= 3) return `${frac(tsp / 3)} tbsp`;
    return `${frac(tsp)} tsp`;
  }
  if (a.dim === 'c') { const n = Math.ceil(a.value - 1e-6); return /egg/i.test(name) ? `${n} egg${n !== 1 ? 's' : ''}` : `${n}`; }
  return `${Math.round(a.value * 100) / 100} ${a.unit ?? ''}`.trim();
}
export const lineAmountText = (l: ShopLine) => (l.pinchOnly ? 'a little (pinch)' : l.amounts.map(a => amountText(a, l.butter, l.name)).join(' + '));

export function listAsText(list: ShoppingList, have: Record<string, boolean>, extras: { id: string; text: string }[]): string {
  const out: string[] = ['Flour and Flame shopping list', ''];
  out.push('Bake: ' + list.batches.map(b => `${factorLabel(b.factor)} ${b.title}`).join(', '), '');
  let store = '';
  for (const l of list.lines) {
    if (have[l.key]) continue;
    if (l.store !== store) { store = l.store; out.push(`— ${store} —`); }
    out.push(`☐ ${l.name}: ${lineAmountText(l)}${l.buy ? ` → buy ${l.buy.text}` : ''}${l.optional ? ' (optional)' : ''}`);
  }
  for (const e of extras) if (!have['x:' + e.id]) out.push(`☐ ${e.text}`);
  if (list.total !== null) out.push('', `Estimated: ${money(list.total)}`);
  return out.join('\n');
}
