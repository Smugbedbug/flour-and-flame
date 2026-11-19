import { computeBakery } from '../src/bakery';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { computeFreezer, weeksSince, type LedgerEvent } from '../src/freezer';
import { buildAppsScript } from '../src/appsScript';
import { addEvents, resetFullRead, setSheetConfig, setSheetTimeout, syncLedger, testSheet, getSheetConfig } from '../src/ledger';
import { ledgerAll } from '../src/db';

const add = (id: string, recipeId: string, count: number, frozenOn: string, extra: Partial<LedgerEvent> = {}): LedgerEvent =>
  ({ type: 'freezer.add', eventId: id, at: frozenOn + 'T10:00:00Z', device: 'd', batchId: 'b-' + id, recipeId, recipeTitle: recipeId.toUpperCase(), count, frozenOn, ...extra }) as LedgerEvent;
const rm = (id: string, recipeId: string, count: number, extra: Partial<LedgerEvent> = {}): LedgerEvent =>
  ({ type: 'freezer.remove', eventId: id, at: '2026-11-20T10:00:00Z', device: 'd', recipeId, recipeTitle: recipeId.toUpperCase(), count, reason: 'baked', ...extra }) as LedgerEvent;

describe('freezer stock', () => {
  test('adds by batch, removes oldest first, never below zero, never counts an event twice', () => {
    const evs = [add('1', 'cocoa', 24, '2026-11-01', { seq: 1 }), add('2', 'cocoa', 12, '2026-11-10', { seq: 2 }), rm('3', 'cocoa', 30, { seq: 3 }), add('1', 'cocoa', 24, '2026-11-01', { seq: 1 })];
    const s = computeFreezer(evs);
    expect(s.items[0].total).toBe(6);
    expect(s.items[0].batches).toEqual([expect.objectContaining({ frozenOn: '2026-11-10', remaining: 6, added: 12 })]);
    const over = computeFreezer([...evs, rm('4', 'cocoa', 10, { seq: 4 })]);
    expect(over.items[0].total).toBe(0); expect(over.items[0].batches).toEqual([]); expect(over.total).toBe(0); expect(over.warnings[0]).toMatch(/only 6/);
  });
  test('removing from a chosen batch', () => {
    const s = computeFreezer([add('1', 'c', 10, '2026-11-01', { seq: 1 }), add('2', 'c', 10, '2026-11-05', { seq: 2 }), rm('3', 'c', 4, { seq: 3, batchId: 'b-2' } as any)]);
    expect(s.items[0].batches.map(b => b.remaining)).toEqual([10, 6]);
  });
  test('every device computes the same stock from the same events, in any arrival order', () => {
    const evs = [add('1', 'c', 10, '2026-11-01', { seq: 1 }), rm('2', 'c', 7, { seq: 2 }), add('3', 'c', 5, '2026-11-03', { seq: 3 }), rm('4', 'c', 5, { seq: 4 })];
    const a = computeFreezer(evs), b = computeFreezer([...evs].reverse());
    expect(a).toEqual(b); expect(a.total).toBe(3);
  });
  test('age in weeks', () => { expect(weeksSince('2026-11-01', new Date('2026-11-18T12:00:00'))).toBe(2); });
});

// ---- run the REAL Apps Script code against a fake Google Sheet ----
function loadScript(key: string) {
  const rows: any[][] = [];
  const sheet = {
    appendRow: (r: any[]) => rows.push(r), setFrozenRows: () => {},
    getLastRow: () => rows.length,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({
      getValues: () => rows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)),
      getValue: () => rows[r - 1][c - 1],
      setValues: (vals: any[][]) => vals.forEach((v, i) => { rows[r - 1 + i] = [...v]; }),
    }),
  };
  let created = false;
  const api = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (created ? sheet : null), insertSheet: () => { created = true; return sheet; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ text: t }) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  };
  const code = buildAppsScript(key);
  const fn = new Function('SpreadsheetApp', 'ContentService', 'LockService', code + '\nreturn { doGet, doPost };');
  return { ...fn(api.SpreadsheetApp, api.ContentService, api.LockService), rows };
}
function fetchToScript(script: ReturnType<typeof loadScript>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const out = init.method === 'POST' ? script.doPost({ postData: { contents: String(init.body) } }) : script.doGet({ parameter: Object.fromEntries(u.searchParams) });
    return new Response(out.text, { status: 200 });
  }));
}
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
type Dev = { db: IDBFactory; storage: Record<string, string> };
const pc: Dev = { db: new IDBFactory(), storage: {} }, phone: Dev = { db: new IDBFactory(), storage: {} };
let cur: Dev | null = null;
function use(d: Dev) { if (cur) cur.storage = { ...localStorage }; localStorage.clear(); Object.entries(d.storage).forEach(([k, v]) => localStorage.setItem(k, v)); (globalThis as any).indexedDB = d.db; cur = d; }
beforeEach(() => { cur = null; localStorage.clear(); pc.db = new IDBFactory(); pc.storage = {}; phone.db = new IDBFactory(); phone.storage = {}; });

