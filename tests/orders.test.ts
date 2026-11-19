import { afterEach, describe, expect, test, vi, beforeEach } from 'vitest';
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
/** Enough of Apps Script's Utilities.formatDate for the script's patterns. */
function fmtDate(d: Date, tz: string, f: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
  if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1);
  if (f === 'H') return String(Number(parts.hour));
  if (f === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (f === 'EEE MMM d') return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d).replace(',', '');
  throw Error('format not mocked: ' + f);
}
function loadScript(key: string) {
  const rows: any[][] = []; let created = false; const mail: any[] = []; const cache: Record<string, string> = {}; const props: Record<string, string> = {}; const pushes: any[] = []; const fetchMode = { fail: '' as string };
  const sheet = { appendRow: (r: any[]) => rows.push(r), setFrozenRows: () => {}, getLastRow: () => rows.length,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({ getValues: () => rows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)), getValue: () => rows[r - 1][c - 1], setValues: (v: any[][]) => v.forEach((x, i) => { rows[r - 1 + i] = [...x]; }) }) };
  const g = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (created ? sheet : null), insertSheet: () => { created = true; return sheet; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ text: t }) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache[k] ?? null, put: (k: string, v: string) => { cache[k] = v; } }) },
    Utilities: { formatDate: fmtDate, getUuid: () => crypto.randomUUID(), Charset: { UTF_8: 'utf8' }, base64EncodeWebSafe: (v: string) => Buffer.from(v, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'), computeHmacSha256Signature: (v: string, k: string) => [...createHmac('sha256', k).update(v, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)) },
    MailApp: { sendEmail: (...a: any[]) => mail.push(a) },
    UrlFetchApp: { fetch: (url: string, o: any) => { if (fetchMode.fail) throw Error(fetchMode.fail); pushes.push({ url, ...o, body: JSON.parse(o.payload) }); return { getResponseCode: () => 200 }; } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@gmail.com' }), getScriptTimeZone: () => 'America/Chicago' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { props[k] = v; } }) },
  };
  const code = buildAppsScript(key);
  const s = new Function(...Object.keys(g), code + '\nreturn { doGet, doPost };')(...Object.values(g));
  const get = (p: any) => JSON.parse(s.doGet({ parameter: p }).text), post = (b: any) => JSON.parse(s.doPost({ postData: { contents: JSON.stringify(b) } }).text);
  return { get, post, rows, mail, cache, pushes, fetchMode };
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
    expect(s.get({ action: 'ping' })).toMatchObject({ version: 14, authorized: false });
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
    expect(m.shop).toEqual({ open: true, note: 'Orders close Wednesday', holiday: false, limit: null, payment: { cash: true }, town: '', payFirst: false, loyalty: { every: 5 }, featured: [] });
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

describe('script v9: payment links, gifts, order again, announcements', () => {
  const sig = (k: string, v: string) => createHmac('sha256', k).update(v, 'utf8').digest('hex').slice(0, 32);
  const setup = (shop: any = {}) => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, ...shop } },
    ] });
    return s;
  };
  const statusEv = (id: string, orderId: string, status: string, extra: any = {}) => ({ type: 'order.status', eventId: id, at: 'x', device: 'pc', orderId, status, ...extra });
  test('confirmed email shows how to pay with ready-made links; nothing set → pay at pickup; paid orders get no payment block', () => {
    const s = setup({ payment: { cash: true, venmo: '@FlourFlame', cashapp: 'FlourFlame' } });
    expect(s.get({ action: 'menu' }).shop.payment).toEqual({ cash: true, venmo: '@FlourFlame', cashapp: 'FlourFlame' });
    s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', items: [{ productId: 'c12', qty: 1 }] });
    const id = s.get({ action: 'pull', key: 'K', since: 2 }).events[0].orderId;
    s.mail.length = 0;
    s.post({ key: 'K', action: 'push', since: 0, events: [statusEv('c1', id, 'confirmed')] });
    const body = s.mail[0][2];
    expect(body).toContain('How to pay ($28.00)');
    expect(body).toContain('https://venmo.com/FlourFlame?txn=pay&amount=28.00&note=Flour%20and%20Flame%20Bakery%20order%20%23');
    expect(body).toContain('https://cash.app/$FlourFlame/28.00');
    expect(body).toContain('• Cash at pickup');
    const s2 = setup();
    s2.post({ action: 'order', name: 'Bo', contact: 'bo@example.com', items: [{ productId: 'c12', qty: 1 }] });
    const id2 = s2.get({ action: 'pull', key: 'K', since: 2 }).events[0].orderId;
    s2.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.payment', eventId: 'pay', at: 'x', device: 'pc', orderId: id2, paid: true }, statusEv('c2', id2, 'confirmed')] });
    expect(s2.mail.at(-1)[2]).not.toContain('How to pay');
  });
  test('gift details reach you; "ready" email has the order-again button', () => {
    const s = setup();
    s.post({ action: 'order', name: 'Sue', contact: 'sue@example.com', gift: { to: 'Grandma Jo', message: 'Happy birthday!' }, news: true, items: [{ productId: 'c12', qty: 1 }] });
    const o = s.get({ action: 'pull', key: 'K', since: 2 }).events[0];
    expect(o).toMatchObject({ gift: { to: 'Grandma Jo', message: 'Happy birthday!' }, news: true });
    expect(s.mail[0][2]).toContain('🎁 Gift for Grandma Jo: “Happy birthday!”');
    s.post({ key: 'K', action: 'push', since: 0, events: [statusEv('r1', o.orderId, 'ready', { orderAgainLink: 'https://x.github.io/app/#/order-form/DEP/again/abc' })] });
    expect(s.mail.at(-1)[2]).toContain('Order the same again in one tap:\nhttps://x.github.io/app/#/order-form/DEP/again/abc');
  });
  test('announcements go only to people who opted in, once, each with their own unsubscribe link; unsubscribing works and is remembered', () => {
    const s = setup();
    s.post({ action: 'order', name: 'Sue Smith', contact: 'sue@example.com', news: true, items: [{ productId: 'c12', qty: 1 }] });
    s.post({ action: 'order', name: 'Bob', contact: 'bob@example.com', items: [{ productId: 'c12', qty: 1 }] });
    s.mail.length = 0;
    const send = { type: 'news.send', eventId: 'n1', at: 'x', device: 'pc', subject: 'New flavour!', body: 'Pumpkin spice is here.', link: 'https://x/#/order-form/DEP', unsubBase: 'https://x/#/unsubscribe/DEP/' };
    s.post({ key: 'K', action: 'push', since: 0, events: [send] });
    s.post({ key: 'K', action: 'push', since: 0, events: [send] }); // re-sent → ignored
    expect(s.mail.map((m: any) => m[0])).toEqual(['sue@example.com']);
    const b64 = Buffer.from('sue@example.com').toString('base64').replace(/=+$/, '');
    expect(s.mail[0][2]).toContain(`https://x/#/unsubscribe/DEP/${b64}/${sig('K', 'unsub:sue@example.com')}`);
    expect(s.mail[0][2]).toContain('Order here: https://x/#/order-form/DEP');
    const sent = s.get({ action: 'pull', key: 'K', since: 0 }).events.find((e: any) => e.type === 'news.sent');
    expect(sent).toMatchObject({ sendId: 'n1', count: 1, skipped: 0 });
    expect(s.post({ action: 'unsubscribe', email: 'sue@example.com', token: 'nope' }).error).toBe('bad-link');
    expect(s.post({ action: 'unsubscribe', email: 'sue@example.com', token: sig('K', 'unsub:sue@example.com') }).ok).toBe(true);
    s.mail.length = 0;
    s.post({ key: 'K', action: 'push', since: 0, events: [{ ...send, eventId: 'n2' }] });
    expect(s.mail).toEqual([]);
    const b = computeBakery(s.get({ action: 'pull', key: 'K', since: 0 }).events);
    expect(b.news.unsubscribed).toEqual(['sue@example.com']); expect(b.news.sends.map(x => x.count)).toEqual([0, 1]);
  });
});

