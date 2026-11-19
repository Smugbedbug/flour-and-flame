// Products, orders and how they connect to The Freezer — all computed from the shared event list,
// so every device shows the same thing and nothing is ever deducted twice.
import { computeFreezer, orderEvents, type FreezerState, type LedgerEvent, type OrderCreate, type OrderItem, type OrderStatus, type PickupOption, type Product, type ShopSettings } from './freezer';
import type { ProductionRecord } from './types';

export type Order = Omit<OrderCreate, 'type' | 'eventId' | 'device' | 'seq' | 'at'> & {
  createdAt: string;
  updatedAt: string;
  /** status before it was cancelled (to know whether dough was already used) */
  statusBeforeCancel?: OrderStatus;
  paidMethod?: string;
  costSnapshot?: { total: number | null; complete: boolean };
  packed?: boolean;
  /** handed to someone who passes it on (e.g. Mom); null/undefined = not handed off */
  handedTo?: string | null;
};

export const STATUS_LABEL: Record<OrderStatus, string> = { pending: 'Requested', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready for pickup', completed: 'Picked up', cancelled: 'Cancelled' };
/** Confirmed orders hold dough balls; "ready" means baked, so the dough is used. */
export const RESERVES: OrderStatus[] = ['confirmed', 'preparing'];
export const CONSUMED: OrderStatus[] = ['ready', 'completed'];

export function doughUsedBy(o: Order): boolean {
  return CONSUMED.includes(o.status) || (o.status === 'cancelled' && !!o.statusBeforeCancel && CONSUMED.includes(o.statusBeforeCancel));
}
export const ballsFor = (items: OrderItem[]) => items.reduce((m, i) => { m[i.recipeId] = (m[i.recipeId] ?? 0) + i.pieces * i.qty; return m; }, {} as Record<string, number>);
export const orderLabel = (o: Pick<Order, 'orderNo' | 'orderId'>) => '#' + (o.orderNo ?? o.orderId.slice(0, 4).toUpperCase());
export const itemsTotal = (items: OrderItem[]) => Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;

export type PlanRow = { recipeId: string; recipeTitle: string; inFreezer: number; reserved: number; available: number; pending: number; makeMore: number };
export const DEFAULT_SHOP: ShopSettings = { open: true, emailCustomers: true };
export type BakeryState = { products: Product[]; orders: Order[]; freezer: FreezerState; plan: PlanRow[]; newFormOrders: Order[]; pickups: PickupOption[]; shop: ShopSettings; production: ProductionRecord[]; productionDeleted: string[] };

export function computeBakery(events: LedgerEvent[]): BakeryState {
  const products = new Map<string, Product>();
  const orders = new Map<string, Order>();
  const pickups = new Map<string, PickupOption>();
  const production = new Map<string, ProductionRecord>();
  const productionDeleted = new Set<string>();
  let shop: ShopSettings = DEFAULT_SHOP;
  const seen = new Set<string>();
  for (const ev of orderEvents(events)) {
    if (seen.has(ev.eventId)) continue;
    seen.add(ev.eventId);
    switch (ev.type) {
      case 'product.upsert': products.set(ev.product.productId, ev.product); break;
      case 'order.create': {
        if (orders.has(ev.orderId)) break;
        const { type: _t, eventId: _e, device: _d, seq: _s, at, ...rest } = ev; void _t; void _e; void _d; void _s;
        orders.set(ev.orderId, { ...rest, createdAt: at, updatedAt: at });
        break;
      }
      case 'order.update': { const o = orders.get(ev.orderId); if (o) orders.set(o.orderId, { ...o, ...ev.patch, updatedAt: ev.at }); break; }
      case 'order.status': {
        const o = orders.get(ev.orderId);
        if (o) orders.set(o.orderId, { ...o, status: ev.status, statusBeforeCancel: ev.status === 'cancelled' ? (o.status === 'cancelled' ? o.statusBeforeCancel : o.status) : undefined, updatedAt: ev.at, ...(ev.costSnapshot ? { costSnapshot: ev.costSnapshot } : {}) });
        break;
      }
      case 'order.payment': { const o = orders.get(ev.orderId); if (o) orders.set(o.orderId, { ...o, paid: ev.paid, paidMethod: ev.method, updatedAt: ev.at }); break; }
      case 'order.packed': { const o = orders.get(ev.orderId); if (o) orders.set(o.orderId, { ...o, packed: ev.packed, updatedAt: ev.at }); break; }
      case 'order.handoff': { const o = orders.get(ev.orderId); if (o) orders.set(o.orderId, { ...o, handedTo: ev.to, updatedAt: ev.at }); break; }
      case 'pickup.upsert': pickups.set(ev.pickup.pickupId, ev.pickup); break;
      case 'shop.settings': shop = { ...DEFAULT_SHOP, ...ev.settings }; break;
      case 'production.record': if (!productionDeleted.has(ev.record.id)) production.set(ev.record.id, ev.record); break;
      case 'production.delete': production.delete(ev.recordId); productionDeleted.add(ev.recordId); break;
    }
  }
  const list = [...orders.values()].sort((a, b) => (a.pickupDate ?? '9999').localeCompare(b.pickupDate ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  // dough used by baked orders comes out of the freezer (derived → can't happen twice)
  const consumed = list.filter(doughUsedBy).flatMap(o => o.items.map(i => ({ recipeId: i.recipeId, recipeTitle: i.recipeTitle, count: i.pieces * i.qty, label: `Order ${orderLabel(o)}` })));
  const freezer = computeFreezer(events, consumed);
  const rows = new Map<string, PlanRow>();
  const row = (id: string, title: string) => { let r = rows.get(id); if (!r) { r = { recipeId: id, recipeTitle: title, inFreezer: 0, reserved: 0, available: 0, pending: 0, makeMore: 0 }; rows.set(id, r); } return r; };
  for (const f of freezer.items) row(f.recipeId, f.recipeTitle).inFreezer = f.total;
  for (const o of list) for (const i of o.items) {
    if (RESERVES.includes(o.status)) row(i.recipeId, i.recipeTitle).reserved += i.pieces * i.qty;
    if (o.status === 'pending') row(i.recipeId, i.recipeTitle).pending += i.pieces * i.qty;
  }
  const plan = [...rows.values()].map(r => ({ ...r, available: r.inFreezer - r.reserved, makeMore: Math.max(0, r.reserved + r.pending - r.inFreezer) })).sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle));
  return { products: [...products.values()].sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle) || a.pieces - b.pieces), orders: list, freezer, plan, newFormOrders: list.filter(o => o.source === 'form' && o.status === 'pending'),
    pickups: [...pickups.values()].sort((a, b) => a.name.localeCompare(b.name)), shop, production: [...production.values()], productionDeleted: [...productionDeleted] };
}

