// "You usually sell about 24 Brown Butter a week and have 8 free: make a batch."
// Looks at the last few weeks of real orders (no tests, no tasting boxes, no cancelled orders)
// and compares the usual weekly dough-ball use per flavour with what's free in the freezer.
import { orderParts, type Order, type PlanRow } from './bakery';

export type Nudge = { recipeId: string; recipeTitle: string; perWeek: number; free: number; makeMore: number };

const DAY = 86_400_000;

export function doughNudges(orders: Order[], plan: PlanRow[], now = Date.now(), weeks = 4): Nudge[] {
  const real = orders.filter(o => !o.test && !o.sample && o.status !== 'cancelled');
  if (!real.length) return [];
  const first = Math.min(...real.map(o => Date.parse(o.createdAt)));
  const span = Math.min(weeks * 7, (now - first) / DAY);
  if (span < 10) return []; // under ~10 days of history: too early to call anything "usual"
  const since = now - span * DAY;
  const used = new Map<string, { title: string; n: number }>();
  for (const o of real) {
    if (Date.parse(o.createdAt) < since) continue;
    for (const p of orderParts(o.items)) if (p.dough) {
      const u = used.get(p.recipeId) ?? { title: p.recipeTitle, n: 0 };
      u.n += p.count; used.set(p.recipeId, u);
    }
  }
  const out: Nudge[] = [];
  for (const [recipeId, u] of used) {
    const perWeek = Math.round(u.n / (span / 7));
    if (perWeek < 6) continue; // fewer than half a dozen a week: not worth a nudge
    const row = plan.find(r => r.recipeId === recipeId);
    const free = Math.max(0, row ? row.available : 0);
    if (free < perWeek) out.push({ recipeId, recipeTitle: u.title, perWeek, free, makeMore: perWeek - free });
  }
  return out.sort((a, b) => b.makeMore - a.makeMore);
}
