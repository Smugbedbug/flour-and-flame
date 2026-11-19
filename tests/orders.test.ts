import { describe, expect, test, vi, beforeEach } from 'vitest';
import { computeBakery, doughUsedBy } from '../src/bakery';
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
  const rows: any[][] = []; let created = false; const mail: any[] = []; const cache: Record<string, string> = {};
  const sheet = { appendRow: (r: any[]) => rows.push(r), setFrozenRows: () => {}, getLastRow: () => rows.length,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({ getValues: () => rows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)), getValue: () => rows[r - 1][c - 1], setValues: (v: any[][]) => v.forEach((x, i) => { rows[r - 1 + i] = [...x]; }) }) };
  const g = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (created ? sheet : null), insertSheet: () => { created = true; return sheet; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ text: t }) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache[k] ?? null, put: (k: string, v: string) => { cache[k] = v; } }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    MailApp: { sendEmail: (...a: any[]) => mail.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@gmail.com' }) },
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
    expect(menu.menu.map((m: any) => m.productId)).toEqual(['c12', 'c6']);
    expect(menu.menu[0]).not.toHaveProperty('recipeId'); // customers see names/prices only
    const r = s.post({ action: 'order', name: 'Aunt Sue', contact: '555-0100', items: [{ productId: 'c12', qty: 2 }, { productId: 'old', qty: 1 }, { productId: 'c6', qty: 1, unitPrice: 0.01 }], pickupDate: '2026-11-22', notes: 'Extra salty' });
    expect(r).toMatchObject({ ok: true, orderNo: 4, total: 71 }); // 2×28 + 15; inactive item dropped; client price ignored
    expect(s.mail[0][0]).toBe('owner@gmail.com'); expect(s.mail[0][1]).toContain('#4 from Aunt Sue'); expect(s.mail[0][2]).toContain('2 × Dozen: Cocoa');
    const pulled = s.get({ action: 'pull', key: 'K', since: 3 });
    const order = pulled.events[0];
    expect(order).toMatchObject({ type: 'order.create', status: 'pending', source: 'form', orderNo: 4, total: 71, customer: { name: 'Aunt Sue', contact: '555-0100' } });
    // the app turns it into a Requested order with demand in planning
    const b = computeBakery(pulled.events.concat(s.get({ action: 'pull', key: 'K', since: 0 }).events));
    expect(b.newFormOrders).toHaveLength(1); expect(b.plan[0].pending).toBe(30);
  });
  test('rejects incomplete orders, absorbs spam, limits floods; reading data still needs the key', () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa6 }] });
    expect(s.post({ action: 'order', name: '', contact: 'x', items: [{ productId: 'c6', qty: 1 }] }).error).toBe('missing-contact');
    expect(s.post({ action: 'order', name: 'A', contact: 'x', items: [{ productId: 'nope', qty: 1 }] }).error).toBe('empty-order');
    const before = s.rows.length;
    expect(s.post({ action: 'order', name: 'Bot', contact: 'x', website: 'spam.example', items: [{ productId: 'c6', qty: 1 }] }).ok).toBe(true);
    expect(s.rows.length).toBe(before); // spam trap: nothing saved
    for (let i = 0; i < 10; i++) s.post({ action: 'order', name: 'A' + i, contact: 'x', items: [{ productId: 'c6', qty: 1 }] });
    expect(s.post({ action: 'order', name: 'Late', contact: 'x', items: [{ productId: 'c6', qty: 1 }] }).error).toBe('busy');
    expect(s.get({ action: 'pull', since: 0 }).error).toBe('bad-key');
    expect(s.get({ action: 'ping' })).toMatchObject({ version: 2, authorized: false });
  });
});