export type Shortfall = { recipeId: string; recipeTitle: string; need: number; short: number };
/**
 * Which orders the freezer can actually cover. Freezer stock is given to confirmed orders first
 * (earliest pickup first), then to requests. Any order that isn't fully covered gets a shortfall.
 */
export function orderCoverage(b: Pick<BakeryState, 'orders' | 'freezer'>): Record<string, Shortfall[]> {
  const left: Record<string, number> = Object.fromEntries(b.freezer.items.map(i => [i.recipeId, i.total]));
  const out: Record<string, Shortfall[]> = {};
  const byPickup = (a: Order, c: Order) => (a.pickupDate ?? '9999').localeCompare(c.pickupDate ?? '9999') || a.createdAt.localeCompare(c.createdAt);
  const confirmed = b.orders.filter(o => RESERVES.includes(o.status)).sort(byPickup);
  const pending = b.orders.filter(o => o.status === 'pending').sort(byPickup);
  for (const o of [...confirmed, ...pending]) {
    const need = ballsFor(o.items);
    const shorts: Shortfall[] = [];
    for (const [recipeId, n] of Object.entries(need)) {
      const have = Math.max(0, left[recipeId] ?? 0);
      const covered = Math.min(have, n);
      left[recipeId] = have - covered;
      if (covered < n) shorts.push({ recipeId, recipeTitle: o.items.find(i => i.recipeId === recipeId)!.recipeTitle, need: n, short: n - covered });
    }
    if (shorts.length) out[o.orderId] = shorts;
  }
  return out;
}