describe('script v10: reviews from the card QR code', () => {
  test('the menu lists flavours to rate; reviews only accept flavours on the menu; spam is absorbed; reviews count in "What people think"', async () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'product.upsert', eventId: 'p2', at: 'x', device: 'pc', product: { productId: 'mix', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed boxes', pieces: 12, price: 30, active: true, kind: 'mixed', step: 6, options: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa' }, { recipeId: 'van', recipeTitle: 'Vanilla' }] } },
    ] });
    expect(s.get({ action: 'menu' }).flavours.map((f: any) => f.recipeId)).toEqual(['cocoa', 'van']);
    expect(s.post({ action: 'review', ratings: { mint: 5 } }).error).toBe('empty');
    expect(s.post({ action: 'review', website: 'spam', ratings: { cocoa: 5 } }).ok).toBe(true); // absorbed, not stored
    expect(s.post({ action: 'review', name: 'Dana', ratings: { cocoa: 5, van: 4, mint: 3 }, again: 'yes', comment: 'Yum!' }).ok).toBe(true);
    const evs = s.get({ action: 'pull', key: 'K', since: 0 }).events;
    const reviews = evs.filter((e: any) => e.type === 'review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ name: 'Dana', ratings: { cocoa: 5, van: 4 }, titles: { cocoa: 'Cocoa', van: 'Vanilla' }, again: 'yes', comment: 'Yum!', device: 'customer-review' });
    const b = computeBakery(evs);
    const { feedbackStats } = await import('../src/reports');
    const f = feedbackStats(b.orders, b.reviews);
    expect(f.responses).toBe(1); expect(f.flavours.map(x => [x.name, x.avg])).toEqual([['Cocoa', 5], ['Vanilla', 4]]);
    expect(f.comments[0]).toMatchObject({ name: 'Dana (card)', text: 'Yum!' });
  });
});

