// The Google Apps Script that turns a private Google Sheet into the shared "bakery sheet".
// The app generates it with your secret key filled in; you paste it into Extensions → Apps Script.
// Design: an append-only list of events (freezer additions/removals, later orders). Each device sends
// its new events and receives everyone's. Events have unique ids, so sending twice never duplicates.

export const APPS_SCRIPT_VERSION = 2; // v2: public menu + customer order intake + email notification

export function buildAppsScript(key: string): string {
  return `/**
 * Flour and Flame Bakery: shared bakery sheet (script version ${APPS_SCRIPT_VERSION})
 * Paste this whole file into Extensions → Apps Script of a NEW, private Google Sheet,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * The key below is your private password between the app and this sheet. Don't share it.
 * Customers can only (a) read your menu (names and prices) and (b) submit an order request.
 * Each new order request is emailed to the Gmail account that owns this sheet.
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
  if (p.action === 'menu') return json_({ ok: true, app: 'flour-and-flame', menu: menu_() });
  if (p.action === 'ping') return json_({ ok: true, app: 'flour-and-flame', version: ${APPS_SCRIPT_VERSION}, authorized: p.key === APP_KEY });
  if (p.key !== APP_KEY) return json_({ ok: false, error: 'bad-key' });
  if (p.action === 'pull') return json_(Object.assign({ ok: true }, pull_(Number(p.since || 0))));
  return json_({ ok: false, error: 'unknown-action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad-json' }); }
  if (body && body.action === 'order') return json_(order_(body)); // public: customer order request
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

// ---------- public menu (latest version of each product; active ones only) ----------
function products_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const map = {};
  if (last <= 1) return map;
  const rows = sh.getRange(2, 1, last - 1, COLS).getValues();
  for (const r of rows) {
    if (String(r[4]) !== 'product.upsert') continue;
    try { const ev = JSON.parse(String(r[5])); if (ev.product && ev.product.productId) map[ev.product.productId] = ev.product; } catch (err) { /* skip */ }
  }
  return map;
}
function menu_() {
  const map = products_();
  return Object.keys(map).map(function (k) { return map[k]; }).filter(function (p) { return p.active; })
    .map(function (p) { return { productId: p.productId, name: p.name, recipeTitle: p.recipeTitle, pieces: p.pieces, price: p.price }; })
    .sort(function (a, b) { return (a.recipeTitle + a.pieces).localeCompare(b.recipeTitle + b.pieces); });
}

// ---------- public order request ----------
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\\u0000-\\u001f]/g, ' ').trim().slice(0, max); }
function order_(b) {
  if (b.website) return { ok: true, orderNo: 0 }; // hidden spam trap field: pretend success
  const name = clean_(b.name, 80), contact = clean_(b.contact, 120), notes = clean_(b.notes, 500), pickupDate = clean_(b.pickupDate, 10);
  if (!name || !contact) return { ok: false, error: 'missing-contact' };
  const cache = CacheService.getScriptCache();
  const recent = Number(cache.get('orders-per-minute') || 0);
  if (recent >= 10) return { ok: false, error: 'busy' };
  cache.put('orders-per-minute', String(recent + 1), 60);
  const map = products_();
  const items = [];
  for (const it of (b.items || []).slice(0, 20)) {
    const p = map[it && it.productId];
    const qty = Math.floor(Number(it && it.qty));
    if (!p || !p.active || !(qty >= 1 && qty <= 20)) continue;
    items.push({ productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty: qty, unitPrice: p.price });
  }
  if (!items.length) return { ok: false, error: 'empty-order' };
  const total = Math.round(items.reduce(function (s, i) { return s + i.qty * i.unitPrice; }, 0) * 100) / 100;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let seq;
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    seq = (last > 1 ? Number(sh.getRange(last, 1).getValue()) || 0 : 0) + 1;
    const ev = { type: 'order.create', eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'customer-form', orderId: Utilities.getUuid(), orderNo: seq,
      source: 'form', status: 'pending', customer: { name: name, contact: contact }, items: items, pickupDate: pickupDate || undefined, notes: notes || undefined, total: total };
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
  } finally { lock.releaseLock(); }
  try {
    const lines = items.map(function (i) { return '  ' + i.qty + ' × ' + i.name + '  ($' + (i.qty * i.unitPrice).toFixed(2) + ')'; }).join('\\n');
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'New Flour and Flame order #' + seq + ' from ' + name,
      'New order request #' + seq + '\\n\\nFrom: ' + name + '\\nContact: ' + contact + (pickupDate ? '\\nPreferred pickup: ' + pickupDate : '') +
      '\\n\\n' + lines + '\\n\\nTotal: $' + total.toFixed(2) + (notes ? '\\n\\nNotes: ' + notes : '') + '\\n\\nOpen the Flour and Flame app to confirm it.');
  } catch (err) { /* the order is saved even if email fails */ }
  return { ok: true, orderNo: seq, total: total };
}
`;
}

/** A strong random key (letters/digits, 32 chars). */
export function newSheetKey(): string {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(a, b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 56]).join('').slice(0, 32);
}
