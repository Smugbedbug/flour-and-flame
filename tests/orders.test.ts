import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { computeBakery, doughUsedBy, itemText } from '../src/bakery';
import { buildAppsScript } from '../src/appsScript';
import type { LedgerEvent, Product } from '../src/freezer';

let n = 0;
const ev = (e: any): LedgerEvent => ({ eventId: 'e' + ++n, at: `2026-11-${String(10 + (n % 15)).padStart(2, '0')}T10:00:00Z`, device: 'd', seq: n, ...e });
const cocoa6: Product = { productId: 'c6', name: 'Half dozen: Cocoa', recipeId: 'cocoa', recipeTitle: 'Cocoa', pieces: 6, price: 15, active: true };
const cocoa12: Product = { productId: 'c12', name: 'Dozen: Cocoa', recipeId: 'cocoa', recipeTitle: 'Cocoa', pieces: 12, price: 28, active: true };
const item = (p: Product, qty: number) => ({ productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty, unitPrice: p.price });
const freezerAdd = (count: number) => ev({ type: 'freezer.add', batchId: 'b' + n, recipeId: 'cocoa', recipeTitle: 'Cocoa', count, frozenOn: '2026-11-01' });
const create = (id: string, items: any[], status = 'pending') => ev({ type: 'order.create', orderId: id, source: 'manual', status, customer: { name: 'Mom' }, items, total: 0 });
const status = (id: string, s: string) => ev({ type: 'order.status', orderId: id, status: s });

describe('orders and the freezer', () => {
  beforeEach(() => { n = 0; });
  test('pending orders only show demand; confirming reserves; baking (ready) uses the dough; cancel releases', () => {
    const base = [ev({ type: 'product.upsert', product: cocoa6 }), ev({ type: 'product.upsert', product: cocoa12 }), freezerAdd(30), create('o1', [item(cocoa12, 1), item(cocoa6, 1)])];
    let b = computeBakery(base);
    expect(b.plan[0]).toMatchObject({ inFreezer: 30, reserved: 0, pending: 18, available: 30, makeMore: 0 });
    b = computeBakery([...base, status('o1', 'confirmed')]);
    expect(b.plan[0]).toMatchObject({ inFreezer: 30, reserved: 18, available: 12 });
    b = computeBakery([...base, status('o1', 'confirmed'), status('o1', 'ready')]);
    expect(b.freezer.total).toBe(12); expect(b.plan[0]).toMatchObject({ inFreezer: 12, reserved: 0, available: 12 });
    b = computeBakery([...base, status('o1', 'confirmed'), status('o1', 'cancelled')]);
    expect(b.freezer.total).toBe(30); expect(b.plan[0].reserved).toBe(0);
  });
  test('marking ready twice (e.g. on both devices) never deducts twice', () => {
    const b = computeBakery([freezerAdd(24), create('o1', [item(cocoa12, 1)], 'confirmed'), status('o1', 'ready'), status('o1', 'ready')]);
    expect(b.freezer.total).toBe(12);
  });
  test('cancelling after baking keeps the dough counted as used; undoing ready gives it back', () => {
    const base = [freezerAdd(24), create('o1', [item(cocoa12, 1)], 'confirmed'), status('o1', 'ready')];
    const cancelled = computeBakery([...base, status('o1', 'cancelled')]);
    expect(doughUsedBy(cancelled.orders[0])).toBe(true); expect(cancelled.freezer.total).toBe(12);
    expect(computeBakery([...base, status('o1', 'confirmed')]).freezer.total).toBe(24);
  });
  test('shortfall: tells me how many more to make', () => {
    const b = computeBakery([freezerAdd(10), create('o1', [item(cocoa12, 1)], 'confirmed'), create('o2', [item(cocoa6, 1)])]);
    expect(b.plan[0]).toMatchObject({ inFreezer: 10, reserved: 12, pending: 6, available: -2, makeMore: 8 });
  });
  test('latest product version wins (price changes, sold-out toggle)', () => {
    const b = computeBakery([ev({ type: 'product.upsert', product: cocoa6 }), ev({ type: 'product.upsert', product: { ...cocoa6, price: 16, active: false } })]);
    expect(b.products).toEqual([{ ...cocoa6, price: 16, active: false }]);
  });
  test('payment is separate from status: ready but unpaid', () => {
    const b = computeBakery([freezerAdd(12), create('o1', [item(cocoa12, 1)], 'confirmed'), status('o1', 'ready')]);
    expect(b.orders[0].status).toBe('ready'); expect(b.orders[0].paid).toBeFalsy();
    const p = computeBakery([freezerAdd(12), create('o1', [item(cocoa12, 1)], 'confirmed'), ev({ type: 'order.payment', orderId: 'o1', paid: true, method: 'cash' })]);
    expect(p.orders[0]).toMatchObject({ paid: true, paidMethod: 'cash', status: 'confirmed' });
  });
});