describe('script v11 + app: test orders for trying the alerts', () => {
  test('owner-only, no email needed, works while closed, marked test, never emails a customer, Gmail email only when asked', async () => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: false, emailCustomers: true, limit: { pieces: 12, per: 'day' } } },
    ] });
    const { randomTestOrder } = await import('../src/testOrders');
    const b = computeBakery(s.get({ action: 'pull', key: 'K', since: 0 }).events);
    const body = randomTestOrder(b.products, b.pickups, false)!;
    expect(body.items.length).toBeGreaterThan(0);
    expect(s.post({ ...body }).error).toBe('bad-key');                        // strangers can't send test orders
    expect(s.post({ ...body, action: 'order' }).ok).toBe(false);              // and the public form still needs an email
    const before = s.mail.length;
    const r1 = s.post({ ...body, key: 'K', items: [{ productId: cocoa12.productId, qty: 2 }], pickupDate: '2030-01-02' }); // 24 pieces > limit of 12: tests ignore the limit
    expect(r1.ok).toBe(true);
    expect(s.mail.length).toBe(before);                                       // emailMe off: no email at all
    const r2 = s.post({ ...body, key: 'K', emailMe: true });
    expect(r2.ok).toBe(true);
    expect(s.mail.length).toBe(before + 1);
    expect(s.mail[s.mail.length - 1][0]).toBe('owner@gmail.com');
    expect(s.mail[s.mail.length - 1][1]).toMatch(/^🧪 TEST · 🍪 New order #/);
    const after = computeBakery(s.get({ action: 'pull', key: 'K', since: 0 }).events);
    const tests = after.orders.filter(o => o.test);
    expect(tests).toHaveLength(2);
    expect(tests[0]).toMatchObject({ source: 'form', status: 'pending', test: true });
    expect(tests[0].customer.contact).toBeFalsy();
    expect(after.newFormOrders).toHaveLength(2);                              // so the banner and notification fire
    // a real customer is not blocked by the test orders' pieces
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'shop.settings', eventId: 's2', at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, limit: { pieces: 12, per: 'day' } } }] });
    expect(s.post({ action: 'order', name: 'Real', contact: 'r@x.com', pickupDate: '2030-01-02', items: [{ productId: cocoa12.productId, qty: 1 }] }).ok).toBe(true);
  });

  test('random orders are always valid: real menu items, mixed boxes add up, pickup and date chosen', async () => {
    const { randomTestOrder } = await import('../src/testOrders');
    const products: any[] = [cocoa12, { productId: 'mix', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed', pieces: 12, price: 30, active: true, kind: 'mixed', step: 6, options: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa' }, { recipeId: 'van', recipeTitle: 'Vanilla' }] }, { ...cocoa12, productId: 'off', active: false }];
    const pickups = [{ pickupId: 'pu1', name: 'Porch', active: true }, { pickupId: 'pu2', name: 'Old', active: false }];
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const o = randomTestOrder(products, pickups, true, r, new Date(2026, 10, 19))!;
      expect(o.pickupId).toBe('pu1');
      expect(o.pickupDate > '2026-11-19' && o.pickupDate <= '2026-11-30').toBe(true);
      expect(o.name).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
      for (const it of o.items) {
        expect([cocoa12.productId, 'mix']).toContain(it.productId);
        if (it.mix) { expect(it.mix.reduce((t, m) => t + m.count, 0)).toBe(12); expect(it.mix.every(m => m.count % 6 === 0)).toBe(true); }
      }
    }
    expect(randomTestOrder([], pickups, true)).toBeNull();
  });
});

