import { describe, expect, test } from 'vitest';
import { computeBakery } from '../src/bakery';
import { customerList, salesCsv, salesReport } from '../src/reports';

let n = 0;
const ev = (e: any, at = '2026-11-10T15:00:00Z') => ({ eventId: 'e' + ++n, at, device: 'd', seq: n, ...e });
const dozen = (qty: number, recipe = 'cocoa', title = 'Cocoa', price = 28) => ({ productId: `${recipe}-12`, name: `Dozen: ${title}`, recipeId: recipe, recipeTitle: title, pieces: 12, qty, unitPrice: price });
const mixed = { productId: 'mix', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed dozen', pieces: 12, qty: 1, unitPrice: 30, mix: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa', count: 6 }, { recipeId: 'van', recipeTitle: 'Vanilla', count: 6 }] };
function sale(id: string, name: string, contact: string | undefined, items: any[], total: number, pickedAt: string, extra: () => any[] = () => []) {
  return [ev({ type: 'order.create', orderId: id, source: 'form', status: 'confirmed', customer: { name, ...(contact ? { contact } : {}) }, items, total }, '2026-11-01T12:00:00Z'), ...extra(),
    ev({ type: 'order.status', orderId: id, status: 'ready' }, pickedAt), ev({ type: 'order.status', orderId: id, status: 'completed' }, pickedAt)];
}

describe('sales reports', () => {
  const events = [
    ...sale('a', 'Sue Smith', 'Sue@Example.com', [dozen(2)], 56, '2026-11-03T18:00:00Z', () => [ev({ type: 'order.payment', orderId: 'a', paid: true, method: 'Venmo' })]),
    ...sale('b', 'Sue', 'sue@example.com', [mixed], 25, '2026-11-12T18:00:00Z'),
    ...sale('c', 'Grandpa', undefined, [dozen(1, 'van', 'Vanilla', 26)], 26, '2026-10-20T18:00:00Z', () => [ev({ type: 'order.payment', orderId: 'c', paid: true, method: 'cash' })]),
    ev({ type: 'order.create', orderId: 'd', source: 'manual', status: 'confirmed', customer: { name: 'Amy' }, items: [dozen(1)], total: 28 }),
  ];
  // a cost snapshot on order a only
  events.splice(3, 0, ev({ type: 'order.update', orderId: 'a', patch: { discount: 0 } }));
  const b = computeBakery(events);
  b.orders.find(o => o.orderId === 'a')!.costSnapshot = { total: 18.4, complete: true };
  b.orders.find(o => o.orderId === 'b')!.discount = 5;

  test('counts picked-up orders in the period; profit only from fully costed orders; never invents a cost', () => {
    const r = salesReport(b.orders, { from: '2026-11-01', to: '2026-11-30', label: 'Nov' });
    expect(r.orders.map(o => o.orderId)).toEqual(['a', 'b']);
    expect(r).toMatchObject({ revenue: 81, boxes: 3, pieces: 36, discounts: 5, uncosted: 1 });
    expect(r.costed).toEqual({ orders: 1, revenue: 56, cost: 18.4, profit: 37.6 });
    expect(r.unpaid.total).toBe(25);
    expect(r.byFlavor).toEqual([{ name: 'Cocoa', pieces: 30 }, { name: 'Vanilla', pieces: 6 }]);
    expect(r.byProduct.map(p => [p.name, p.boxes, p.revenue])).toEqual([['Dozen: Cocoa', 2, 56], ['Mixed dozen', 1, 30]]);
    expect(r.payments).toEqual([{ method: 'Venmo', total: 56, orders: 1 }]);
    expect(r.topCustomers[0]).toMatchObject({ total: 81, orders: 2 }); // same email, different spelling → one customer
    expect(r.bucketUnit).toBe('week');
    expect(r.buckets.reduce((s, x) => s + x.revenue, 0)).toBe(81);
    const none = salesReport(b.orders, { from: '2026-12-01', to: '2026-12-31', label: 'Dec' });
    expect(none.costed).toBeNull(); expect(none.revenue).toBe(0);
    const all = salesReport(b.orders, { from: '0000-01-01', to: '9999-12-31', label: 'All' });
    expect(all.orders).toHaveLength(3);
  });
  test('customer list merges by email, counts open orders, finds favourites; CSV is quoted safely', () => {
    const c = customerList(b.orders);
    const sue = c.find(x => x.email?.toLowerCase() === 'sue@example.com')!;
    expect(sue).toMatchObject({ placed: 2, spent: 81, open: 0, favorite: 'Cocoa' });
    expect(c.find(x => x.name === 'Amy')).toMatchObject({ open: 1, spent: 0 });
    expect(c).toHaveLength(3 + 0 + 1 - 1 + 0); // Sue, Grandpa, Amy
    const csv = salesCsv([{ ...b.orders.find(o => o.orderId === 'b')!, customer: { name: 'Sue, "Jr"', contact: 'sue@example.com' } }]);
    expect(csv.split('\r\n')[1]).toContain('"Sue, ""Jr"""');
    expect(csv).toContain('1 × Mixed dozen (6 Cocoa, 6 Vanilla)');
  });
});