describe('shared bakery sheet (real script, fake Google)', () => {
  test('PC and phone both add and remove; both end up with the same stock; offline changes catch up; no duplicates', async () => {
    const script = loadScript('k3y-123'); fetchToScript(script);
    await expect(testSheet(URL_, 'wrong')).rejects.toThrow(/key doesn’t match/);
    await testSheet(URL_, 'k3y-123');
    use(pc); setSheetConfig({ url: URL_, key: 'k3y-123' });
    await addEvents([{ type: 'freezer.add', batchId: 'B1', recipeId: 'cocoa', recipeTitle: 'Cocoa Espresso', count: 24, frozenOn: '2026-11-18' } as any]);
    await syncLedger();
    use(phone); setSheetConfig({ url: URL_, key: 'k3y-123' });
    await syncLedger();
    expect(computeFreezer(await ledgerAll()).total).toBe(24);
    // phone offline: removes 6; PC adds 12 meanwhile
    await addEvents([{ type: 'freezer.remove', recipeId: 'cocoa', recipeTitle: 'Cocoa Espresso', count: 6, reason: 'baked' } as any]);
    use(pc); await addEvents([{ type: 'freezer.add', batchId: 'B2', recipeId: 'cocoa', recipeTitle: 'Cocoa Espresso', count: 12, frozenOn: '2026-11-19' } as any]); await syncLedger();
    use(phone); await syncLedger(); await syncLedger(); // sending twice is harmless
    use(pc); await syncLedger();
    const pcStock = computeFreezer(await ledgerAll());
    use(phone); const phoneStock = computeFreezer(await ledgerAll());
    expect(pcStock.total).toBe(30); expect(phoneStock).toEqual(pcStock);
    expect(script.rows.length - 1).toBe(3); // header + 3 events, no duplicates
    expect(getSheetConfig().lastSeq).toBe(3);
  });
  test('quick changes made before a sync reach the sheet in the order they were made (order ends "ready", not back to "confirmed")', async () => {
    const script = loadScript('k'); fetchToScript(script);
    use(pc); setSheetConfig({ url: URL_, key: 'k' });
    const create = { type: 'order.create', orderId: 'o1', source: 'manual', status: 'pending', customer: { name: 'Sue' }, items: [], total: 0 } as any;
    await addEvents([create]);
    for (const status of ['confirmed', 'ready']) await addEvents([{ type: 'order.status', orderId: 'o1', status } as any]);
    await addEvents([{ type: 'order.handoff', orderId: 'o1', to: 'Mom' } as any, { type: 'order.packed', orderId: 'o1', packed: true } as any]);
    await syncLedger();
    expect(script.rows.slice(1).map((r: any[]) => r[4])).toEqual(['order.create', 'order.status', 'order.status', 'order.handoff', 'order.packed']);
    use(phone); setSheetConfig({ url: URL_, key: 'k' }); await syncLedger();
    expect(computeBakery(await ledgerAll()).orders[0]).toMatchObject({ status: 'ready', handedTo: 'Mom', packed: true });
  });
  test('a wrong key is reported clearly and nothing is lost locally', async () => {
    const script = loadScript('right'); fetchToScript(script);
    use(pc); setSheetConfig({ url: URL_, key: 'wrong' });
    await addEvents([{ type: 'freezer.add', batchId: 'B', recipeId: 'r', recipeTitle: 'R', count: 5, frozenOn: '2026-11-18' } as any]);
    await expect(syncLedger()).rejects.toThrow(/rejected the key/);
    expect((await ledgerAll()).filter(e => e.seq === undefined)).toHaveLength(1);
    expect(getSheetConfig().lastError).toMatch(/key/);
  });
  test('the generated script contains the key and no placeholder', () => {
    const s = buildAppsScript('abc123');
    expect(s).toContain("const APP_KEY = 'abc123';"); expect(s).not.toContain('__KEY__');
    expect(readFileSync('src/apps-script/Code.gs', 'utf8')).toContain('LockService');
  });
});