describe('script v12: loyalty (free half dozen) and the private pickup address', () => {
  const half = { productId: 'van-6', name: 'Half dozen: Vanilla', recipeId: 'van', recipeTitle: 'Vanilla', pieces: 6, price: 15, active: true };
  let n = 0;
  const ev = (e: any) => ({ eventId: 'e' + (++n), at: '2026-11-19T10:00:' + String(n % 60).padStart(2, '0') + 'Z', device: 'pc', ...e });
  const setup = (settings: any = {}) => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [ev({ type: 'product.upsert', product: cocoa12 }), ev({ type: 'product.upsert', product: half }), ev({ type: 'shop.settings', settings: { open: true, emailCustomers: true, ...settings } })] });
    return s;
  };
  const orderIds = (s: any) => s.get({ action: 'pull', key: 'K', since: 0 }).events.filter((e: any) => e.type === 'order.create').map((e: any) => e.orderId);
  const place = (s: any, extra: any = {}) => s.post({ action: 'order', name: 'Dana Lee', contact: 'Dana@x.com', items: [{ productId: cocoa12.productId, qty: 1 }], ...extra });
  const pickUp = (s: any, id: string) => s.post({ key: 'K', action: 'push', since: 0, events: [ev({ type: 'order.status', orderId: id, status: 'completed' })] });

  test('every 5th pickup emails a free half dozen once; it can be claimed on the form; then it starts again; tests and tasting boxes never count', () => {
    const s = setup();
    expect(s.get({ action: 'menu' }).shop.loyalty).toEqual({ every: 5 });
    expect(place(s).ok).toBe(true);
    expect(s.mail.at(-1)[2]).toMatch(/Loyalty: 0 of 5 orders toward a free half dozen/);
    for (let i = 0; i < 4; i++) place(s, { contact: 'dana@x.com' }); // same email, different case: still one customer
    s.post({ key: 'K', action: 'testOrder', name: 'T', items: [{ productId: cocoa12.productId, qty: 1 }] });
    const ids = orderIds(s);
    const loyalMails = () => s.mail.filter((m: any) => /on us/.test(m[1]));
    for (const id of ids.slice(0, 4)) pickUp(s, id);
    pickUp(s, ids[5]); // the test order: doesn't count
    expect(loyalMails()).toHaveLength(0);
    // the "ready" email for the 5th predicts the reward
    s.post({ key: 'K', action: 'push', since: 0, events: [ev({ type: 'order.status', orderId: ids[4], status: 'ready' })] });
    expect(s.mail.at(-1)[2]).toMatch(/Picking this up earns you a FREE half dozen/);
    pickUp(s, ids[4]);
    expect(loyalMails()).toHaveLength(1);
    expect(loyalMails()[0][0].toLowerCase()).toBe('dana@x.com');
    expect(loyalMails()[0][2]).toMatch(/order number 5/);
    pickUp(s, ids[4]); // pushing again never sends twice
    expect(loyalMails()).toHaveLength(1);
    const evs = s.get({ action: 'pull', key: 'K', since: 0 }).events;
    expect(evs.filter((e: any) => e.type === 'loyalty.earned')).toHaveLength(1);
    // claim without a half dozen in the order: saved for later
    expect(place(s, { useReward: true }).rewardAsk).toBe('need-half');
    // claim with a half dozen: it comes off
    const r = place(s, { useReward: true, items: [{ productId: cocoa12.productId, qty: 1 }, { productId: 'van-6', qty: 2 }] });
    expect(r.reward).toBe(15);
    expect(r.total).toBe(cocoa12.price + 15);
    expect(s.mail.filter((m: any) => /we received/.test(m[1])).at(-1)[2]).toMatch(/Free half dozen \(loyalty reward\): −\$15\.00/);
    // only one was earned, so a second claim finds none
    expect(place(s, { useReward: true, items: [{ productId: 'van-6', qty: 1 }] }).rewardAsk).toBe('none');
    // the app agrees
    const b = computeBakery(s.get({ action: 'pull', key: 'K', since: 0 }).events);
    expect(b.loyaltyMailed).toHaveLength(1);
  });

  test('app: progress, who has one to use, and which open order will earn the next one', async () => {
    const { loyaltyRows, rewardValue, progressText } = await import('../src/loyalty');
    const mk = (i: number, status: string, extra: any = {}) => ({ orderId: 'o' + i, createdAt: `2026-11-${String(i).padStart(2, '0')}T10:00:00Z`, updatedAt: 'x', source: 'form', status, customer: { name: 'Dana', contact: 'dana@x.com' }, items: [{ productId: 'van-6', name: 'Half dozen', recipeId: 'van', recipeTitle: 'Vanilla', pieces: 6, qty: 1, unitPrice: 15 }], total: 15, ...extra }) as any;
    const orders = [mk(1, 'completed'), mk(2, 'completed'), mk(3, 'completed', { sample: true }), mk(4, 'completed'), mk(5, 'cancelled'), mk(6, 'completed', { test: true }), mk(7, 'confirmed'), mk(8, 'pending')];
    const r = loyaltyRows(orders, 5).get('dana@x.com')!;
    expect(r.done).toBe(3); expect(r.toNext).toBe(2); expect(r.available).toBe(0);
    expect(r.earner?.orderId).toBe('o8'); // 4th = o7, 5th = o8
    expect(progressText(r, 5)).toBe('3 of 5 · 2 more to a free half dozen');
    const more = [...orders, mk(9, 'completed'), mk(10, 'completed'), mk(11, 'ready', { reward: true })];
    const r2 = loyaltyRows(more, 5).get('dana@x.com')!;
    expect(r2.done).toBe(5); expect(r2.earned).toBe(1); expect(r2.used).toBe(1); expect(r2.available).toBe(0);
    expect(rewardValue(mk(1, 'x'))).toBe(15);
    expect(rewardValue({ items: [{ pieces: 12, qty: 1, unitPrice: 28 }] } as any)).toBeNull();
  });

  test('town on the form, address kept private until the order is confirmed AND paid, emailed once; no cash at pickup', () => {
    const s = setup({ town: 'Plainfield', address: '12 Secret Lane', payment: { venmo: 'flourflame' } });
    const menu = s.get({ action: 'menu' });
    expect(menu.shop).toMatchObject({ town: 'Plainfield', payFirst: true });
    expect(menu.shop.payment.cash).toBe(false);
    expect(JSON.stringify(menu)).not.toContain('Secret');
    place(s);
    const [id] = orderIds(s);
    s.post({ key: 'K', action: 'push', since: 0, events: [ev({ type: 'order.status', orderId: id, status: 'confirmed' })] });
    const confirmed = s.mail.find((m: any) => /confirmed/.test(m[1]));
    expect(confirmed[2]).toMatch(/Pickup is in Plainfield\. We’ll email you the exact address as soon as your payment comes in/);
    expect(confirmed[2]).not.toContain('Secret');
    expect(confirmed[2]).not.toMatch(/Cash at pickup/);
    expect(s.mail.some((m: any) => /pickup address/.test(m[1]))).toBe(false);
    s.post({ key: 'K', action: 'push', since: 0, events: [ev({ type: 'order.payment', orderId: id, paid: true, method: 'Venmo' })] });
    const addr = s.mail.filter((m: any) => /pickup address/.test(m[1]));
    expect(addr).toHaveLength(1);
    expect(addr[0][2]).toContain('12 Secret Lane');
    s.post({ key: 'K', action: 'push', since: 0, events: [ev({ type: 'order.status', orderId: id, status: 'ready' })] });
    expect(s.mail.filter((m: any) => /pickup address/.test(m[1]))).toHaveLength(1);
    const pulled = s.get({ action: 'pull', key: 'K', since: 0 });
    expect(pulled.version).toBe(14); // every sync tells the app the script version
    expect(computeBakery(pulled.events).addressSent).toEqual([id]);
  });

  test('loyalty can be turned off', () => {
    const s = setup({ loyalty: { off: true } });
    expect(s.get({ action: 'menu' }).shop.loyalty).toBeNull();
    place(s);
    expect(s.mail.at(-1)[2]).not.toMatch(/Loyalty/);
  });
});

