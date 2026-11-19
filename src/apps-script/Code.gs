/**
 * Flour and Flame Bakery: shared bakery sheet (script version __VERSION__)
 * Paste this whole file into Extensions → Apps Script of your private Google Sheet,
 * then Deploy (Web app · Execute as: Me · Who has access: Anyone).
 * The key below is your private password between the app and this sheet. Don't share it.
 * Customers can only (a) read your menu, pickup options and shop note and (b) submit an order request.
 * New order requests are emailed to the Gmail account that owns this sheet. If a customer gives an
 * email address, they get "we received your order", "confirmed" and "ready" emails (can be turned off in the app).
 */
const APP_KEY = '__APP_KEY__';
const SHEET_NAME = 'Events';
const COLS = 6; // seq | eventId | at | device | type | data (JSON)
const SHOP_NAME = 'Flour and Flame Bakery';

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
  if (p.action === 'menu') { const s = state_(); return json_({ ok: true, app: 'flour-and-flame', menu: menu_(s), pickups: pickups_(s), shop: { open: s.shop.open, note: s.shop.note || '' } }); }
  if (p.action === 'ping') return json_({ ok: true, app: 'flour-and-flame', version: __VERSION__, authorized: p.key === APP_KEY });
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

function rows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  return last <= 1 ? [] : sh.getRange(2, 1, last - 1, COLS).getValues();
}

function pull_(since) {
  const rows = rows_();
  if (!rows.length) return { events: [], last: 0 };
  const events = [];
  for (const r of rows) {
    if (Number(r[0]) > since) {
      try { const ev = JSON.parse(String(r[5])); ev.seq = Number(r[0]); events.push(ev); } catch (err) { /* skip damaged row */ }
    }
  }
  return { events: events, last: Number(rows[rows.length - 1][0]) || 0 };
}

// Latest products, pickup options, shop settings and orders, replayed from the event list.
function state_() {
  const s = { products: {}, pickups: {}, shop: { open: true, note: '', emailCustomers: true }, orders: {} };
  for (const r of rows_()) {
    const type = String(r[4]);
    if (['product.upsert', 'pickup.upsert', 'shop.settings', 'order.create', 'order.update', 'order.status'].indexOf(type) < 0) continue;
    let ev; try { ev = JSON.parse(String(r[5])); } catch (err) { continue; }
    if (type === 'product.upsert' && ev.product) s.products[ev.product.productId] = ev.product;
    else if (type === 'pickup.upsert' && ev.pickup) s.pickups[ev.pickup.pickupId] = ev.pickup;
    else if (type === 'shop.settings' && ev.settings) s.shop = Object.assign({ open: true, note: '', emailCustomers: true }, ev.settings);
    else if (type === 'order.create' && !s.orders[ev.orderId]) s.orders[ev.orderId] = ev;
    else if (type === 'order.update' && s.orders[ev.orderId]) s.orders[ev.orderId] = Object.assign({}, s.orders[ev.orderId], ev.patch || {});
    else if (type === 'order.status' && s.orders[ev.orderId]) s.orders[ev.orderId].status = ev.status;
  }
  return s;
}
function menu_(s) {
  return Object.keys(s.products).map(function (k) { return s.products[k]; }).filter(function (p) { return p.active; })
    .map(function (p) { return { productId: p.productId, name: p.name, recipeTitle: p.recipeTitle, pieces: p.pieces, price: p.price }; })
    .sort(function (a, b) { return (a.recipeTitle + a.pieces).localeCompare(b.recipeTitle + b.pieces); });
}
function pickups_(s) {
  return Object.keys(s.pickups).map(function (k) { return s.pickups[k]; }).filter(function (p) { return p.active; })
    .map(function (p) { return { pickupId: p.pickupId, name: p.name, details: p.details || '' }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function push_(events, since) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  const added = [];
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
      added.push(copy);
    }
    if (rows.length) sh.getRange(last + 1, 1, rows.length, COLS).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  try { notifyCustomers_(added); } catch (err) { /* emails are best-effort */ }
  return Object.assign({ accepted: added.length }, pull_(since));
}

// ---------- customer emails ----------
function isEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function lines_(items) { return (items || []).map(function (i) { return '  ' + i.qty + ' × ' + i.name; }).join('\n'); }
function pickupText_(o, s) {
  const p = o.pickupId && s.pickups[o.pickupId];
  return (p ? 'Pickup: ' + p.name + (p.details ? ' (' + p.details + ')' : '') : (o.pickupGroup ? 'Pickup: ' + o.pickupGroup : '')) + (o.pickupDate ? '\nDate: ' + o.pickupDate : '');
}
function notifyCustomers_(added) {
  const statusEvents = added.filter(function (e) { return e.type === 'order.status' && (e.status === 'confirmed' || e.status === 'ready'); });
  if (!statusEvents.length) return;
  const s = state_();
  if (!s.shop.emailCustomers) return;
  const props = PropertiesService.getScriptProperties();
  for (const ev of statusEvents) {
    const o = s.orders[ev.orderId];
    if (!o || !isEmail_(o.customer && o.customer.contact)) continue;
    const mark = 'mailed-' + ev.status + '-' + ev.orderId;
    if (props.getProperty(mark)) continue; // each email once per order
    props.setProperty(mark, '1');
    const no = '#' + (o.orderNo || String(o.orderId).slice(0, 4).toUpperCase());
    const first = String(o.customer.name || '').split(' ')[0];
    if (ev.status === 'confirmed') {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': your order ' + no + ' is confirmed',
        'Hi ' + first + ',\n\nGood news: your order ' + no + ' is confirmed!\n\n' + lines_(o.items) + '\n\nTotal: $' + Number(o.total || 0).toFixed(2) +
        (pickupText_(o, s) ? '\n' + pickupText_(o, s) : '') + '\n\nThank you!\n' + SHOP_NAME, { name: SHOP_NAME });
    } else {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': order ' + no + ' is ready',
        'Hi ' + first + ',\n\nYour order ' + no + ' is baked and ready.' + (pickupText_(o, s) ? '\n' + pickupText_(o, s) : '') + '\n\nEnjoy!\n' + SHOP_NAME, { name: SHOP_NAME });
    }
  }
}