// ---- the real script: public menu + customer orders + email ----
function loadScript(key: string) {
  const rows: any[][] = []; let created = false; const mail: any[] = []; const cache: Record<string, string> = {}; const props: Record<string, string> = {};
  const sheet = { appendRow: (r: any[]) => rows.push(r), setFrozenRows: () => {}, getLastRow: () => rows.length,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({ getValues: () => rows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)), getValue: () => rows[r - 1][c - 1], setValues: (v: any[][]) => v.forEach((x, i) => { rows[r - 1 + i] = [...x]; }) }) };
  const g = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (created ? sheet : null), insertSheet: () => { created = true; return sheet; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ text: t }) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache[k] ?? null, put: (k: string, v: string) => { cache[k] = v; } }) },
    Utilities: { getUuid: () => crypto.randomUUID(), Charset: { UTF_8: 'utf8' }, computeHmacSha256Signature: (v: string, k: string) => [...createHmac('sha256', k).update(v, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)) },
    MailApp: { sendEmail: (...a: any[]) => mail.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@gmail.com' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { props[k] = v; } }) },
  };
  const code = buildAppsScript(key);
  const s = new Function(...Object.keys(g), code + '\nreturn { doGet, doPost };')(...Object.values(g));
  const get = (p: any) => JSON.parse(s.doGet({ parameter: p }).text), post = (b: any) => JSON.parse(s.doPost({ postData: { contents: JSON.stringify(b) } }).text);
  return { get, post, rows, mail, cache };
}