describe('deleted orders never come back', () => {
  test('even when the delete is numbered before the order (sheet rows deleted by hand)', () => {
    const create = (id: string, seq: number) => ({ type: 'order.create', eventId: 'c' + id, seq, at: '2026-11-19T18:00:00Z', device: 'customer-form', orderId: id, source: 'form', status: 'pending', test: true, customer: { name: id }, items: [], total: 0 }) as any;
    const del = { type: 'order.delete', eventId: 'd', seq: 2, at: '2026-11-19T18:05:00Z', device: 'pc', orderIds: ['A', 'B'] } as any;
    const status = { type: 'order.status', eventId: 's', seq: 9, at: '2026-11-19T18:06:00Z', device: 'phone', orderId: 'A', status: 'confirmed' } as any;
    const b = computeBakery([del, create('A', 5), create('B', 6), create('C', 7), status]);
    expect(b.orders.map(o => o.orderId)).toEqual(['C']);
    expect(b.newFormOrders.map(o => o.orderId)).toEqual(['C']);
  });
});

describe('script v13: instant phone alerts (ntfy) and safer numbering', () => {
  const setup = (settings: any) => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: true, emailCustomers: true, ...settings } },
    ] });
    return s;
  };
  const order = { action: 'order', name: 'Omar K.', contact: 'o@x.com', notes: 'Extra crispy', items: [{ productId: cocoa12.productId, qty: 1 }] };

  test('each new order goes to the private topic, tapping opens Orders; tests are marked; off means off; no topic means nothing', () => {
    const s = setup({ ntfy: { topic: 'flourflame-abcdefghijkmnpqrstuv' }, appUrl: 'https://smugbedbug.github.io/flour-and-flame/' });
    expect(s.post(order).ok).toBe(true);
    expect(s.pushes).toHaveLength(1);
    const p = s.pushes[0];
    expect(p.url).toBe('https://ntfy.sh/');
    expect(p.body).toMatchObject({ topic: 'flourflame-abcdefghijkmnpqrstuv', priority: 4, tags: ['cookie'], click: 'https://smugbedbug.github.io/flour-and-flame/?go=1#/orders' });
    expect(p.body.title).toMatch(/^New order #\d+ · Omar K\.$/);
    expect(p.body.message).toContain('1 × ' + cocoa12.name);
    expect(p.body.message).toContain('Extra crispy');
    expect(p.body.message).not.toContain('o@x.com');                  // no email addresses in alerts
    s.post({ key: 'K', action: 'testOrder', name: 'T', items: [{ productId: cocoa12.productId, qty: 1 }] });
    expect(s.pushes[1].body.title).toMatch(/^🧪 Test: New order/);
    expect(s.post({ key: 'K', action: 'ntfyTest' })).toEqual({ ok: true });
    expect(s.post({ action: 'ntfyTest' }).error).toBe('bad-key');      // only your app can send a test
    const off = setup({ ntfy: { topic: 'flourflame-abcdefghijkmnpqrstuv', off: true } });
    off.post(order); expect(off.pushes).toHaveLength(0);
    const none = setup({});
    none.post(order); expect(none.pushes).toHaveLength(0);
    expect(none.post({ key: 'K', action: 'ntfyTest' }).error).toBe('no-topic');
  });

  test('a phone alert problem never loses the order; a missing Google permission is reported clearly', () => {
    const s = setup({ ntfy: { topic: 'flourflame-abcdefghijkmnpqrstuv' } });
    s.fetchMode.fail = 'You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request';
    const r = s.post(order);
    expect(r.ok).toBe(true);
    expect(s.mail.some((m: any) => /New order/.test(m[1]))).toBe(true); // the Gmail alert still goes out
    expect(s.post({ key: 'K', action: 'ntfyTest' }).error).toBe('needs-permission');
  });

  test('new events get the highest number + 1, even if the last row was moved or deleted by hand', () => {
    const s = setup({});
    s.post(order);
    const max = Math.max(...s.rows.slice(1).map(r => Number(r[0])));
    const moved = s.rows.splice(1, 1)[0];                                // re-sort: the first event row goes to the bottom
    s.rows.push(moved);
    s.post({ ...order, name: 'Next' });
    const created = s.rows.filter(r => r[4] === 'order.create').map(r => JSON.parse(r[5]));
    expect(created.find(e => e.customer.name === 'Next').orderNo).toBe(max + 1);
    const seqs = s.rows.slice(1).map(r => Number(r[0]));
    expect(new Set(seqs).size).toBe(seqs.length);                        // no reused numbers
  });
});