describe('sample sales (in memory only)', () => {
  test('three months of believable orders from the real menu; same every time; reports and customers work on them', async () => {
    const { demoOrders } = await import('../src/demoData');
    const products = [
      { productId: 'c-12', name: 'Dozen: Cocoa', recipeId: 'c', recipeTitle: 'Cocoa', pieces: 12, price: 28, active: true },
      { productId: 'b-4', name: 'Box of 4: Brownies', recipeId: 'b', recipeTitle: 'Brownies', pieces: 4, price: 10, active: true, kind: 'single', dough: false },
      { productId: 'mix', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed boxes', pieces: 12, price: 30, active: true, kind: 'mixed', step: 3, options: [{ recipeId: 'c', recipeTitle: 'Cocoa' }, { recipeId: 'v', recipeTitle: 'Vanilla' }] },
    ] as any;
    const today = new Date('2026-11-19T12:00:00');
    const a = demoOrders(products, [], [], ['Work'], today), b = demoOrders(products, [], [], ['Work'], today);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(40);
    expect(a.every(o => o.customer.contact!.endsWith('@example.com'))).toBe(true);
    expect(a.flatMap(o => o.items).filter(i => i.mix).every(i => i.mix!.reduce((s, m) => s + m.count, 0) === 12)).toBe(true);
    const r = salesReport(a, { from: '2026-08-20', to: '2026-11-19', label: '3 months' });
    expect(r.revenue).toBeGreaterThan(500);
    expect(r.costed).toBeNull(); // no recipes/prices given → no invented profit
    expect(customerList(a).length).toBeLessThanOrEqual(16);
  });
});

describe('tasting boxes, feedback, how people found you', () => {
  test('tasting boxes stay out of sales; people who came back are counted; feedback averages per flavour', async () => {
    const { tastingStats, feedbackStats, heardFromStats } = await import('../src/reports');
    let k = 0;
    const o = (id: string, email: string, extra: any, at: string) => ({ orderId: id, customer: { name: email.split('@')[0], contact: email }, items: [dozen(1)], total: 28, status: 'completed', createdAt: at, updatedAt: at, completedAt: at, source: 'form', ...extra, _k: k++ }) as any;
    const orders = [
      o('s1', 'amy@x.com', { sample: true, total: 0, discount: 28, costSnapshot: { total: 9, complete: true }, feedback: { ratings: { cocoa: 5 }, again: 'yes', comment: 'Yum', at: '2026-11-03T00:00:00Z' } }, '2026-11-02T10:00:00Z'),
      o('s2', 'bob@x.com', { sample: true, total: 0, discount: 28, feedback: { ratings: { cocoa: 3 }, again: 'maybe', at: '2026-11-04T00:00:00Z' } }, '2026-11-03T10:00:00Z'),
      o('a1', 'amy@x.com', { heardFrom: 'Tried a tasting box' }, '2026-11-10T10:00:00Z'),
      o('c1', 'cat@x.com', { heardFrom: 'Facebook' }, '2026-11-11T10:00:00Z'),
    ];
    expect(salesReport(orders, { from: '0000-01-01', to: '9999-12-31', label: 'all' })).toMatchObject({ revenue: 56, boxes: 2 }); // samples excluded
    expect(tastingStats(orders)).toEqual({ given: 2, people: 2, cameBack: 1, boughtTotal: 28, cost: 9, uncosted: 1 });
    const f = feedbackStats(orders);
    expect(f.responses).toBe(2); expect(f.flavours).toEqual([{ name: 'Cocoa', avg: 4, count: 2 }]);
    expect(f.again).toEqual({ yes: 1, maybe: 1, no: 0 }); expect(f.comments[0]).toMatchObject({ text: 'Yum', name: 'amy' });
    expect(heardFromStats(orders)).toEqual([{ source: 'Tried a tasting box', orders: 1 }, { source: 'Facebook', orders: 1 }]);
    const amy = customerList(orders).find(c => c.email === 'amy@x.com')!;
    expect(amy).toMatchObject({ tasted: true, cameBack: true, spent: 28, rating: 5 });
    expect(customerList(orders).find(c => c.email === 'bob@x.com')).toMatchObject({ tasted: true, cameBack: false });
  });
  test('the feedback link is signed the same way the sheet checks it', async () => {
    const { _hmacHexForTests } = await import('../src/feedback');
    const { createHmac } = await import('node:crypto');
    expect(await _hmacHexForTests('K', 'order-1')).toBe(createHmac('sha256', 'K').update('order-1').digest('hex').slice(0, 32));
  });
});