describe('customer order form via the real script', () => {
  test('menu shows only active products; orders are priced by the sheet, saved as Requested, and emailed to you', () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa6 },
      { type: 'product.upsert', eventId: 'p2', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'product.upsert', eventId: 'p3', at: 'x', device: 'pc', product: { ...cocoa12, productId: 'old', active: false } },
    ] });
    const menu = s.get({ action: 'menu' });
    expect(menu.menu.map((m: any) => m.productId)).toEqual(['c6', 'c12']); // smaller box first
    expect(menu.menu[0]).not.toHaveProperty('recipeId'); // customers see names/prices only
    const r = s.post({ action: 'order', name: 'Aunt Sue', contact: 'sue@example.com', items: [{ productId: 'c12', qty: 2 }, { productId: 'old', qty: 1 }, { productId: 'c6', qty: 1, unitPrice: 0.01 }], pickupDate: '2026-11-22', notes: 'Extra salty' });
    expect(r).toMatchObject({ ok: true, orderNo: 4, total: 71 }); // 2×28 + 15; inactive item dropped; client price ignored
    expect(s.mail[0][0]).toBe('owner@gmail.com'); expect(s.mail[0][1]).toBe('🍪 New order #4 · Aunt Sue · 2 Dozen Cocoa, 1 Half dozen Cocoa · $71.00'); expect(s.mail[0][2]).toContain('2 × Dozen: Cocoa');
    const pulled = s.get({ action: 'pull', key: 'K', since: 3 });
    const order = pulled.events[0];
    expect(order).toMatchObject({ type: 'order.create', status: 'pending', source: 'form', orderNo: 4, total: 71, customer: { name: 'Aunt Sue', contact: 'sue@example.com' } });
    // the app turns it into a Requested order with demand in planning
    const b = computeBakery(pulled.events.concat(s.get({ action: 'pull', key: 'K', since: 0 }).events));
    expect(b.newFormOrders).toHaveLength(1); expect(b.plan[0].pending).toBe(30);
  });
  test('rejects incomplete orders, absorbs spam, limits floods; reading data still needs the key', () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa6 }] });
    expect(s.post({ action: 'order', name: '', contact: 'x', items: [{ productId: 'c6', qty: 1 }] }).error).toBe('missing-contact');
    expect(s.post({ action: 'order', name: 'A', contact: '555-0100', items: [{ productId: 'c6', qty: 1 }] }).error).toBe('need-email');
    expect(s.post({ action: 'order', name: 'A', contact: 'a@b.co', items: [{ productId: 'nope', qty: 1 }] }).error).toBe('empty-order');
    const before = s.rows.length;
    expect(s.post({ action: 'order', name: 'Bot', contact: 'x', website: 'spam.example', items: [{ productId: 'c6', qty: 1 }] }).ok).toBe(true);
    expect(s.rows.length).toBe(before); // spam trap: nothing saved
    for (let i = 0; i < 10; i++) s.post({ action: 'order', name: 'A' + i, contact: 'a@b.co', items: [{ productId: 'c6', qty: 1 }] });
    expect(s.post({ action: 'order', name: 'Late', contact: 'a@b.co', items: [{ productId: 'c6', qty: 1 }] }).error).toBe('busy');
    expect(s.get({ action: 'pull', since: 0 }).error).toBe('bad-key');
    expect(s.get({ action: 'ping' })).toMatchObject({ version: 8, authorized: false });
  });
});