import { createBackup, restoreBackup, validateBackup } from '../src/backup';
import { init, dumpAll } from '../src/db';
describe('freezer data safety', () => {
  test('freezer events are in backups; restoring re-reads the sheet; upgrading keeps everything', async () => {
    use(pc); await init();
    setSheetConfig({ url: URL_, key: 'k', lastSeq: 7 });
    await addEvents([{ type: 'freezer.add', batchId: 'B', recipeId: 'r', recipeTitle: 'R', count: 5, frozenOn: '2026-11-18' } as any]);
    const text = JSON.stringify(await createBackup());
    expect(JSON.parse(text).data.ledger).toHaveLength(1);
    (globalThis as any).indexedDB = new IDBFactory();
    const check = validateBackup(text);
    expect(check.ok).toBe(true);
    if (check.ok) await restoreBackup(check.backup);
    expect(computeFreezer(await ledgerAll()).total).toBe(5);
    expect(getSheetConfig().lastSeq).toBe(0); // will re-read everything from the sheet (no duplicates: ids)
    expect((await dumpAll()).recipes.length).toBe(2);
  });
});

describe('sync never gets stuck', () => {
  test('a request that never answers is given up (after 30 s in the app), and the next sync works', async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    localStorage.clear();
    setSheetConfig({ url: 'https://script.google.com/macros/s/STUCK/exec', key: 'k' });
    setSheetTimeout(200);
    let hang = true;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit = {}) => {
      if (hang) return new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      return Promise.resolve(new Response(JSON.stringify({ ok: true, events: [], last: 0, version: 12 })));
    }));
    await expect(syncLedger()).rejects.toThrow(/took too long/);
    hang = false;
    await syncLedger(); // before the fix, this waited on the stuck request forever
    expect(getSheetConfig().lastError).toBeUndefined();
    expect(getSheetConfig().scriptVersion).toBe(12); // the script version comes along with every sync
    setSheetTimeout(60_000);
    vi.unstubAllGlobals();
  });

  test('new orders still arrive when sending this device’s changes keeps failing', async () => {
    (globalThis as any).indexedDB = new IDBFactory();
    localStorage.clear();
    setSheetConfig({ url: 'https://script.google.com/macros/s/X/exec', key: 'k' });
    const order = { type: 'order.create', eventId: 'new-order', seq: 1, at: '2026-11-19T18:00:00Z', device: 'customer-form', orderId: 'o1', source: 'form', status: 'pending', customer: { name: 'Ann' }, items: [], total: 0 };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') throw new TypeError('network down for big uploads');
      return new Response(JSON.stringify({ ok: true, events: String(url).includes('since=0') ? [order] : [], last: 1, version: 12 }));
    }));
    await addEvents([{ type: 'freezer.add', batchId: 'B', recipeId: 'c', recipeTitle: 'C', count: 1, frozenOn: '2026-11-19' } as any]);
    await expect(syncLedger()).rejects.toThrow();
    const all = await ledgerAll();
    expect(all.some(e => e.eventId === 'new-order')).toBe(true);       // the order came through anyway
    expect(all.filter(e => e.seq === undefined)).toHaveLength(1);      // our change waits for the next try
    expect(getSheetConfig().lastError).toMatch(/haven’t reached the sheet yet/);
    vi.unstubAllGlobals();
  });
});

