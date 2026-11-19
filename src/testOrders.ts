// Pretend orders for trying out the new-order alerts (banner, whoosh, phone/Windows notification, Gmail).
// They go through the shared sheet exactly like a customer's order, but are marked `test`,
// need no email address, send no customer emails, and stay out of sales, reports and customers.
import type { PickupOption, Product } from './freezer';
import { getSheetConfig } from './ledger';

const FIRST = ['Maya', 'Leo', 'Priya', 'Sam', 'Grace', 'Diego', 'Hannah', 'Omar', 'Ruby', 'Theo', 'Ava', 'Jonah', 'Lucy', 'Mateo', 'Nora', 'Eli', 'Zoe', 'Felix', 'Iris', 'Caleb', 'June', 'Marcus', 'Stella', 'Owen'];
const LAST = 'ABCDEFGHJKLMNPRSTVW';
const NOTES = ['Can you add a little note saying Happy Birthday?', 'Running late, might pick up after 5', 'No rush!', 'For my coworkers 🎉', 'Extra crispy if possible', 'Allergic to nuts, just checking these are ok'];

type Rnd = () => number;
const pick = <T,>(a: readonly T[], r: Rnd): T => a[Math.floor(r() * a.length)];

export type TestOrderBody = {
  action: 'testOrder'; name: string; items: { productId: string; qty: number; mix?: { recipeId: string; count: number }[] }[];
  pickupId?: string; pickupDate: string; notes?: string; gift?: { to: string; message?: string }; emailMe: boolean;
};

/** A believable random order from what's on the menu right now. Null if nothing is on the menu. */
export function randomTestOrder(products: Product[], pickups: PickupOption[], emailMe: boolean, r: Rnd = Math.random, today = new Date()): TestOrderBody | null {
  const plain = products.filter(p => p.active && p.kind !== 'mixed');
  const mixed = products.filter(p => p.active && p.kind === 'mixed' && (p.options?.length ?? 0) > 0 && p.pieces % (p.step || 1) === 0);
  if (!plain.length && !mixed.length) return null;
  const items: TestOrderBody['items'] = [];
  const qty = () => (r() < 0.75 ? 1 : 2);
  const usePlain = plain.length > 0 && (!mixed.length || r() < 0.7);
  if (usePlain) {
    const n = Math.min(plain.length, r() < 0.65 ? 1 : 2);
    const pool = [...plain];
    for (let i = 0; i < n; i++) items.push({ productId: pool.splice(Math.floor(r() * pool.length), 1)[0].productId, qty: qty() });
  }
  if (mixed.length && (!usePlain || r() < 0.3)) {
    const p = pick(mixed, r), step = p.step || 1, opts = p.options!;
    const counts: Record<string, number> = {};
    for (let slot = 0; slot < p.pieces / step; slot++) { const o = pick(opts, r); counts[o.recipeId] = (counts[o.recipeId] ?? 0) + step; }
    items.push({ productId: p.productId, qty: 1, mix: Object.entries(counts).map(([recipeId, count]) => ({ recipeId, count })) });
  }
  const active = pickups.filter(p => p.active);
  const d = new Date(today); d.setDate(d.getDate() + 1 + Math.floor(r() * 10));
  const pickupDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const body: TestOrderBody = { action: 'testOrder', name: `${pick(FIRST, r)} ${pick(LAST.split(''), r)}.`, items, pickupDate, emailMe };
  if (active.length) body.pickupId = pick(active, r).pickupId;
  if (r() < 0.3) body.notes = pick(NOTES, r);
  if (r() < 0.1) body.gift = { to: pick(FIRST, r), message: 'Enjoy! 🍪' };
  return body;
}

export type TestSendResult = { sent: number[]; failed: number; reason?: string };

/** Send `count` random test orders to the shared sheet at the same moment (the stress test). */
export async function sendTestOrders(count: number, products: Product[], pickups: PickupOption[], emailMe: boolean): Promise<TestSendResult> {
  const { url, key } = getSheetConfig();
  if (!url || !key) return { sent: [], failed: count, reason: 'not-connected' };
  const bodies = Array.from({ length: count }, () => randomTestOrder(products, pickups, emailMe));
  if (bodies.some(b => !b)) return { sent: [], failed: count, reason: 'empty-menu' };
  const results = await Promise.all(bodies.map(async b => {
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...b, key }) });
      return await res.json() as { ok: boolean; orderNo?: number; error?: string };
    } catch { return { ok: false, error: 'network' }; }
  }));
  const sent = results.filter(x => x.ok).map(x => x.orderNo ?? 0).sort((a, b) => a - b);
  const bad = results.find(x => !x.ok);
  return { sent, failed: count - sent.length, reason: bad?.error };
}