import { orderCoverage } from '../src/bakery';
describe('shortage warnings', () => {
  beforeEach(() => { n = 0; });
  test('a confirmed order with an empty freezer shows how many dough balls are missing', () => {
    const b = computeBakery([create('o1', [item(cocoa6, 2)], 'confirmed')]);
    expect(orderCoverage(b)).toEqual({ o1: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa', need: 12, short: 12 }] });
    expect(b.plan[0].makeMore).toBe(12);
  });
  test('stock goes to the earliest pickup first; requests come after confirmed orders', () => {
    const later = ev({ type: 'order.create', orderId: 'late', source: 'manual', status: 'confirmed', customer: { name: 'B' }, items: [item(cocoa12, 1)], total: 0, pickupDate: '2026-11-30' });
    const sooner = ev({ type: 'order.create', orderId: 'soon', source: 'manual', status: 'confirmed', customer: { name: 'A' }, items: [item(cocoa12, 1)], total: 0, pickupDate: '2026-11-20' });
    const req = ev({ type: 'order.create', orderId: 'req', source: 'form', status: 'pending', customer: { name: 'C' }, items: [item(cocoa6, 1)], total: 0, pickupDate: '2026-11-19' });
    const cov = orderCoverage(computeBakery([freezerAdd(18), later, sooner, req]));
    expect(cov.soon).toBeUndefined();                      // fully covered (12 of 18)
    expect(cov.late).toEqual([expect.objectContaining({ short: 6 })]); // only 6 left for it
    expect(cov.req).toEqual([expect.objectContaining({ short: 6 })]);  // requests wait behind confirmed orders
  });
});

describe('script v3: pickup options, shop note/closed, customer emails', () => {
  const setup = () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'pickup.upsert', eventId: 'u1', at: 'x', device: 'pc', pickup: { pickupId: 'work', name: 'Work', details: 'Fridays after 3', active: true } },
      { type: 'pickup.upsert', eventId: 'u2', at: 'x', device: 'pc', pickup: { pickupId: 'old', name: 'Old spot', active: false } },
      { type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: true, note: 'Orders close Wednesday', emailCustomers: true } },
    ] });
    return s;
  };
  test('menu includes active pickup options and the shop note', () => {
    const m = setup().get({ action: 'menu' });
    expect(m.pickups).toEqual([{ pickupId: 'work', name: 'Work', details: 'Fridays after 3' }]);
    expect(m.shop).toEqual({ open: true, note: 'Orders close Wednesday', holiday: false, limit: null });
  });
  test('a pickup choice is required when options exist; it is saved on the order; customer and owner get emails', () => {
    const s = setup();
    expect(s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', items: [{ productId: 'c12', qty: 1 }] }).error).toBe('choose-pickup');
    expect(s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', pickupId: 'old', items: [{ productId: 'c12', qty: 1 }] }).error).toBe('choose-pickup');
    const r = s.post({ action: 'order', name: 'Sue Smith', contact: 'sue@example.com', pickupId: 'work', items: [{ productId: 'c12', qty: 1 }] });
    expect(r.ok).toBe(true);
    const order = s.get({ action: 'pull', key: 'K', since: 4 }).events[0];
    expect(order).toMatchObject({ pickupId: 'work', pickupGroup: 'Work' });
    expect(s.mail.map((m: any) => m[0])).toEqual(['owner@gmail.com', 'sue@example.com']);
    expect(s.mail[1][1]).toContain('we received your order');
    expect(s.mail[1][2]).toContain('Pickup: Work (Fridays after 3)');
  });
  test('confirming and marking ready email the customer once each (never twice, even from two devices)', () => {
    const s = setup();
    s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', pickupId: 'work', items: [{ productId: 'c12', qty: 1 }] });
    const orderId = s.get({ action: 'pull', key: 'K', since: 4 }).events[0].orderId;
    s.mail.length = 0;
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'st1', at: 'x', device: 'pc', orderId, status: 'confirmed' }] });
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'st2', at: 'x', device: 'phone', orderId, status: 'confirmed' }] });
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'st3', at: 'x', device: 'pc', orderId, status: 'ready' }] });
    expect(s.mail.map((m: any) => m[1])).toEqual([expect.stringContaining('is confirmed'), expect.stringContaining('is ready')]);
  });
  test('the form requires an email address; turning customer emails off stops them; a closed shop refuses orders with its note', () => {
    const s = setup();
    expect(s.post({ action: 'order', name: 'Bob', contact: '555-0100', pickupId: 'work', items: [{ productId: 'c12', qty: 1 }] }).error).toBe('need-email');
    expect(s.mail).toEqual([]);
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: 's2', at: 'x', device: 'pc', settings: { open: true, emailCustomers: false } }] });
    s.mail.length = 0;
    s.post({ action: 'order', name: 'Amy', contact: 'amy@example.com', pickupId: 'work', items: [{ productId: 'c12', qty: 1 }] });
    expect(s.mail.map((m: any) => m[0])).toEqual(['owner@gmail.com']);
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: 's3', at: 'x', device: 'pc', settings: { open: false, note: 'Back next week!', emailCustomers: true } }] });
    expect(s.post({ action: 'order', name: 'Late', contact: 'late@example.com', pickupId: 'work', items: [{ productId: 'c12', qty: 1 }] })).toMatchObject({ ok: false, error: 'closed', note: 'Back next week!' });
  });
});

