// Shared bakery sheet client: keeps this device's freezer/order events in step with your Google Sheet.
// Works offline: new events are saved locally first and sent when there's a connection.
import { ledgerAll, ledgerPut } from './db';
import type { LedgerEvent } from './freezer';

export type SheetConfig = { url?: string; key?: string; lastSeq?: number; lastSyncAt?: string; lastError?: string; scriptVersion?: number };
const CFG = 'ff-sheet', DEVICE = 'ff-device';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* unavailable */ } },
};
export function getSheetConfig(): SheetConfig { try { return JSON.parse(ls.get(CFG) || '{}'); } catch { return {}; } }
export function setSheetConfig(patch: Partial<SheetConfig>): SheetConfig {
  const next = { ...getSheetConfig(), ...patch };
  ls.set(CFG, JSON.stringify(next));
  window.dispatchEvent(new Event('ff-sheet'));
  return next;
}
export function clearSheet() { ls.set(CFG, null); window.dispatchEvent(new Event('ff-sheet')); }
export function deviceId(): string {
  let d = ls.get(DEVICE);
  if (!d) { d = crypto.randomUUID().slice(0, 8); ls.set(DEVICE, d); }
  return d;
}
export const sheetReady = (c = getSheetConfig()) => !!(c.url && c.key);

export function isValidScriptUrl(url: string): boolean {
  return /^https:\/\/script\.google(usercontent)?\.com\/.+/i.test(url.trim());
}

async function call(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try { res = await fetch(url, { redirect: 'follow', cache: 'no-store', ...init }); }
  catch { throw Error('Can’t reach your bakery sheet. Check the internet connection.'); }
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw Error('The bakery sheet answered with a web page instead of data. Check the Web app URL, and that “Who has access” is set to Anyone.'); }
  if (data?.error === 'bad-key') throw Error('The sheet rejected the key. Re-copy the script from the app (it contains your key) and deploy it again.');
  if (!data?.ok) throw Error(`The bakery sheet reported a problem (${data?.error ?? res.status}).`);
  return data;
}

/** Check a Web app URL + key without changing anything. */
export async function testSheet(url: string, key: string): Promise<number> {
  if (!isValidScriptUrl(url)) throw Error('That doesn’t look like an Apps Script Web app URL (it should start with https://script.google.com/).');
  const u = `${url.trim()}?action=ping&key=${encodeURIComponent(key)}`;
  const r = await call(u);
  if (r.app !== 'flour-and-flame') throw Error('That URL isn’t the Flour and Flame script.');
  if (!r.authorized) throw Error('The script is running but the key doesn’t match. Re-copy the script from the app and deploy a new version.');
  return Number(r.version) || 1;
}

/** Save events on this device (unshared) and share them when possible. */
export async function addEvents(events: Omit<LedgerEvent, 'eventId' | 'at' | 'device'>[]): Promise<LedgerEvent[]> {
  const dev = deviceId();
  const full = events.map(e => ({ ...e, eventId: crypto.randomUUID(), at: nextStamp(), device: dev })) as LedgerEvent[];
  await ledgerPut(full);
  window.dispatchEvent(new Event('ff-ledger'));
  scheduleSync();
  return full;
}

let lastStamp = 0;
/** Strictly increasing timestamps on this device, so events keep the order they were made in. */
function nextStamp(): string { lastStamp = Math.max(Date.now(), lastStamp + 1); return new Date(lastStamp).toISOString(); }

let syncing: Promise<{ sent: number; received: number }> | null = null;
/** Send unshared events and fetch everyone's. Safe to call often; events are never duplicated. */
export function syncLedger(): Promise<{ sent: number; received: number }> {
  if (syncing) return syncing;
  syncing = (async () => {
    const cfg = getSheetConfig();
    if (!sheetReady(cfg)) return { sent: 0, received: 0 };
    try {
      // oldest first: the sheet numbers events in the order received, and that order decides e.g. an order's latest status
      const pending = (await ledgerAll()).filter(e => e.seq === undefined).sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
      const since = cfg.lastSeq ?? 0;
      const data = pending.length
        ? await call(cfg.url!, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: cfg.key, action: 'push', since, events: pending }) })
        : await call(`${cfg.url}?action=pull&key=${encodeURIComponent(cfg.key!)}&since=${since}`);
      const incoming = (data.events ?? []) as LedgerEvent[];
      await ledgerPut(incoming.filter(e => e && typeof e.eventId === 'string' && typeof e.seq === 'number'));
      setSheetConfig({ lastSeq: Math.max(since, Number(data.last) || 0), lastSyncAt: new Date().toISOString(), lastError: undefined });
      if (incoming.length || pending.length) window.dispatchEvent(new Event('ff-ledger'));
      return { sent: pending.length, received: incoming.length };
    } catch (e) {
      setSheetConfig({ lastError: e instanceof Error ? e.message : 'Sync failed' });
      throw e;
    }
  })().finally(() => { syncing = null; });
  return syncing;
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(delay = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { if (navigator.onLine) void syncLedger().catch(() => {}); }, delay);
}

/** After restoring a backup, re-read everything from the sheet. */
export function resetLedgerCursor() { if (getSheetConfig().url) setSheetConfig({ lastSeq: 0 }); }
