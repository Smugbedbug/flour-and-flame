// The Google Apps Script that turns a private Google Sheet into the shared "bakery sheet".
// The app generates it with your secret key filled in; you paste it into Extensions → Apps Script.
// Design: an append-only list of events (freezer additions/removals, later orders). Each device sends
// its new events and receives everyone's. Events have unique ids, so sending twice never duplicates.

export const APPS_SCRIPT_VERSION = 1;

export function buildAppsScript(key: string): string {
  return `/**
 * Flour and Flame Bakery: shared bakery sheet (script version ${APPS_SCRIPT_VERSION})
 * Paste this whole file into Extensions → Apps Script of a NEW, private Google Sheet,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * The key below is your private password between the app and this sheet. Don't share it.
 */
const APP_KEY = '${key}';
const SHEET_NAME = 'Events';
const COLS = 6; // seq | eventId | at | device | type | data (JSON)

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['seq', 'eventId', 'at', 'device', 'type', 'data']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, app: 'flour-and-flame', version: ${APPS_SCRIPT_VERSION}, authorized: p.key === APP_KEY });
  if (p.key !== APP_KEY) return json_({ ok: false, error: 'bad-key' });
  if (p.action === 'pull') return json_(Object.assign({ ok: true }, pull_(Number(p.since || 0))));
  return json_({ ok: false, error: 'unknown-action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad-json' }); }
  if (!body || body.key !== APP_KEY) return json_({ ok: false, error: 'bad-key' });
  if (body.action === 'push') return json_(Object.assign({ ok: true }, push_(body.events || [], Number(body.since || 0))));
  return json_({ ok: false, error: 'unknown-action' });
}

function pull_(since) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last <= 1) return { events: [], last: 0 };
  const rows = sh.getRange(2, 1, last - 1, COLS).getValues();
  const events = [];
  for (const r of rows) {
    if (Number(r[0]) > since) {
      try { const ev = JSON.parse(String(r[5])); ev.seq = Number(r[0]); events.push(ev); } catch (err) { /* skip damaged row */ }
    }
  }
  return { events: events, last: Number(rows[rows.length - 1][0]) || 0 };
}

function push_(events, since) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const ids = new Set(last > 1 ? sh.getRange(2, 2, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : []);
    let seq = last > 1 ? Number(sh.getRange(last, 1).getValue()) || 0 : 0;
    const rows = [];
    for (const ev of events) {
      if (!ev || typeof ev.eventId !== 'string' || ids.has(ev.eventId)) continue; // already stored → skip (no duplicates)
      ids.add(ev.eventId);
      seq++;
      const copy = Object.assign({}, ev); delete copy.seq; delete copy.synced;
      rows.push([seq, ev.eventId, String(ev.at || ''), String(ev.device || ''), String(ev.type || ''), JSON.stringify(copy)]);
    }
    if (rows.length) sh.getRange(last + 1, 1, rows.length, COLS).setValues(rows);
    return Object.assign({ accepted: rows.length }, pull_(since));
  } finally {
    lock.releaseLock();
  }
}
`;
}

/** A strong random key (letters/digits, 32 chars). */
export function newSheetKey(): string {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(a, b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 56]).join('').slice(0, 32);
}