describe('v0.10 bakery state: pickups, packing, hand-off, shared bake history', () => {
  test('pickup options and shop settings: latest wins; defaults are open with customer emails on', () => {
    expect(computeBakery([]).shop).toEqual({ open: true, emailCustomers: true });
    const b = computeBakery([
      ev({ type: 'pickup.upsert', pickup: { pickupId: 'w', name: 'Work', active: true } }),
      ev({ type: 'pickup.upsert', pickup: { pickupId: 'w', name: 'Work (front desk)', handler: 'Mom', active: true } }),
      ev({ type: 'shop.settings', settings: { open: false, note: 'Back soon', emailCustomers: false } }),
    ]);
    expect(b.pickups).toEqual([{ pickupId: 'w', name: 'Work (front desk)', handler: 'Mom', active: true }]);
    expect(b.shop).toEqual({ open: false, note: 'Back soon', emailCustomers: false });
  });
  test('packed and handed-to are tracked per order and can be undone', () => {
    const base = [freezerAdd(24), create('o1', [item(cocoa12, 1)], 'confirmed')];
    let o = computeBakery([...base, ev({ type: 'order.packed', orderId: 'o1', packed: true }), ev({ type: 'order.handoff', orderId: 'o1', to: 'Mom' })]).orders[0];
    expect(o).toMatchObject({ packed: true, handedTo: 'Mom' });
    o = computeBakery([...base, ev({ type: 'order.packed', orderId: 'o1', packed: true }), ev({ type: 'order.packed', orderId: 'o1', packed: false }), ev({ type: 'order.handoff', orderId: 'o1', to: 'Mom' }), ev({ type: 'order.handoff', orderId: 'o1', to: null })]).orders[0];
    expect(o.packed).toBeFalsy(); expect(o.handedTo).toBeFalsy();
  });
  test('shared bake history: records from any device appear; a deletion hides them everywhere, even if re-sent later', async () => {
    const { mergeProduction } = await import('../src/sharedProduction');
    const rec = (id: string) => ({ id, recipeId: 'cocoa', recipeVersion: 1, recipeTitle: 'Cocoa', category: 'Cookies', date: '2026-11-0' + id.length, factor: 1, expectedQuantity: 24, actualQuantity: 26, unitLabel: 'dough balls', storage: 'frozen-dough', createdAt: 'x' }) as any;
    const b = computeBakery([ev({ type: 'production.record', record: rec('a') }), ev({ type: 'production.record', record: rec('bb') }), ev({ type: 'production.delete', recordId: 'bb' }), ev({ type: 'production.record', record: rec('bb') })]);
    expect(b.production.map(r => r.id)).toEqual(['a']);
    expect(b.productionDeleted).toEqual(['bb']);
    // local-only record from this device + shared ones, deduped; locally-kept copy of a deleted record is hidden
    expect(mergeProduction([rec('a'), rec('bb'), rec('ccc')], b.production, b.productionDeleted).map(r => r.id).sort()).toEqual(['a', 'ccc']);
  });
});