describe('sync recovers when the sheet’s numbering doesn’t match this device', () => {
  // a tiny fake sheet with the same rules as the real script: numbers = last row + 1, duplicates skipped
  const fakeSheet = () => {
    const rows: any[] = [];
    const pull = (since: number) => ({ ok: true, events: rows.filter(r => r.seq > since), last: rows.length ? rows[rows.length - 1].seq : 0, version: 12 });
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        const b = JSON.parse(String(init.body));
        for (const ev of b.events) if (!rows.some(r => r.eventId === ev.eventId)) rows.push({ ...ev, seq: (rows.length ? rows[rows.length - 1].seq : 0) + 1 });
        return new Response(JSON.stringify(pull(b.since)));
      }
      return new Response(JSON.stringify(pull(Number(new URL(url).searchParams.get('since')))));
    });
    return { rows, fetch };
  };
  const order = (id: string) => ({ type: 'order.create', eventId: id, at: '2026-11-19T18:00:00Z', device: 'customer-form', orderId: id, source: 'form', status: 'pending', customer: { name: id }, items: [], total: 0 });
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); localStorage.clear(); resetFullRead(); setSheetConfig({ url: 'https://script.google.com/macros/s/X/exec', key: 'k' }); });

  test('changes the sheet already has (with lower numbers) stop counting as “not yet on the sheet”', async () => {
    const sheet = fakeSheet(); vi.stubGlobal('fetch', sheet.fetch);
    await syncLedger();                                   // the app-start full read is done
    await addEvents([{ type: 'freezer.add', batchId: 'B', recipeId: 'c', recipeTitle: 'C', count: 1, frozenOn: '2026-11-19' } as any]);
    const mine = (await ledgerAll())[0];
    sheet.rows.push({ ...mine, seq: 1 });                 // an earlier try got through, but its answer never arrived
    for (let i = 2; i <= 6; i++) sheet.rows.push({ ...order('x' + i), seq: i });
    setSheetConfig({ lastSeq: 6 });                       // …and this device already moved past it
    await syncLedger();
    expect((await ledgerAll()).filter(e => e.seq === undefined)).toHaveLength(0);
    await syncLedger();
    expect(sheet.fetch.mock.calls.filter(c => (c[1] as any)?.method === 'POST')).toHaveLength(1); // not re-sent every time
    vi.unstubAllGlobals();
  });

  test('rows deleted from the sheet: new orders with reused numbers still show up', async () => {
    const sheet = fakeSheet(); vi.stubGlobal('fetch', sheet.fetch);
    for (let i = 1; i <= 8; i++) sheet.rows.push({ ...order('old' + i), seq: i });
    await syncLedger();
    expect(getSheetConfig().lastSeq).toBe(8);
    sheet.rows.splice(3);                                 // someone tidies the sheet: rows 4–8 deleted
    sheet.rows.push({ ...order('NEW-ORDER'), seq: 4 });  // the next order reuses number 4
    await syncLedger();
    expect((await ledgerAll()).some(e => e.eventId === 'NEW-ORDER')).toBe(true);
    expect(getSheetConfig().lastSeq).toBe(4);             // follows the sheet from now on
    sheet.rows.push({ ...order('NEXT'), seq: 5 });
    await syncLedger();
    expect((await ledgerAll()).some(e => e.eventId === 'NEXT')).toBe(true);
    vi.unstubAllGlobals();
  });

  test('anything missed is found on the next app start', async () => {
    const sheet = fakeSheet(); vi.stubGlobal('fetch', sheet.fetch);
    for (let i = 1; i <= 5; i++) sheet.rows.push({ ...order('o' + i), seq: i });
    await syncLedger();
    sheet.rows.push({ ...order('SNEAKY'), seq: 3 });      // numbered out of order (rows deleted, then re-grown)
    sheet.rows.push({ ...order('o6'), seq: 6 });
    await syncLedger();
    expect((await ledgerAll()).some(e => e.eventId === 'SNEAKY')).toBe(false); // a normal check can't see it…
    resetFullRead();                                      // …the app is reopened
    await syncLedger();
    expect((await ledgerAll()).some(e => e.eventId === 'SNEAKY')).toBe(true);
    vi.unstubAllGlobals();
  });
});
