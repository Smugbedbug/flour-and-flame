// Sales reports and the customer list, computed from orders (nothing extra is stored).
import { itemText, orderLabel, orderParts, type Order } from './bakery';

/** Local YYYY-MM-DD of an ISO timestamp. */
export const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** The day a sale counts on: when it was picked up. */
export const saleDay = (o: Order) => localDay(o.completedAt ?? o.updatedAt);

export type Period = { from: string; to: string; label: string };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function periods(today = new Date()): Record<string, Period> {
  const y = today.getFullYear(), m = today.getMonth();
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return {
    week: { from: ymd(monday), to: ymd(today), label: 'This week' },
    month: { from: ymd(new Date(y, m, 1)), to: ymd(today), label: 'This month' },
    lastMonth: { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)), label: 'Last month' },
    year: { from: ymd(new Date(y, 0, 1)), to: ymd(today), label: 'This year' },
    all: { from: '0000-01-01', to: '9999-12-31', label: 'All time' },
  };
}

export type Bucket = { key: string; label: string; revenue: number; orders: number };
export type SalesReport = {
  orders: Order[]; revenue: number; discounts: number; boxes: number; pieces: number;
  /** ingredient cost & profit only over orders whose cost was fully known at pickup */
  costed: { orders: number; revenue: number; cost: number; profit: number } | null; uncosted: number;
  unpaid: { orders: Order[]; total: number };
  byProduct: { name: string; boxes: number; revenue: number }[];
  byFlavor: { name: string; pieces: number }[];
  payments: { method: string; total: number; orders: number }[];
  topCustomers: { name: string; total: number; orders: number }[];
  buckets: Bucket[]; bucketUnit: 'week' | 'month';
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const add = <T,>(m: Map<string, T>, k: string, init: () => T, f: (v: T) => void) => { let v = m.get(k); if (!v) { v = init(); m.set(k, v); } f(v); };

export function salesReport(all: Order[], p: Period): SalesReport {
  const orders = all.filter(o => o.status === 'completed' && !o.sample).filter(o => { const d = saleDay(o); return d >= p.from && d <= p.to; }).sort((a, b) => saleDay(a).localeCompare(saleDay(b)));
  const byProduct = new Map<string, { name: string; boxes: number; revenue: number }>();
  const byFlavor = new Map<string, { name: string; pieces: number }>();
  const payments = new Map<string, { method: string; total: number; orders: number }>();
  const customers = new Map<string, { name: string; total: number; orders: number }>();
  let revenue = 0, discounts = 0, boxes = 0, pieces = 0, cOrders = 0, cRevenue = 0, cCost = 0;
  for (const o of orders) {
    revenue += o.total; discounts += o.discount ?? 0;
    for (const i of o.items) { boxes += i.qty; add(byProduct, i.name, () => ({ name: i.name, boxes: 0, revenue: 0 }), v => { v.boxes += i.qty; v.revenue += i.qty * i.unitPrice; }); }
    for (const part of orderParts(o.items)) { pieces += part.count; add(byFlavor, part.recipeTitle, () => ({ name: part.recipeTitle, pieces: 0 }), v => { v.pieces += part.count; }); }
    if (o.costSnapshot?.complete && o.costSnapshot.total !== null) { cOrders++; cRevenue += o.total; cCost += o.costSnapshot.total; }
    if (o.paid) add(payments, (o.paidMethod || 'not recorded').toLowerCase(), () => ({ method: o.paidMethod || 'not recorded', total: 0, orders: 0 }), v => { v.total += o.total; v.orders++; });
    add(customers, customerKey(o), () => ({ name: o.customer.name, total: 0, orders: 0 }), v => { v.total += o.total; v.orders++; v.name = o.customer.name; });
  }
  // chart buckets: weeks for short ranges, months for long ones
  const first = orders.length ? saleDay(orders[0]) : p.from, last = orders.length ? saleDay(orders[orders.length - 1]) : p.to;
  const start = p.from === '0000-01-01' ? first : p.from, end = p.to === '9999-12-31' ? last : p.to;
  const days = (Date.parse(end) - Date.parse(start)) / 864e5;
  const bucketUnit: 'week' | 'month' = days > 120 ? 'month' : 'week';
  const keyOf = (day: string) => { if (bucketUnit === 'month') return day.slice(0, 7); const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
  const buckets = new Map<string, Bucket>();
  if (orders.length || p.from !== '0000-01-01') {
    for (let d = new Date(start + 'T12:00:00'); ymd(d) <= end && buckets.size < 60; d.setDate(d.getDate() + (bucketUnit === 'month' ? 28 : 7))) { const k = keyOf(ymd(d)); if (!buckets.has(k)) buckets.set(k, { key: k, label: '', revenue: 0, orders: 0 }); }
    const kEnd = keyOf(end); if (!buckets.has(kEnd)) buckets.set(kEnd, { key: kEnd, label: '', revenue: 0, orders: 0 });
  }
  for (const o of orders) add(buckets, keyOf(saleDay(o)), () => ({ key: keyOf(saleDay(o)), label: '', revenue: 0, orders: 0 }), v => { v.revenue += o.total; v.orders++; });
  const bl = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map(b => ({ ...b, revenue: r2(b.revenue),
    label: bucketUnit === 'month' ? new Date(b.key + '-15T12:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : new Date(b.key + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));
  const unpaidOrders = orders.filter(o => !o.paid);
  return {
    orders, revenue: r2(revenue), discounts: r2(discounts), boxes, pieces,
    costed: cOrders ? { orders: cOrders, revenue: r2(cRevenue), cost: r2(cCost), profit: r2(cRevenue - cCost) } : null, uncosted: orders.length - cOrders,
    unpaid: { orders: unpaidOrders, total: r2(unpaidOrders.reduce((s, o) => s + o.total, 0)) },
    byProduct: [...byProduct.values()].map(v => ({ ...v, revenue: r2(v.revenue) })).sort((a, b) => b.revenue - a.revenue),
    byFlavor: [...byFlavor.values()].sort((a, b) => b.pieces - a.pieces),
    payments: [...payments.values()].map(v => ({ ...v, total: r2(v.total) })).sort((a, b) => b.total - a.total),
    topCustomers: [...customers.values()].map(v => ({ ...v, total: r2(v.total) })).sort((a, b) => b.total - a.total).slice(0, 5),
    buckets: bl, bucketUnit,
  };
}

// ---------------- customers ----------------
export const customerKey = (o: Pick<Order, 'customer'>) => { const c = (o.customer.contact ?? '').trim().toLowerCase(); return c.includes('@') ? c : 'name:' + o.customer.name.trim().toLowerCase(); };
export type CustomerRow = { key: string; name: string; contact?: string; email?: string; orders: Order[]; placed: number; spent: number; open: number; lastAt: string; favorite?: string; tasted: boolean; cameBack: boolean; rating?: number; subscribed: boolean };

export function customerList(all: Order[], unsubscribed: string[] = []): CustomerRow[] {
  const unsub = new Set(unsubscribed.map(e => e.toLowerCase()));
  const m = new Map<string, CustomerRow>();
  for (const o of [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = customerKey(o);
    let c = m.get(k);
    if (!c) { c = { key: k, name: o.customer.name, orders: [], placed: 0, spent: 0, open: 0, lastAt: o.createdAt, tasted: false, cameBack: false, subscribed: false }; m.set(k, c); }
    c.orders.push(o); c.name = o.customer.name; c.lastAt = o.createdAt;
    if (o.customer.contact) { c.contact = o.customer.contact; if (o.customer.contact.includes('@')) c.email = o.customer.contact.trim(); }
    if (o.status !== 'cancelled') c.placed++;
    if (o.news && o.customer.contact?.includes('@')) c.subscribed = true;
    if (o.status === 'completed' && !o.sample) c.spent += o.total;
    if (o.sample && o.status !== 'cancelled') c.tasted = true;
    else if (c.tasted && o.status !== 'cancelled') c.cameBack = true;
    if (['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)) c.open++;
  }
  return [...m.values()].map(c => {
    const fav = new Map<string, number>();
    for (const o of c.orders) if (o.status !== 'cancelled') for (const p of orderParts(o.items)) fav.set(p.recipeTitle, (fav.get(p.recipeTitle) ?? 0) + p.count);
    const top = [...fav.entries()].sort((a, b) => b[1] - a[1])[0];
    const rated = c.orders.filter(o => o.feedback && Object.keys(o.feedback.ratings).length).flatMap(o => Object.values(o.feedback!.ratings));
    if (c.email && unsub.has(c.email.toLowerCase())) c.subscribed = false;
    return { ...c, spent: r2(c.spent), orders: [...c.orders].reverse(), favorite: top?.[0], rating: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : undefined };
  }).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// ---------------- CSV ----------------
const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(cell).join(',')).join('\r\n');
export function salesCsv(orders: Order[]): string {
  return toCsv([['Order', 'Picked up', 'Customer', 'Email/contact', 'Pickup', 'Items', 'Discount', 'Total', 'Paid', 'Paid how', 'Ingredient cost'],
    ...orders.map(o => [orderLabel(o), saleDay(o), o.customer.name, o.customer.contact ?? '', o.pickupGroup ?? '', o.items.map(itemText).join('; '), o.discount ?? '', o.total.toFixed(2), o.paid ? 'yes' : 'no', o.paidMethod ?? '',
      o.costSnapshot?.complete && o.costSnapshot.total !== null ? o.costSnapshot.total.toFixed(2) : ''])]);
}
export function customersCsv(rows: CustomerRow[]): string {
  return toCsv([['Name', 'Email/contact', 'Orders', 'Spent (picked up)', 'Open orders', 'Last order', 'Favourite'], ...rows.map(c => [c.name, c.contact ?? '', c.placed, c.spent.toFixed(2), c.open, localDay(c.lastAt), c.favorite ?? ''])]);
}
export function downloadText(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type + ';charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- tasting boxes, feedback, how people found you ----------------
export type TastingStats = { given: number; people: number; cameBack: number; boughtTotal: number; cost: number | null; uncosted: number };
/** Of everyone who got a tasting box, how many later placed a real order (and what they spent). */
export function tastingStats(all: Order[]): TastingStats {
  const samples = all.filter(o => o.sample && o.status !== 'cancelled');
  const first = new Map<string, string>();
  for (const o of samples) { const k = customerKey(o); if (!first.has(k) || o.createdAt < first.get(k)!) first.set(k, o.createdAt); }
  const back = new Set<string>(); let bought = 0;
  for (const o of all) {
    if (o.sample || o.status === 'cancelled') continue;
    const t = first.get(customerKey(o));
    if (t && o.createdAt > t) { back.add(customerKey(o)); if (o.status === 'completed') bought += o.total; }
  }
  let cost = 0, uncosted = 0;
  for (const o of samples) if (o.costSnapshot?.complete && o.costSnapshot.total !== null) cost += o.costSnapshot.total; else if (o.status === 'completed') uncosted++;
  const costedAny = samples.some(o => o.costSnapshot?.complete);
  return { given: samples.length, people: first.size, cameBack: back.size, boughtTotal: r2(bought), cost: costedAny ? r2(cost) : null, uncosted };
}
export type FlavourFeedback = { name: string; avg: number; count: number };
export type FeedbackStats = { responses: number; flavours: FlavourFeedback[]; again: { yes: number; maybe: number; no: number }; comments: { name: string; text: string; at: string; avg: number }[] };
export function feedbackStats(all: Order[]): FeedbackStats {
  const per = new Map<string, { name: string; sum: number; count: number }>();
  const again = { yes: 0, maybe: 0, no: 0 }; const comments: FeedbackStats['comments'] = []; let responses = 0;
  for (const o of all) {
    const f = o.feedback; if (!f) continue;
    responses++;
    const titles = new Map(orderParts(o.items).map(p => [p.recipeId, p.recipeTitle]));
    for (const [id, n] of Object.entries(f.ratings)) { const t = titles.get(id) ?? id; const v = per.get(id) ?? { name: t, sum: 0, count: 0 }; v.sum += n; v.count++; per.set(id, v); }
    if (f.again) again[f.again]++;
    if (f.comment) { const vals = Object.values(f.ratings); comments.push({ name: o.customer.name, text: f.comment, at: f.at, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 }); }
  }
  return { responses, flavours: [...per.values()].map(v => ({ name: v.name, avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count })).sort((a, b) => b.avg - a.avg || b.count - a.count),
    again, comments: comments.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12) };
}
export function heardFromStats(all: Order[]): { source: string; orders: number }[] {
  const m = new Map<string, number>();
  for (const o of all) if (o.heardFrom && o.status !== 'cancelled') m.set(o.heardFrom, (m.get(o.heardFrom) ?? 0) + 1);
  return [...m.entries()].map(([source, orders]) => ({ source, orders })).sort((a, b) => b.orders - a.orders);
}