describe('v0.11: custom sizes, mixed boxes (script v4 + app)', () => {
  const brownie4 = { productId: 'b-4', name: 'Box of 4: Brownies', recipeId: 'b', recipeTitle: 'Brownies', pieces: 4, price: 10, active: true, kind: 'single', sizeLabel: 'Box of 4', dough: false };
  const mixDozen = { productId: 'mix-1', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed boxes', pieces: 12, price: 30, active: true, kind: 'mixed', step: 3,
    options: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa' }, { recipeId: 'van', recipeTitle: 'Vanilla' }, { recipeId: 'b', recipeTitle: 'Brownies', dough: false }] };
  const setup = () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'product.upsert', eventId: 'p2', at: 'x', device: 'pc', product: brownie4 },
      { type: 'product.upsert', eventId: 'p3', at: 'x', device: 'pc', product: mixDozen },
    ] });
    return s;
  };
  test('menu shows sizes and mixed-box choices (not dough settings or recipe ids)', () => {
    const m = setup().get({ action: 'menu' }).menu;
    expect(m.find((x: any) => x.productId === 'b-4')).toMatchObject({ sizeLabel: 'Box of 4', kind: 'single', pieces: 4 });
    const mix = m.find((x: any) => x.productId === 'mix-1');
    expect(mix).toMatchObject({ kind: 'mixed', step: 3, options: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa' }, { recipeId: 'van', recipeTitle: 'Vanilla' }, { recipeId: 'b', recipeTitle: 'Brownies' }] });
    expect(JSON.stringify(m)).not.toContain('dough');
  });
  test('mixed boxes must add up, use listed flavours and come in groups of the step', () => {
    const s = setup();
    const order = (mix: any) => s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', items: [{ productId: 'mix-1', qty: 1, mix }] });
    expect(order([{ recipeId: 'cocoa', count: 6 }]).error).toBe('bad-mix');                                   // only 6 of 12
    expect(order([{ recipeId: 'cocoa', count: 6 }, { recipeId: 'van', count: 7 }]).error).toBe('bad-mix');    // too many
    expect(order([{ recipeId: 'cocoa', count: 4 }, { recipeId: 'van', count: 8 }]).error).toBe('bad-mix');    // not groups of 3
    expect(order([{ recipeId: 'cocoa', count: 6 }, { recipeId: 'mint', count: 6 }]).error).toBe('bad-mix');   // not offered
    const ok = s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', items: [{ productId: 'mix-1', qty: 2, mix: [{ recipeId: 'cocoa', count: 6 }, { recipeId: 'van', count: 3 }, { recipeId: 'b', count: 3 }] }, { productId: 'b-4', qty: 1 }] });
    expect(ok).toMatchObject({ ok: true, total: 70 });
    expect(s.mail[0][2]).toContain('2 × Mixed dozen (6 Cocoa, 3 Vanilla, 3 Brownies)');
    // the app: dough balls only for cookie flavours; brownies don't touch the freezer
    const events = s.get({ action: 'pull', key: 'K', since: 0 }).events;
    const b = computeBakery([...events, ev({ type: 'freezer.add', batchId: 'F', recipeId: 'cocoa', recipeTitle: 'Cocoa', count: 24, frozenOn: '2026-11-18' })]);
    expect(Object.fromEntries(b.plan.map(r => [r.recipeId, r.pending]))).toEqual({ cocoa: 12, van: 6 });
  });
  test('older products without a dough setting count as cookies; a brownie product never reserves dough', () => {
    const items = [{ productId: 'c12', name: 'Dozen: Cocoa', recipeId: 'cocoa', recipeTitle: 'Cocoa', pieces: 12, qty: 1, unitPrice: 28 }, { productId: 'b-4', name: 'Box of 4: Brownies', recipeId: 'b', recipeTitle: 'Brownies', pieces: 4, qty: 2, unitPrice: 10 }];
    const b = computeBakery([ev({ type: 'product.upsert', product: cocoa12 }), ev({ type: 'product.upsert', product: brownie4 }), create('o1', items as any, 'confirmed'), freezerAdd(24)]);
    expect(b.plan.map(r => [r.recipeId, r.reserved])).toEqual([['cocoa', 12]]);
    expect(itemText({ ...items[0], qty: 2, mix: [{ recipeId: 'a', recipeTitle: 'A', count: 6 }, { recipeId: 'b', recipeTitle: 'B', count: 6 }] } as any)).toBe('2 × Dozen: Cocoa (6 A, 6 B)');
  });
});

describe('script v5: pictures on the order form', () => {
  test('menu items and mixed-box flavours carry their picture (illustration or uploaded); recipe ids stay hidden for single items', () => {
    const s = loadScript('K');
    const art = { shape: 'cookie', dough: '#5a3622', edge: '#3a2214', toppings: ['chips'] };
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'product.upsert', eventId: 'p2', at: 'x', device: 'pc', product: { productId: 'mix', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed boxes', pieces: 12, price: 30, active: true, kind: 'mixed', step: 6, options: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa' }, { recipeId: 'van', recipeTitle: 'Vanilla' }] } },
      { type: 'menu.look', eventId: 'l1', at: 'x', device: 'pc', look: { recipeId: 'cocoa', recipeTitle: 'Cocoa', art } },
      { type: 'menu.look', eventId: 'l2', at: 'x', device: 'pc', look: { recipeId: 'cocoa', recipeTitle: 'Cocoa', art, photo: 'data:image/jpeg;base64,AAAA', illustrationLabel: true } },
    ] });
    const m = s.get({ action: 'menu' }).menu;
    const single = m.find((x: any) => x.productId === 'c12');
    expect(single.look).toEqual({ art, photo: 'data:image/jpeg;base64,AAAA', illustration: true });
    expect(single).not.toHaveProperty('recipeId');
    const mix = m.find((x: any) => x.productId === 'mix');
    expect(mix.options[0].look.photo).toBe('data:image/jpeg;base64,AAAA');
    expect(mix.options[1]).not.toHaveProperty('look'); // the form draws one from the name
  });
});

