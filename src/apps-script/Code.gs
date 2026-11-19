/**
 * Flour and Flame Bakery: shared bakery sheet (script version __VERSION__)
 * Paste this whole file into Extensions → Apps Script of your private Google Sheet,
 * then Deploy (Web app · Execute as: Me · Who has access: Anyone).
 * The key below is your private password between the app and this sheet. Don't share it.
 * Customers can only (a) read your menu, pickup options and shop note and (b) submit an order request (an email address is required).
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
  if (p.action === 'menu') {
    const s = state_();
    const lim = s.shop.limit && s.shop.limit.pieces > 0 ? { pieces: s.shop.limit.pieces, per: s.shop.limit.per === 'week' ? 'week' : 'day' } : null;
    return json_({ ok: true, app: 'flour-and-flame', menu: menu_(s), pickups: pickups_(s), shop: { open: s.shop.open, note: s.shop.note || '', holiday: !!s.shop.holiday, limit: lim }, booked: lim ? booked_(s, lim.per) : {} });
  }
  if (p.action === 'feedbackInfo') return json_(feedbackInfo_(String(p.o || ''), String(p.t || '')));
  if (p.action === 'ping') return json_({ ok: true, app: 'flour-and-flame', version: __VERSION__, authorized: p.key === APP_KEY });
  if (p.key !== APP_KEY) return json_({ ok: false, error: 'bad-key' });
  if (p.action === 'pull') return json_(Object.assign({ ok: true }, pull_(Number(p.since || 0))));
  return json_({ ok: false, error: 'unknown-action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad-json' }); }
  if (body && body.action === 'order') return json_(order_(body)); // public: customer order request
  if (body && body.action === 'feedback') return json_(feedback_(body)); // public, but only with the signed link from the feedback email
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
  const s = { products: {}, pickups: {}, shop: { open: true, note: '', emailCustomers: true }, orders: {}, looks: {}, feedback: {} };
  for (const r of rows_()) {
    const type = String(r[4]);
    if (['product.upsert', 'pickup.upsert', 'shop.settings', 'order.create', 'order.update', 'order.status', 'menu.look', 'feedback'].indexOf(type) < 0) continue;
    let ev; try { ev = JSON.parse(String(r[5])); } catch (err) { continue; }
    if (type === 'product.upsert' && ev.product) s.products[ev.product.productId] = ev.product;
    else if (type === 'menu.look' && ev.look) s.looks[ev.look.recipeId] = ev.look;
    else if (type === 'feedback') s.feedback[ev.orderId] = true;
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
    .map(function (p) {
      const m = { productId: p.productId, name: p.name, recipeTitle: p.recipeTitle, pieces: p.pieces, price: p.price, kind: p.kind || 'single' };
      if (p.sizeLabel) m.sizeLabel = p.sizeLabel;
      if (p.kind === 'mixed') { m.step = p.step || 1; m.options = (p.options || []).map(function (o) { const x = { recipeId: o.recipeId, recipeTitle: o.recipeTitle }; const lk = look_(s, o.recipeId); if (lk) x.look = lk; return x; }); }
      else { const lk = look_(s, p.recipeId); if (lk) m.look = lk; }
      return m;
    })
    .sort(function (a, b) { return (a.recipeTitle + ('000' + a.pieces).slice(-3)).localeCompare(b.recipeTitle + ('000' + b.pieces).slice(-3)); });
}
function look_(s, recipeId) {
  const l = s.looks[recipeId];
  if (!l) return null;
  const out = { art: l.art };
  if (l.photo) { out.photo = l.photo; out.illustration = l.illustrationLabel !== false; }
  if (l.blurb) out.blurb = String(l.blurb).slice(0, 200);
  return out;
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
function lines_(items) { return (items || []).map(function (i) { return '  ' + i.qty + ' × ' + i.name + (i.mix && i.mix.length ? ' (' + i.mix.map(function (m) { return m.count + ' ' + m.recipeTitle; }).join(', ') + ')' : ''); }).join('\n'); }
function pickupText_(o, s) {
  const p = o.pickupId && s.pickups[o.pickupId];
  return (p ? 'Pickup: ' + p.name + (p.details ? ' (' + p.details + ')' : '') : (o.pickupGroup ? 'Pickup: ' + o.pickupGroup : '')) + (o.pickupDate ? '\nDate: ' + o.pickupDate : '');
}
function notifyCustomers_(added) {
  const statusEvents = added.filter(function (e) { return e.type === 'order.status' && (e.status === 'confirmed' || e.status === 'ready' || (e.status === 'completed' && /^https:\/\//.test(String(e.feedbackLink || '')))); });
  if (!statusEvents.length) return;
  const s = state_();
  if (!s.shop.emailCustomers) return;
  const askFeedback = s.shop.askFeedback !== false;
  const props = PropertiesService.getScriptProperties();
  for (const ev of statusEvents) {
    const o = s.orders[ev.orderId];
    if (!o || !isEmail_(o.customer && o.customer.contact)) continue;
    if (ev.status === 'completed' && (!askFeedback || s.feedback[ev.orderId])) continue;
    const mark = 'mailed-' + (ev.status === 'completed' ? 'feedback' : ev.status) + '-' + ev.orderId;
    if (props.getProperty(mark)) continue; // each email once per order
    props.setProperty(mark, '1');
    const no = '#' + (o.orderNo || String(o.orderId).slice(0, 4).toUpperCase());
    const first = String(o.customer.name || '').split(' ')[0];
    if (ev.status === 'confirmed') {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': your order ' + no + ' is confirmed',
        'Hi ' + first + ',\n\nGood news: your order ' + no + ' is confirmed!\n\n' + lines_(o.items) + '\n\nTotal: $' + Number(o.total || 0).toFixed(2) +
        (pickupText_(o, s) ? '\n' + pickupText_(o, s) : '') + '\n\nThank you!\n' + SHOP_NAME, { name: SHOP_NAME });
    } else if (ev.status === 'completed') {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': how were they? 🍪',
        'Hi ' + first + ',\n\nThank you for picking up your order' + (o.sample ? ' (your tasting box!)' : '') + '. Once you’ve tried them, we’d love to know what you thought. It takes less than a minute:\n\n' + ev.feedbackLink +
        '\n\nYour honest opinion helps decide which flavours stay on the menu.\n\nThank you!\n' + SHOP_NAME, { name: SHOP_NAME });
    } else {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': order ' + no + ' is ready',
        'Hi ' + first + ',\n\nYour order ' + no + ' is baked and ready.' + (pickupText_(o, s) ? '\n' + pickupText_(o, s) : '') + '\n\nEnjoy!\n' + SHOP_NAME, { name: SHOP_NAME });
    }
  }
}

// ---------- feedback ----------
function sign_(value) {
  const b = Utilities.computeHmacSha256Signature(String(value), APP_KEY, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 32);
}
function flavours_(o) {
  const seen = {}, out = [];
  (o.items || []).forEach(function (i) {
    const parts = i.mix && i.mix.length ? i.mix : [{ recipeId: i.recipeId, recipeTitle: i.recipeTitle }];
    parts.forEach(function (m) { if (!seen[m.recipeId]) { seen[m.recipeId] = 1; out.push({ recipeId: m.recipeId, recipeTitle: m.recipeTitle }); } });
  });
  return out;
}
function feedbackInfo_(orderId, token) {
  if (!orderId || token !== sign_(orderId)) return { ok: false, error: 'bad-link' };
  const s = state_(), o = s.orders[orderId];
  if (!o) return { ok: false, error: 'bad-link' };
  return { ok: true, name: String(o.customer && o.customer.name || '').split(' ')[0], done: !!s.feedback[orderId],
    flavours: flavours_(o).map(function (f) { const lk = look_(s, f.recipeId); return lk ? { recipeId: f.recipeId, recipeTitle: f.recipeTitle, look: lk } : f; }) };
}
function feedback_(b) {
  const orderId = String(b.orderId || '');
  if (!orderId || b.token !== sign_(orderId)) return { ok: false, error: 'bad-link' };
  const s = state_(), o = s.orders[orderId];
  if (!o) return { ok: false, error: 'bad-link' };
  const allowed = {}; flavours_(o).forEach(function (f) { allowed[f.recipeId] = 1; });
  const ratings = {};
  Object.keys(b.ratings || {}).forEach(function (k) { const n = Math.round(Number(b.ratings[k])); if (allowed[k] && n >= 1 && n <= 5) ratings[k] = n; });
  const again = ['yes', 'maybe', 'no'].indexOf(b.again) >= 0 ? b.again : undefined;
  const comment = clean_(b.comment, 600);
  if (!Object.keys(ratings).length && !again && !comment) return { ok: false, error: 'empty' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(), last = sh.getLastRow();
    const seq = (last > 1 ? Number(sh.getRange(last, 1).getValue()) || 0 : 0) + 1;
    const ev = { type: 'feedback', eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'customer-feedback', orderId: orderId, ratings: ratings, again: again, comment: comment || undefined };
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

// ---------- optional order limit ----------
function weekKey_(day) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
function piecesOf_(items) { return (items || []).reduce(function (t, i) { return t + (Number(i.pieces) || 0) * (Number(i.qty) || 0); }, 0); }
function booked_(s, per) {
  const out = {}, from = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
  Object.keys(s.orders).forEach(function (k) {
    const o = s.orders[k];
    if (o.status === 'cancelled' || !o.pickupDate || o.pickupDate < from) return;
    const key = per === 'week' ? weekKey_(o.pickupDate) : o.pickupDate;
    out[key] = (out[key] || 0) + piecesOf_(o.items);
  });
  return out;
}

// ---------- public order request ----------
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function order_(b) {
  if (b.website) return { ok: true, orderNo: 0 }; // hidden spam trap field: pretend success
  const name = clean_(b.name, 80), contact = clean_(b.contact, 120), notes = clean_(b.notes, 500), pickupDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.pickupDate || '')) ? String(b.pickupDate) : '', heardFrom = clean_(b.heardFrom, 40);
  if (!name || !contact) return { ok: false, error: 'missing-contact' };
  if (!isEmail_(contact)) return { ok: false, error: 'need-email' };
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
    if (p.kind === 'mixed') {
      const step = p.step || 1, mix = [];
      let sum = 0, bad = false;
      for (const m of (it.mix || []).slice(0, 20)) {
        const o = (p.options || []).filter(function (x) { return x.recipeId === (m && m.recipeId); })[0];
        const n = Math.floor(Number(m && m.count));
        if (!o || !(n >= 1) || n % step !== 0) { bad = true; break; }
        const part = { recipeId: o.recipeId, recipeTitle: o.recipeTitle, count: n };
        if (o.dough === false) part.dough = false;
        mix.push(part); sum += n;
      }
      if (bad || sum !== p.pieces) return { ok: false, error: 'bad-mix' };
      items.push({ productId: p.productId, name: p.name, recipeId: 'mixed', recipeTitle: p.name, pieces: p.pieces, qty: qty, unitPrice: p.price, mix: mix });
      continue;
    }
    items.push({ productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty: qty, unitPrice: p.price, dough: p.dough !== false });
  }
  if (!items.length) return { ok: false, error: 'empty-order' };
  const total = Math.round(items.reduce(function (t, i) { return t + i.qty * i.unitPrice; }, 0) * 100) / 100;
  const lim = s.shop.limit && s.shop.limit.pieces > 0 ? s.shop.limit : null;
  if (lim) {
    if (!pickupDate) return { ok: false, error: 'need-date' };
    const per = lim.per === 'week' ? 'week' : 'day', key = per === 'week' ? weekKey_(pickupDate) : pickupDate;
    const already = booked_(s, per)[key] || 0, want = piecesOf_(items);
    if (already + want > lim.pieces) return { ok: false, error: 'full', left: Math.max(0, lim.pieces - already), per: per };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let seq, ev;
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    seq = (last > 1 ? Number(sh.getRange(last, 1).getValue()) || 0 : 0) + 1;
    ev = { type: 'order.create', eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'customer-form', orderId: Utilities.getUuid(), orderNo: seq,
      source: 'form', status: 'pending', customer: { name: name, contact: contact }, items: items, pickupDate: pickupDate || undefined,
      pickupId: pickup ? pickup.pickupId : undefined, pickupGroup: pickup ? pickup.name : undefined, notes: notes || undefined, heardFrom: heardFrom || undefined, total: total };
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
  } finally { lock.releaseLock(); }
  const pickupLine = pickupText_(ev, s);
  try {
    const short = items.map(function (i) { return i.qty + ' ' + String(i.name).replace(/^(Half dozen|Dozen|Box of \d+|[^:]{1,20}): /, function (m, size) { return size + ' '; }); }).join(', ');
    const subject = '🍪 New order #' + seq + ' · ' + name + ' · ' + (short.length > 70 ? short.slice(0, 67) + '…' : short) + ' · $' + total.toFixed(2);
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject,
      (pickupLine ? pickupLine.split('\n')[0] + ' · ' : '') + 'Total $' + total.toFixed(2) + '\n\nNew order request #' + seq + '\n\nFrom: ' + name + '\nContact: ' + contact + (pickupLine ? '\n' + pickupLine : '') +
      '\n\n' + lines_(items) + '\n\nTotal: $' + total.toFixed(2) + (notes ? '\n\nNotes: ' + notes : '') + (heardFrom ? '\nHeard about us: ' + heardFrom : '') + '\n\nOpen the Flour and Flame app to confirm it.');
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
