import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { computeFreezer, weeksSince, type LedgerEvent } from '../src/freezer';
import { buildAppsScript } from '../src/appsScript';
import { addEvents, setSheetConfig, syncLedger, testSheet, getSheetConfig } from '../src/ledger';
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
    expect(readFileSync('src/appsScript.ts', 'utf8')).toContain('LockService');
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