describe('script v14: weekly summary, reviews on the form, final deletes', () => {
  afterEach(() => { vi.useRealTimers(); });
  const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };
  const setup = (settings: any = {}) => {
    const s = loadScript('K');
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'product.upsert', eventId: 'p1', at: 'x', device: 'pc', product: cocoa12 },
      { type: 'shop.settings', eventId: 's1', at: 'x', device: 'pc', settings: { open: true, emailCustomers: false, ...settings } },
    ] });
    return s;
  };
  const weekly = (s: any) => s.mail.filter((m: any) => /Your week/.test(m[1]));

  test('sent once after 6 PM Sunday with the week’s numbers; tests ignored; caught up Monday; not on Wednesday; can be switched off', () => {
    at('2026-11-18T16:00:00Z');                         // Wed Nov 18, 10 AM Chicago (too late to catch up last week)
    const s = setup();
    for (const n of ['Ann', 'Bo']) s.post({ action: 'order', name: n, contact: n + '@x.com', items: [{ productId: cocoa12.productId, qty: 1 }] });
    s.post({ key: 'K', action: 'testOrder', name: 'T', items: [{ productId: cocoa12.productId, qty: 3 }] });
    const ids = s.get({ action: 'pull', key: 'K', since: 0 }).events.filter((e: any) => e.type === 'order.create' && !e.test).map((e: any) => e.orderId);
    s.post({ key: 'K', action: 'push', since: 0, events: [{ type: 'order.status', eventId: 'st1', at: '2026-11-19T20:00:00Z', device: 'pc', orderId: ids[0], status: 'completed' }] });
    at('2026-11-22T23:00:00Z');                         // Sun Nov 22, 5 PM Chicago: not yet
    s.get({ action: 'menu' });
    expect(weekly(s)).toHaveLength(0);
    at('2026-11-23T01:30:00Z');                         // Sun Nov 22, 7:30 PM Chicago
    s.get({ action: 'menu' });
    expect(weekly(s)).toHaveLength(1);
    const [to, subject, body] = weekly(s)[0];
    expect(to).toBe('owner@gmail.com');
    expect(subject).toMatch(/Your week: 2 orders · \$\d+\.\d\d picked up · top: /);
    expect(body).toMatch(/Mon Nov 16 – Sun Nov 22/);
    expect(body).toMatch(/New orders: 2 /);
    expect(body).toMatch(/Picked up: 1 · sales \$/);
    expect(body).toMatch(/Customers: 2 new, 0 returning/);
    s.get({ action: 'menu' }); s.post({ action: 'order', name: 'Cy', contact: 'c@x.com', items: [{ productId: cocoa12.productId, qty: 1 }] });
    expect(weekly(s)).toHaveLength(1);                  // only once
    // next week: nobody visited Sunday evening, so Monday's first visit sends it
    at('2026-11-30T16:00:00Z');                         // Mon Nov 30, 10 AM Chicago
    s.get({ action: 'menu' });
    expect(weekly(s)).toHaveLength(2);
    expect(weekly(s)[1][2]).toMatch(/Mon Nov 23 – Sun Nov 29/);
    // too late for a week that was never sent: wait for the next Sunday
    at('2026-12-09T16:00:00Z');                         // Wednesday
    const late = setup();
    late.get({ action: 'menu' });
    expect(weekly(late)).toHaveLength(0);
    const off = setup({ weekly: { off: true } });
    at('2026-12-13T01:00:00Z');                         // Sunday 7 PM
    off.get({ action: 'menu' });
    expect(weekly(off)).toHaveLength(0);
    expect(off.post({ key: 'K', action: 'weeklyPreview' })).toEqual({ ok: true }); // the sample always works
    expect(weekly(off)[0][1]).toMatch(/^\(Sample\)/);
    expect(off.post({ action: 'weeklyPreview' }).error).toBe('bad-key');
  });

  test('reviews you chose show on the form: first name only, at most 3', () => {
    const s = setup({ featured: [{ text: 'So buttery!', name: 'Dana Lee (card)', stars: 5 }, { text: 'Best ever', name: 'Leo', stars: 4.6 }, { text: 'Yum', name: '', stars: 5 }, { text: 'Fourth', name: 'X', stars: 5 }] });
    expect(s.get({ action: 'menu' }).shop.featured).toEqual([{ text: 'So buttery!', name: 'Dana', stars: 5 }, { text: 'Best ever', name: 'Leo', stars: 5 }, { text: 'Yum', name: '', stars: 5 }]);
  });

  test('a deleted order stays deleted on the sheet too (it no longer counts toward the order limit)', () => {
    const s = setup({ limit: { pieces: 12, per: 'day' } });
    s.post({ key: 'K', action: 'push', since: 0, events: [
      { type: 'order.delete', eventId: 'd1', at: 'x', device: 'pc', orderIds: ['GONE'] },
      { type: 'order.create', eventId: 'c1', at: 'x', device: 'pc', orderId: 'GONE', source: 'manual', status: 'confirmed', customer: { name: 'Old' }, pickupDate: '2030-01-02', items: [{ productId: cocoa12.productId, name: 'x', recipeId: 'cocoa', recipeTitle: 'Cocoa', pieces: 12, qty: 1, unitPrice: 1 }], total: 1 },
    ] });
    expect(s.get({ action: 'menu' }).booked['2030-01-02'] ?? 0).toBe(0);
    expect(s.post({ action: 'order', name: 'New', contact: 'n@x.com', pickupDate: '2030-01-02', items: [{ productId: cocoa12.productId, qty: 1 }] }).ok).toBe(true);
  });
});