describe('script v7: feedback, optional limit, heard-from, flavour descriptions', () => {
  const sig = (k: string, v: string) => createHmac('sha256', k).update(v, 'utf8').digest('hex').slice(0, 32);
  const setup = () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'menu.look', eventId: 'l1', at: 'x', device: 'pc', look: { recipeId: 'cocoa', recipeTitle: 'Cocoa', art: { shape: 'cookie' }, blurb: 'Rich, fudgy, flaky sea salt' } },
    ] });
    return s;
  };
  test('menu carries flavour descriptions; orders keep "how did you hear about us"', () => {
    const s = setup();
    expect(s.get({ action: 'menu' }).menu[0].look.blurb).toBe('Rich, fudgy, flaky sea salt');
    s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', heardFrom: 'Tried a tasting box', items: [{ productId: 'c12', qty: 1 }] });
    const o = s.get({ action: 'pull', key: 'K', since: 2 }).events[0];
    expect(o.heardFrom).toBe('Tried a tasting box');
    expect(s.mail[0][2]).toContain('Heard about us: Tried a tasting box');
  });
  test('pickup sends one "how were they?" email with the signed link; the feedback page only works with that link', () => {
    const s = setup();
    s.post({ action: 'order', name: 'Sue Smith', contact: 'sue@example.com', items: [{ productId: 'c12', qty: 1 }] });
    const id = s.get({ action: 'pull', key: 'K', since: 2 }).events[0].orderId;
    const link = `https://example.github.io/app/#/feedback/DEP/${id}/${sig('K', id)}`;
    s.mail.length = 0;
    for (const e of ['a', 'b']) s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'st' + e, at: 'x', device: 'pc', orderId: id, status: 'completed', feedbackLink: link }] });
    expect(s.mail.map((m: any) => m[1])).toEqual([expect.stringContaining('how were they?')]);
    expect(s.mail[0][2]).toContain(link);
    expect(s.get({ action: 'feedbackInfo', o: id, t: 'wrong' })).toMatchObject({ ok: false, error: 'bad-link' });
    expect(s.get({ action: 'feedbackInfo', o: id, t: sig('K', id) })).toMatchObject({ ok: true, name: 'Sue', done: false, flavours: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa', look: { blurb: 'Rich, fudgy, flaky sea salt' } }] });
    expect(s.post({ action: 'feedback', orderId: id, token: 'nope', ratings: { cocoa: 5 } }).error).toBe('bad-link');
    expect(s.post({ action: 'feedback', orderId: id, token: sig('K', id), ratings: { cocoa: 9, mint: 4 } }).error).toBe('empty'); // out of range / not in the order
    expect(s.post({ action: 'feedback', orderId: id, token: sig('K', id), ratings: { cocoa: 5 }, again: 'yes', comment: 'Amazing!' }).ok).toBe(true);
    const fb = s.get({ action: 'pull', key: 'K', since: 0 }).events.find((e: any) => e.type === 'feedback');
    expect(fb).toMatchObject({ orderId: id, ratings: { cocoa: 5 }, again: 'yes', comment: 'Amazing!', device: 'customer-feedback' });
    expect(s.get({ action: 'feedbackInfo', o: id, t: sig('K', id) }).done).toBe(true);
    expect(computeBakery(s.get({ action: 'pull', key: 'K', since: 0 }).events).orders[0].feedback).toMatchObject({ ratings: { cocoa: 5 }, again: 'yes' });
  });
  test('no feedback email when it is switched off', () => {
    const s = setup();
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, askFeedback: false } }] });
    s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', items: [{ productId: 'c12', qty: 1 }] });
    const id = s.get({ action: 'pull', key: 'K', since: 3 }).events[0].orderId;
    s.mail.length = 0;
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'st', at: 'x', device: 'pc', orderId: id, status: 'completed', feedbackLink: 'https://x/#/feedback/a/b/c' }] });
    expect(s.mail).toEqual([]);
  });
  test('optional limit per pickup day: a date is needed, and a full day says how many are left; menu shows what is booked', () => {
    const s = setup();
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, limit: { pieces: 30, per: 'day' } } }] });
    const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const order = (qty: number, pickupDate?: string) => s.post({ action: 'order', name: 'A', contact: 'a@b.co', pickupDate, items: [{ productId: 'c12', qty }] });
    expect(order(1).error).toBe('need-date');
    expect(order(2, day).ok).toBe(true);                    // 24 of 30
    expect(order(1, day)).toMatchObject({ ok: false, error: 'full', left: 6, per: 'day' });
    const m = s.get({ action: 'menu' });
    expect(m.shop.limit).toEqual({ pieces: 30, per: 'day' }); expect(m.booked[day]).toBe(24);
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: 's2', at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, limit: null } }] });
    expect(order(1, day).ok).toBe(true);                    // limit off → anything goes
  });
});