// ---------- public order request ----------
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function order_(b) {
  if (b.website) return { ok: true, orderNo: 0 }; // hidden spam trap field: pretend success
  const name = clean_(b.name, 80), contact = clean_(b.contact, 120), notes = clean_(b.notes, 500), pickupDate = clean_(b.pickupDate, 10);
  if (!name || !contact) return { ok: false, error: 'missing-contact' };
  const cache = CacheService.getScriptCache();
  const recent = Number(cache.get('orders-per-minute') || 0);
  if (recent >= 10) return { ok: false, error: 'busy' };
  cache.put('orders-per-minute', String(recent + 1), 60);
  const s = state_();
  if (!s.shop.open) return { ok: false, error: 'closed', note: s.shop.note || '' };
  const activePickups = pickups_(s);
  let pickup = null;
  if (activePickups.length) {
    pickup = s.pickups[b.pickupId];
    if (!pickup || !pickup.active) return { ok: false, error: 'choose-pickup' };
  }
  const items = [];
  for (const it of (b.items || []).slice(0, 20)) {
    const p = s.products[it && it.productId];
    const qty = Math.floor(Number(it && it.qty));
    if (!p || !p.active || !(qty >= 1 && qty <= 20)) continue;
    items.push({ productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty: qty, unitPrice: p.price });
  }
  if (!items.length) return { ok: false, error: 'empty-order' };
  const total = Math.round(items.reduce(function (t, i) { return t + i.qty * i.unitPrice; }, 0) * 100) / 100;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let seq, ev;
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    seq = (last > 1 ? Number(sh.getRange(last, 1).getValue()) || 0 : 0) + 1;
    ev = { type: 'order.create', eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'customer-form', orderId: Utilities.getUuid(), orderNo: seq,
      source: 'form', status: 'pending', customer: { name: name, contact: contact }, items: items, pickupDate: pickupDate || undefined,
      pickupId: pickup ? pickup.pickupId : undefined, pickupGroup: pickup ? pickup.name : undefined, notes: notes || undefined, total: total };
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
  } finally { lock.releaseLock(); }
  const pickupLine = pickupText_(ev, s);
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'New Flour and Flame order #' + seq + ' from ' + name,
      'New order request #' + seq + '\n\nFrom: ' + name + '\nContact: ' + contact + (pickupLine ? '\n' + pickupLine : '') +
      '\n\n' + lines_(items) + '\n\nTotal: $' + total.toFixed(2) + (notes ? '\n\nNotes: ' + notes : '') + '\n\nOpen the Flour and Flame app to confirm it.');
  } catch (err) { /* the order is saved even if email fails */ }
  if (s.shop.emailCustomers && isEmail_(contact)) {
    try {
      MailApp.sendEmail(contact, SHOP_NAME + ': we received your order #' + seq,
        'Hi ' + name.split(' ')[0] + ',\n\nThanks for your order request #' + seq + '!\n\n' + lines_(items) + '\n\nTotal: $' + total.toFixed(2) + (pickupLine ? '\n' + pickupLine : '') +
        '\n\nIt isn’t confirmed yet. You’ll get another email when it is.\n\n' + SHOP_NAME, { name: SHOP_NAME });
    } catch (err) { /* best-effort */ }
  }
  return { ok: true, orderNo: seq, total: total };
}