describe('freezer nudges from what usually sells', () => {
  test('usual weekly use vs free dough; ignores tests, tasting boxes, cancelled; quiet until there is enough history', async () => {
    const { doughNudges } = await import('../src/forecast');
    const now = Date.parse('2026-11-30T12:00:00Z');
    const mk = (i: number, daysAgo: number, qty: number, extra: any = {}) => ({ orderId: 'o' + i, createdAt: new Date(now - daysAgo * 86400000).toISOString(), updatedAt: 'x', source: 'form', status: 'completed', customer: { name: 'A' }, items: [{ productId: 'bb12', name: 'Dozen', recipeId: 'bb', recipeTitle: 'Brown Butter', pieces: 12, qty, unitPrice: 16, dough: true }], total: 16 * qty, ...extra }) as any;
    const orders = [mk(1, 27, 2), mk(2, 20, 2), mk(3, 13, 2), mk(4, 6, 2), mk(5, 3, 5, { test: true }), mk(6, 2, 5, { sample: true }), mk(7, 1, 5, { status: 'cancelled' })];
    const plan = [{ recipeId: 'bb', recipeTitle: 'Brown Butter', inFreezer: 20, reserved: 12, available: 8, pending: 0, makeMore: 0 }] as any;
    expect(doughNudges(orders, plan, now)).toEqual([{ recipeId: 'bb', recipeTitle: 'Brown Butter', perWeek: 25, free: 8, makeMore: 17 }]); // 96 balls over 27 days
    expect(doughNudges(orders, [{ ...plan[0], available: 30 }], now)).toEqual([]);           // plenty free
    expect(doughNudges([mk(1, 5, 4)], plan, now)).toEqual([]);                                 // only 5 days of history
  });
});