describe('v8: clearing test orders, email switches, testing mode', () => {
  test('deleted orders disappear everywhere and their dough goes back (or stays used if you say so)', () => {
    const base = [freezerAdd(24), create('t1', [item(cocoa12, 1)], 'confirmed'), status('t1', 'ready'), create('t2', [item(cocoa12, 1)], 'confirmed')];
    expect(computeBakery(base).freezer.total).toBe(12);
    const cleared = computeBakery([...base, ev({ type: 'order.delete', orderIds: ['t1', 't2'] })]);
    expect(cleared.orders).toEqual([]); expect(cleared.freezer.total).toBe(24); expect(cleared.plan[0].reserved).toBe(0);
    const kept = computeBakery([...base, ev({ type: 'order.delete', orderIds: ['t1', 't2'] }), ev({ type: 'freezer.remove', recipeId: 'cocoa', recipeTitle: 'Cocoa', count: 12, reason: 'baked' })]);
    expect(kept.freezer.total).toBe(12);
  });
  test('testing mode pauses every email; "email me" can be switched off on its own; deleted orders free up the limit', () => {
    const s = loadScript('K');
    const settings = (x: any, id: string) => s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: id, at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, ...x } }] });
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 }] });
    settings({ emailsPaused: true }, 's1');
    s.post({ action: 'order', name: 'Test', contact: 'me@example.com', items: [{ productId: 'c12', qty: 1 }] });
    const id = s.get({ action: 'pull', key: 'K', since: 2 }).events[0].orderId;
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'c', at: 'x', device: 'pc', orderId: id, status: 'confirmed' }] });
    expect(s.mail).toEqual([]);
    settings({ emailsPaused: false, emailOwner: false }, 's2');
    s.post({ action: 'order', name: 'Test2', contact: 'me@example.com', items: [{ productId: 'c12', qty: 1 }] });
    expect(s.mail.map((m: any) => m[0])).toEqual(['me@example.com']); // customer copy only, nothing to the owner
    // limit counts only orders that still exist
    const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    settings({ emailsPaused: true, limit: { pieces: 12, per: 'day' } }, 's3');
    expect(s.post({ action: 'order', name: 'A', contact: 'a@b.co', pickupDate: day, items: [{ productId: 'c12', qty: 1 }] }).ok).toBe(true);
    expect(s.post({ action: 'order', name: 'B', contact: 'a@b.co', pickupDate: day, items: [{ productId: 'c12', qty: 1 }] }).error).toBe('full');
    const ids = s.get({ action: 'pull', key: 'K', since: 0 }).events.filter((e: any) => e.type === 'order.create').map((e: any) => e.orderId);
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.delete', eventId: 'd1', at: 'x', device: 'pc', orderIds: ids }] });
    expect(s.post({ action: 'order', name: 'B', contact: 'a@b.co', pickupDate: day, items: [{ productId: 'c12', qty: 1 }] }).ok).toBe(true);
  });
});
