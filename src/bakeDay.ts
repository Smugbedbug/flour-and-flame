// Bake-day planner: for the orders picked up on a day, what to take out of the freezer, what to mix,
// and an oven timeline tray by tray. Bake times come from your recipe steps (or what you type in);
// nothing is guessed: unknown times are shown as unknown.
import { orderCoverage, orderParts, RESERVES, type BakeryState, type Order } from './bakery';
import { expectedItems } from './costing';
import { findDurations } from './logic';
import { suggestBatch, yieldPerBatch } from './bakePlan';
import type { ProductionRecord, Recipe } from './types';

export type BakeSettings = { start: string; perTray: number; traysAtOnce: number; minutes: Record<string, number> };
export const DEFAULT_SETTINGS: BakeSettings = { start: '09:00', perTray: 12, traysAtOnce: 1, minutes: {} };

export type BakeTime = { minutes: number; max: number; from: 'recipe' | 'you' } | null;
/** Bake time from the recipe: the first step that mentions baking and a time, e.g. "Bake 10–12 minutes". */
export function bakeTime(r: Recipe, overrides: Record<string, number> = {}): BakeTime {
  if (overrides[r.id] > 0) return { minutes: overrides[r.id], max: overrides[r.id], from: 'you' };
  for (const step of r.steps) {
    if (!/\bbake|\boven\b/i.test(step) || /preheat/i.test(step) && !/\bbake\b/i.test(step.replace(/preheat[^.]*\./i, ''))) continue;
    const d = findDurations(step).filter(x => x.minutes <= 120);
    if (d.length) return { minutes: d[0].minutes, max: d[0].maxMinutes, from: 'recipe' };
  }
  return null;
}

export type DayItem = {
  recipeId: string; title: string; recipe?: Recipe; kind: 'cookie' | 'pan';
  pieces: number; fromFreezer: number; mixMore: number; mixFactor: number | null;
  trays: number; pans: number; time: BakeTime; temp?: string;
};
export type OvenBlock = { recipeId: string; title: string; label: string; start: number; end: number | null; rounds: number; temp?: string };
export type DayPlan = { date: string; orders: Order[]; overdue: Order[]; items: DayItem[]; blocks: OvenBlock[]; finish: number | null; unknownTimes: string[] };

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const clock = (min: number) => { const h = Math.floor(min / 60) % 24, m = Math.round(min % 60); const d = new Date(2000, 0, 1, h, m); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

export function planBakeDay(b: Pick<BakeryState, 'orders' | 'freezer' | 'plan'>, recipes: Recipe[], records: ProductionRecord[], date: string, s: BakeSettings): DayPlan {
  const orders = b.orders.filter(o => RESERVES.includes(o.status) && o.pickupDate === date);
  const overdue = b.orders.filter(o => RESERVES.includes(o.status) && o.pickupDate && o.pickupDate < date);
  const coverage = orderCoverage(b);
  const per = new Map<string, DayItem>();
  for (const o of orders) for (const p of orderParts(o.items)) {
    let it = per.get(p.recipeId);
    const r = recipes.find(x => x.id === p.recipeId);
    if (!it) { it = { recipeId: p.recipeId, title: p.recipeTitle, recipe: r, kind: p.dough ? 'cookie' : 'pan', pieces: 0, fromFreezer: 0, mixMore: 0, mixFactor: null, trays: 0, pans: 0, time: r ? bakeTime(r, s.minutes) : null, temp: r?.ovenTemp }; per.set(p.recipeId, it); }
    it.pieces += p.count;
    if (p.dough) { const short = (coverage[o.orderId] ?? []).find(x => x.recipeId === p.recipeId)?.short ?? 0; it.mixMore += Math.min(short, p.count); }
  }
  for (const it of per.values()) {
    if (it.kind === 'cookie') {
      it.fromFreezer = it.pieces - it.mixMore;
      it.trays = Math.ceil(it.pieces / Math.max(1, s.perTray));
      if (it.mixMore > 0 && it.recipe) { const basis = yieldPerBatch(it.recipe, records); if (basis) it.mixFactor = suggestBatch(it.mixMore, basis).factor; }
    } else if (it.recipe) {
      const perPan = it.recipe.piecesPerPan || expectedItems(it.recipe) || 0;
      it.pans = perPan ? Math.ceil(it.pieces / perPan) : 0;
      const items = expectedItems(it.recipe);
      if (items) it.mixFactor = suggestBatch(it.pieces, { perBatch: items, source: 'recipe', bakes: 0 }).factor;
    }
  }
  // Pans first (they need time to cool before cutting), then cookies grouped by oven temperature.
  const items = [...per.values()].sort((a, c) => (a.kind !== c.kind ? (a.kind === 'pan' ? -1 : 1) : Number(!a.temp) - Number(!c.temp) || (a.temp ?? '').localeCompare(c.temp ?? '') || a.title.localeCompare(c.title)));
  const blocks: OvenBlock[] = [];
  let t: number | null = toMin(s.start);
  for (const it of items) {
    const units = it.kind === 'cookie' ? it.trays : Math.max(1, it.pans);
    if (!units) continue;
    const rounds = Math.ceil(units / Math.max(1, s.traysAtOnce));
    const dur = it.time ? it.time.max * rounds : null;
    const start: number | null = t;
    const end: number | null = start !== null && dur !== null ? start + dur : null;
    blocks.push({ recipeId: it.recipeId, title: it.title, label: `${units} ${it.kind === 'cookie' ? 'tray' : 'pan'}${units > 1 ? 's' : ''}${rounds > 1 ? ` in ${rounds} rounds` : ''}`, start: start ?? 0, end, rounds, temp: it.temp });
    t = end;
  }
  return { date, orders, overdue, items, blocks, finish: t, unknownTimes: items.filter(i => !i.time).map(i => i.title) };
}
