// Loyalty: a free half dozen after every N picked-up orders (default 5), then it starts again.
// Customers are matched by email (the order form tells them to use the same one every time);
// manual orders without an email fall back to the name, like the Customers list.
// Tasting boxes, test orders and cancelled orders never count.
import type { Order } from './bakery';
import type { ShopSettings } from './freezer';
import { customerKey } from './reports';

export const loyaltyOn = (shop: ShopSettings) => shop.loyalty?.off !== true;
export const loyaltyEvery = (shop: ShopSettings) => Math.min(20, Math.max(2, Math.round(shop.loyalty?.every ?? 5)));

const OPEN = ['pending', 'confirmed', 'preparing', 'ready'];
const counts = (o: Order) => o.status === 'completed' && !o.sample && !o.test;

export type LoyaltyRow = {
  key: string; name: string; email?: string;
  /** picked-up orders that count */ done: number;
  /** free half dozens earned so far / already used / still to use */ earned: number; used: number; available: number;
  /** orders still needed for the next free half dozen */ toNext: number;
  /** the open order that will earn the next one when it's picked up (if any) */ earner?: Order;
};

export function loyaltyRows(all: Order[], every: number): Map<string, LoyaltyRow> {
  const rows = new Map<string, LoyaltyRow>();
  const row = (o: Order) => {
    const k = customerKey(o);
    let r = rows.get(k);
    if (!r) { r = { key: k, name: o.customer.name, email: k.includes('@') ? k : undefined, done: 0, earned: 0, used: 0, available: 0, toNext: every }; rows.set(k, r); }
    return r;
  };
  const sorted = [...all].filter(o => !o.test && !o.sample).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of sorted) {
    const r = row(o);
    if (counts(o)) { r.done++; r.name = o.customer.name; }
    if (o.reward && o.status !== 'cancelled') r.used++;
  }
  for (const r of rows.values()) {
    r.earned = Math.floor(r.done / every);
    r.available = Math.max(0, r.earned - r.used);
    r.toNext = every - (r.done % every);
  }
  // predict: the toNext-th open order (oldest first) is the one that earns the free half dozen
  const open = new Map<string, Order[]>();
  for (const o of sorted) if (OPEN.includes(o.status)) { const k = customerKey(o); open.set(k, [...(open.get(k) ?? []), o]); }
  for (const [k, list] of open) { const r = rows.get(k)!; if (list.length >= r.toNext) r.earner = list[r.toNext - 1]; }
  return rows;
}

/** How much a free half dozen takes off this order: the priciest half-dozen box in it, or null if it has none. */
export function rewardValue(o: Pick<Order, 'items'>): number | null {
  const halves = o.items.filter(i => i.pieces === 6 && i.qty >= 1).map(i => i.unitPrice);
  return halves.length ? Math.max(...halves) : null;
}

/** Plain-words progress, e.g. "3 of 5 · 2 more to a free half dozen". */
export function progressText(r: LoyaltyRow, every: number): string {
  const n = r.done % every;
  return `${n} of ${every} · ${r.toNext === 1 ? 'next pickup earns a free half dozen' : `${r.toNext} more to a free half dozen`}`;
}
