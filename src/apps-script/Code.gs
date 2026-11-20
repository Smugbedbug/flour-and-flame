/**
 * Flour and Flame Bakery: shared bakery sheet (script version __VERSION__)
 * Paste this whole file into Extensions → Apps Script of your private Google Sheet,
 * then Deploy (Web app · Execute as: Me · Who has access: Anyone).
 * The key below is your private password between the app and this sheet. Don't share it.
 * Customers can only (a) read your menu, pickup options and shop note and (b) submit an order request (an email address is required).
 * New order requests are emailed to the Gmail account that owns this sheet. If a customer gives an
 * email address, they get "we received your order", "confirmed", "ready" and "how were they?" emails. All emails can be paused in the app (Testing mode).
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
  try { weeklyMaybe_(); } catch (err) { /* best-effort */ }
  const p = (e && e.parameter) || {};
  if (p.action === 'menu') {
    const s = state_();
    const lim = s.shop.limit && s.shop.limit.pieces > 0 ? { pieces: s.shop.limit.pieces, per: s.shop.limit.per === 'week' ? 'week' : 'day' } : null;
    return json_({ ok: true, app: 'flour-and-flame', menu: menu_(s), flavours: flavourList_(s), pickups: pickups_(s), shop: { open: s.shop.open, note: s.shop.note || '', holiday: !!s.shop.holiday, limit: lim, payment: payPublic_(s.shop.payment, s.shop), town: s.shop.town ? String(s.shop.town).slice(0, 60) : '', payFirst: !!s.shop.address, loyalty: loyaltyOn_(s.shop) ? { every: loyaltyEvery_(s.shop) } : null, featured: featured_(s.shop) }, soon: soon_(s), booked: lim ? booked_(s, lim.per) : {} });
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
  try { weeklyMaybe_(); } catch (err) { /* best-effort */ }
  if (body && body.action === 'order') return json_(order_(body)); // public: customer order request
  if (body && body.action === 'feedback') return json_(feedback_(body)); // public, but only with the signed link from the feedback email
  if (body && body.action === 'unsubscribe') return json_(unsubscribe_(body)); // public, signed link from announcement emails
  if (body && body.action === 'review') return json_(review_(body)); // public: "leave a review" from the tuck-in card
  if (!body || body.key !== APP_KEY) return json_({ ok: false, error: 'bad-key' });
  if (body.action === 'ntfyTest') return json_(ntfyTest_());
  if (body.action === 'weeklyPreview') return json_(weeklyPreview_());
  if (body.action === 'testOrder') return json_(order_(body, true)); // owner only (needs the key): a pretend order to try the alerts
  if (body.action === 'push') return json_(Object.assign({ ok: true }, push_(body.events || [], Number(body.since || 0))));
  return json_({ ok: false, error: 'unknown-action' });
}

function rows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  return last <= 1 ? [] : sh.getRange(2, 1, last - 1, COLS).getValues();
}

/** The highest event number in the sheet (not just the last row's), so new events always get a higher one. */
function maxSeq_(sh, last) {
  if (last <= 1) return 0;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  let m = 0;
  for (let i = 0; i < vals.length; i++) { const n = Number(vals[i][0]) || 0; if (n > m) m = n; }
  return m;
}

function pull_(since) {
  const rows = rows_();
  if (!rows.length) return { events: [], last: 0, version: __VERSION__ };
  const events = [];
  for (const r of rows) {
    if (Number(r[0]) > since) {
      try { const ev = JSON.parse(String(r[5])); ev.seq = Number(r[0]); events.push(ev); } catch (err) { /* skip damaged row */ }
    }
  }
  return { events: events, last: Number(rows[rows.length - 1][0]) || 0, version: __VERSION__ };
}

// Latest products, pickup options, shop settings and orders, replayed from the event list.
function state_() {
  const s = { products: {}, pickups: {}, shop: { open: true, note: '', emailCustomers: true }, orders: {}, looks: {}, feedback: {}, unsub: {}, ratings: [], loyal: [] };
  const deleted = {};
  for (const r of rows_()) {
    const type = String(r[4]);
    if (['product.upsert', 'pickup.upsert', 'shop.settings', 'order.create', 'order.update', 'order.status', 'menu.look', 'feedback', 'order.delete', 'news.unsub', 'order.payment', 'review', 'loyalty.earned'].indexOf(type) < 0) continue;
    let ev; try { ev = JSON.parse(String(r[5])); } catch (err) { continue; }
    if (type === 'feedback' || type === 'review') s.ratings.push({ at: ev.at, ratings: ev.ratings || {}, comment: ev.comment || '', name: type === 'review' ? (ev.name || 'a card') : '' });
    if (type === 'loyalty.earned') s.loyal.push(ev.at);
    if (type === 'order.delete') (ev.orderIds || []).forEach(function (id) { deleted[id] = true; });
    if (type === 'product.upsert' && ev.product) s.products[ev.product.productId] = ev.product;
    else if (type === 'menu.look' && ev.look) s.looks[ev.look.recipeId] = ev.look;
    else if (type === 'feedback') s.feedback[ev.orderId] = true;
    else if (type === 'order.delete') (ev.orderIds || []).forEach(function (id) { delete s.orders[id]; });
    else if (type === 'order.payment' && s.orders[ev.orderId]) s.orders[ev.orderId].paid = !!ev.paid;
    else if (type === 'news.unsub' && ev.email) s.unsub[String(ev.email).toLowerCase()] = true;
    else if (type === 'pickup.upsert' && ev.pickup) s.pickups[ev.pickup.pickupId] = ev.pickup;
    else if (type === 'shop.settings' && ev.settings) s.shop = Object.assign({ open: true, note: '', emailCustomers: true }, ev.settings);
    else if (type === 'order.create' && !s.orders[ev.orderId]) s.orders[ev.orderId] = ev;
    else if (type === 'order.update' && s.orders[ev.orderId]) s.orders[ev.orderId] = Object.assign({}, s.orders[ev.orderId], ev.patch || {});
    else if (type === 'order.status' && s.orders[ev.orderId]) { s.orders[ev.orderId].status = ev.status; if (ev.status === 'completed') s.orders[ev.orderId].doneAt = ev.at; }
  }
  Object.keys(deleted).forEach(function (id) { delete s.orders[id]; }); // a deleted order stays deleted, whatever the order of the rows
  return s;
}
function menu_(s) {
  const today = today_();
  return Object.keys(s.products).map(function (k) { return s.products[k]; }).filter(function (p) { return p.active && inWindow_(p, today); })
    .map(function (p) {
      const m = { productId: p.productId, name: p.name, recipeTitle: p.recipeTitle, pieces: p.pieces, price: p.price, kind: p.kind || 'single' };
      if (p.sizeLabel) m.sizeLabel = p.sizeLabel;
      if (p.category) m.category = p.category;
      if (p.from) m.from = p.from;
      if (p.to) m.to = p.to;
      if (p.feature) m.feature = p.feature;
      if (p.kind === 'mixed') { m.step = p.step || 1; m.options = (p.options || []).map(function (o) { const x = { recipeId: o.recipeId, recipeTitle: o.recipeTitle }; const lk = look_(s, o.recipeId); if (lk) x.look = lk; return x; }); }
      else { const lk = look_(s, p.recipeId); if (lk) m.look = lk; }
      return m;
    })
    .sort(function (a, b) { return (a.recipeTitle + ('000' + a.pieces).slice(-3)).localeCompare(b.recipeTitle + ('000' + b.pieces).slice(-3)); });
}
/** Today's date (YYYY-MM-DD) where the bakery is. */
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Chicago', 'yyyy-MM-dd'); }
function inWindow_(p, today) { return (!p.from || p.from <= today) && (!p.to || p.to >= today); }
/** Flavours starting within the next 45 days, one per recipe: the order form shows them as "coming soon". */
function soon_(s) {
  const today = today_(), limit = Utilities.formatDate(new Date(Date.now() + 45 * 86400000), Session.getScriptTimeZone() || 'America/Chicago', 'yyyy-MM-dd');
  const seen = {}, out = [];
  Object.keys(s.products).map(function (k) { return s.products[k]; })
    .filter(function (p) { return p.active && p.kind !== 'mixed' && p.from && p.from > today && p.from <= limit; })
    .sort(function (a, b) { return a.from.localeCompare(b.from); })
    .forEach(function (p) {
      if (seen[p.recipeId]) return; seen[p.recipeId] = 1;
      const x = { recipeTitle: p.recipeTitle, from: p.from, to: p.to || '', feature: p.feature || 'dates', category: p.category || '' };
      const lk = look_(s, p.recipeId); if (lk) x.look = lk;
      out.push(x);
    });
  return out;
}
function look_(s, recipeId) {
  const l = s.looks[recipeId];
  if (!l) return null;
  const out = { art: l.art };
  if (l.photo) { out.photo = l.photo; out.illustration = l.illustrationLabel !== false; }
  if (l.blurb) out.blurb = String(l.blurb).slice(0, 200);
  if (l.contains) out.contains = String(l.contains).slice(0, 200);
  return out;
}
function flavourList_(s) {
  const seen = {}, out = [];
  Object.keys(s.products).forEach(function (k) {
    const p = s.products[k];
    if (!p.active) return;
    const list = p.kind === 'mixed' ? (p.options || []) : [{ recipeId: p.recipeId, recipeTitle: p.recipeTitle }];
    list.forEach(function (o) { if (!seen[o.recipeId]) { seen[o.recipeId] = 1; const f = { recipeId: o.recipeId, recipeTitle: o.recipeTitle }; const lk = look_(s, o.recipeId); if (lk) f.look = lk; out.push(f); } });
  });
  return out.sort(function (a, b) { return a.recipeTitle.localeCompare(b.recipeTitle); });
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
    let seq = maxSeq_(sh, last);
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
    SpreadsheetApp.flush(); // make the rows real before the next request may write (otherwise it can overwrite them)
  } finally {
    lock.releaseLock();
  }
  try { notifyCustomers_(added); } catch (err) { /* emails are best-effort */ }
  try { sendNews_(added); } catch (err) { /* best-effort */ }
  try { loyaltyEmails_(added); } catch (err) { /* best-effort */ }
  try { addressEmails_(added); } catch (err) { /* best-effort */ }
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
  if (!s.shop.emailCustomers || s.shop.emailsPaused) return;
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
        (pickupText_(o, s) ? '\n' + pickupText_(o, s) : '') + (Number(o.total) > 0 && !o.paid ? '\n\n' + payText_(s.shop.payment, Number(o.total), no, s.shop) : '') +
        (s.shop.address && !isPaid_(o) ? '\n\n📍 Pickup is ' + (s.shop.town ? 'in ' + s.shop.town : 'at our home') + '. We’ll email you the exact address as soon as your payment comes in.' : '') + '\n\nThank you!\n' + SHOP_NAME, { name: SHOP_NAME });
    } else if (ev.status === 'completed') {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': how were they? 🍪',
        'Hi ' + first + ',\n\nThank you for picking up your order' + (o.sample ? ' (your tasting box!)' : '') + '. Once you’ve tried them, we’d love to know what you thought. It takes less than a minute:\n\n' + ev.feedbackLink +
        '\n\nYour honest opinion helps decide which flavours stay on the menu.' + again_(ev) + '\n\nThank you!\n' + SHOP_NAME, { name: SHOP_NAME });
    } else {
      MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': order ' + no + ' is ready',
        'Hi ' + first + ',\n\nYour order ' + no + ' is baked and ready.' + (pickupText_(o, s) ? '\n' + pickupText_(o, s) : '') + (Number(o.total) > 0 && !o.paid ? '\n\n' + payText_(s.shop.payment, Number(o.total), no, s.shop) : '') + (o.sample || o.test ? '' : loyaltyLine_(s, o.customer.contact, 1, '')) + '\n\nEnjoy!' + again_(ev) + '\n' + SHOP_NAME, { name: SHOP_NAME });
    }
  }
}

// ---------- loyalty: a free half dozen after every N picked-up orders ----------
function loyaltyOn_(shop) { return !(shop.loyalty && shop.loyalty.off); }
function loyaltyEvery_(shop) { return Math.min(20, Math.max(2, Math.round(Number(shop.loyalty && shop.loyalty.every) || 5))); }
function loyaltyStats_(s, email) {
  const e = String(email || '').trim().toLowerCase(), every = loyaltyEvery_(s.shop);
  let done = 0, used = 0;
  if (isEmail_(e)) Object.keys(s.orders).forEach(function (k) {
    const o = s.orders[k];
    if (o.test || o.sample || String(o.customer && o.customer.contact || '').trim().toLowerCase() !== e) return;
    if (o.status === 'completed') done++;
    if (o.reward && o.status !== 'cancelled') used++;
  });
  const earned = Math.floor(done / every);
  return { done: done, every: every, available: Math.max(0, earned - used), toNext: every - (done % every) };
}
/** A line for customer emails. `extra` = 1 when this order's pickup is about to count (the ready email). */
function loyaltyLine_(s, email, extra, ask) {
  if (!loyaltyOn_(s.shop) || !isEmail_(email)) return '';
  const st = loyaltyStats_(s, email), after = st.done + extra, n = after % st.every;
  let line;
  if (ask === 'none') line = 'You asked to use a free half dozen, but we couldn’t find one for this email yet.';
  else if (ask === 'need-half') line = 'You have a free half dozen! Add a half dozen to an order and tick “Use my free half dozen” to get it free.';
  else if (extra && n === 0) line = '🎁 Picking this up earns you a FREE half dozen! We’ll email you when it’s ready to use.';
  else if (st.available > 0 && !extra) line = 'You have ' + st.available + ' free half dozen' + (st.available > 1 ? 's' : '') + ' to use on a future order.';
  else line = (extra ? 'After this pickup: ' : 'Loyalty: ') + n + ' of ' + st.every + ' orders toward a free half dozen' + (st.every - n === 1 ? ' (just one more!)' : '') + '.';
  return '\n\n🍪 ' + line + '\n(Use this same email for every order so they all count.)';
}
function loyaltyEmails_(added) {
  const picked = added.filter(function (e) { return e.type === 'order.status' && e.status === 'completed'; });
  if (!picked.length) return;
  const s = state_();
  if (!loyaltyOn_(s.shop) || !s.shop.emailCustomers || s.shop.emailsPaused) return;
  const props = PropertiesService.getScriptProperties();
  for (const ev of picked) {
    const o = s.orders[ev.orderId];
    if (!o || o.test || o.sample || o.status !== 'completed' || !isEmail_(o.customer && o.customer.contact)) continue;
    const st = loyaltyStats_(s, o.customer.contact);
    if (st.done === 0 || st.done % st.every !== 0 || props.getProperty('loyal-' + ev.orderId)) continue;
    props.setProperty('loyal-' + ev.orderId, '1');
    const first = String(o.customer.name || '').split(' ')[0];
    MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': your next half dozen is on us! 🎁',
      'Hi ' + first + ',\n\nThat was order number ' + st.done + ' with us. Thank you! As a thank-you, your next half dozen is FREE.\n\nNext time you order, add a half dozen and tick “🎁 Use my free half dozen”. Use this same email (' + o.customer.contact + ') so we can find it.' +
      '\n\nThen it starts again: every ' + st.every + ' orders earns another free half dozen.\n\nSee you soon!\n' + SHOP_NAME, { name: SHOP_NAME });
    appendEvent_({ type: 'loyalty.earned', orderId: ev.orderId, email: String(o.customer.contact).toLowerCase(), count: st.done });
  }
}

// ---------- private pickup address: emailed once an order is confirmed AND paid ----------
function isPaid_(o) { return !!o.paid || !(Number(o.total) > 0); }
function addressEmails_(added) {
  const touched = added.filter(function (e) { return (e.type === 'order.status' && ['confirmed', 'preparing', 'ready'].indexOf(e.status) >= 0) || (e.type === 'order.payment' && e.paid); });
  if (!touched.length) return;
  const s = state_();
  const address = String(s.shop.address || '').trim();
  if (!address || !s.shop.emailCustomers || s.shop.emailsPaused) return;
  const props = PropertiesService.getScriptProperties();
  for (const ev of touched) {
    const o = s.orders[ev.orderId];
    if (!o || o.test || !isPaid_(o) || ['confirmed', 'preparing', 'ready'].indexOf(o.status) < 0 || !isEmail_(o.customer && o.customer.contact)) continue;
    if (props.getProperty('mailed-address-' + ev.orderId)) continue;
    props.setProperty('mailed-address-' + ev.orderId, '1');
    const no = '#' + (o.orderNo || String(o.orderId).slice(0, 4).toUpperCase());
    const first = String(o.customer.name || '').split(' ')[0];
    MailApp.sendEmail(o.customer.contact, SHOP_NAME + ': pickup address for order ' + no + ' 📍',
      'Hi ' + first + ',\n\nYou’re all set: order ' + no + ' is confirmed' + (Number(o.total) > 0 ? ' and paid' : '') + '. Thank you!\n\n📍 Pickup address:\n' + address.slice(0, 300) +
      (pickupText_(o, s) ? '\n\n' + pickupText_(o, s) : '') + '\n\nYou’ll get another email when your order is baked and ready.\n\n' + SHOP_NAME, { name: SHOP_NAME });
    appendEvent_({ type: 'order.addressSent', orderId: ev.orderId });
  }
}

// ---------- reviews you chose to show on the order form ----------
function featured_(shop) {
  return (Array.isArray(shop.featured) ? shop.featured : []).slice(0, 3).map(function (f) {
    return { text: String(f.text || '').slice(0, 280), name: String(f.name || '').replace(/\s*\(card\)$/, '').split(' ')[0].slice(0, 30), stars: Math.max(0, Math.min(5, Math.round(Number(f.stars) || 0))) };
  }).filter(function (f) { return f.text; });
}

// ---------- weekly summary email (Sunday evening; sent by the first request after 6 PM Sunday, up to Tuesday) ----------
function weekWindow_(now) {
  const tz = Session.getScriptTimeZone() || 'America/Chicago';
  const dow = Number(Utilities.formatDate(now, tz, 'u')), hour = Number(Utilities.formatDate(now, tz, 'H'));
  const back = dow === 7 ? (hour >= 18 ? 0 : 7) : dow; // days since the last Sunday 6 PM
  const day = function (d) { return Utilities.formatDate(new Date(now.getTime() - d * 86400000), tz, 'yyyy-MM-dd'); };
  return { tz: tz, back: back, key: day(back), from: day(back + 6), to: day(back) };
}
function weeklyMaybe_() {
  const w = weekWindow_(new Date());
  if (w.back > 2) return; // too late for last week's; wait for this Sunday
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('weekly-' + w.key)) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return;
  try {
    if (props.getProperty('weekly-' + w.key)) return;
    props.setProperty('weekly-' + w.key, '1');
    const s = state_();
    if ((s.shop.weekly && s.shop.weekly.off) || s.shop.emailsPaused) return;
    sendWeekly_(s, w.from, w.to, w.tz);
  } finally { lock.releaseLock(); }
}
function weeklyPreview_() {
  const now = new Date(), tz = Session.getScriptTimeZone() || 'America/Chicago';
  const day = function (d) { return Utilities.formatDate(new Date(now.getTime() - d * 86400000), tz, 'yyyy-MM-dd'); };
  sendWeekly_(state_(), day(6), day(0), tz, true);
  return { ok: true };
}
/** Plain numbers for the week from..to (local dates, inclusive). */
function weeklyStats_(s, from, to, tz) {
  const local = function (iso) { return iso ? Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd') : ''; };
  const inWeek = function (iso) { const d = local(iso); return d >= from && d <= to; };
  const all = Object.keys(s.orders).map(function (k) { return s.orders[k]; }).filter(function (o) { return !o.test; });
  const real = all.filter(function (o) { return !o.sample && o.status !== 'cancelled'; });
  const placed = real.filter(function (o) { return inWeek(o.at); });
  const picked = real.filter(function (o) { return o.status === 'completed' && inWeek(o.doneAt); });
  const flavours = {};
  placed.forEach(function (o) { (o.items || []).forEach(function (i) {
    if (i.mix && i.mix.length) i.mix.forEach(function (m) { const t = (m.recipeTitle || ((s.products[i.productId] || {}).options || []).filter(function (x) { return x.recipeId === m.recipeId; }).map(function (x) { return x.recipeTitle; })[0] || m.recipeId); flavours[t] = (flavours[t] || 0) + m.count * i.qty; });
    else flavours[i.recipeTitle || i.name] = (flavours[i.recipeTitle || i.name] || 0) + (Number(i.pieces) || 0) * (Number(i.qty) || 0);
  }); });
  const best = Object.keys(flavours).sort(function (a, b) { return flavours[b] - flavours[a]; })[0];
  const firstSeen = {};
  real.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (o) { const k = String((o.customer && (o.customer.contact || o.customer.name)) || '').trim().toLowerCase(); if (k && !firstSeen[k]) firstSeen[k] = o.at; });
  const people = {};
  placed.forEach(function (o) { const k = String((o.customer && (o.customer.contact || o.customer.name)) || '').trim().toLowerCase(); if (k) people[k] = inWeek(firstSeen[k]) ? 'new' : 'back'; });
  const vals = Object.keys(people).map(function (k) { return people[k]; });
  const rated = s.ratings.filter(function (r) { return inWeek(r.at); });
  const stars = []; rated.forEach(function (r) { Object.keys(r.ratings).forEach(function (k) { stars.push(Number(r.ratings[k]) || 0); }); });
  const sum = function (list) { return Math.round(list.reduce(function (t, o) { return t + (Number(o.total) || 0); }, 0) * 100) / 100; };
  return {
    placed: placed.length, placedValue: sum(placed), picked: picked.length, sales: sum(picked),
    waiting: real.filter(function (o) { return o.status === 'pending'; }).length,
    upcoming: real.filter(function (o) { return ['confirmed', 'preparing', 'ready'].indexOf(o.status) >= 0; }).length,
    unpaid: real.filter(function (o) { return o.status === 'completed' && !o.paid && Number(o.total) > 0; }).length,
    best: best || '', bestCount: best ? flavours[best] : 0,
    newPeople: vals.filter(function (v) { return v === 'new'; }).length, returning: vals.filter(function (v) { return v === 'back'; }).length,
    tasting: all.filter(function (o) { return o.sample && inWeek(o.at); }).length,
    rewards: s.loyal.filter(inWeek).length, rewardsUsed: placed.filter(function (o) { return o.reward; }).length,
    reviews: rated.length, avgStars: stars.length ? Math.round(stars.reduce(function (a, b) { return a + b; }, 0) / stars.length * 10) / 10 : 0,
    comment: (rated.filter(function (r) { return r.comment; }).slice(-1)[0] || {}).comment || ''
  };
}
function sendWeekly_(s, from, to, tz, preview) {
  const st = weeklyStats_(s, from, to, tz);
  const nice = function (d) { return Utilities.formatDate(new Date(d + 'T12:00:00'), tz, 'EEE MMM d'); };
  const money = function (n) { return '$' + Number(n).toFixed(2); };
  const lines = [];
  lines.push((preview ? '(Sample) ' : '') + 'Your week at ' + SHOP_NAME + ': ' + nice(from) + ' – ' + nice(to));
  lines.push('');
  lines.push('🛍️ New orders: ' + st.placed + (st.placed ? ' (' + money(st.placedValue) + ')' : ''));
  lines.push('✅ Picked up: ' + st.picked + ' · sales ' + money(st.sales) + (st.unpaid ? ' (' + st.unpaid + ' still unpaid)' : ''));
  lines.push('⏳ Waiting for your answer: ' + st.waiting + ' · coming up: ' + st.upcoming);
  if (st.best) lines.push('🏆 Most ordered: ' + st.best + ' (' + st.bestCount + ' cookies)');
  if (st.newPeople || st.returning) lines.push('👋 Customers: ' + st.newPeople + ' new, ' + st.returning + ' returning');
  if (st.tasting) lines.push('🎁 Tasting boxes given: ' + st.tasting);
  if (st.rewards || st.rewardsUsed) lines.push('🍪 Loyalty: ' + st.rewards + ' free half dozen' + (st.rewards === 1 ? '' : 's') + ' earned, ' + st.rewardsUsed + ' used');
  if (st.reviews) lines.push('⭐ Reviews: ' + st.reviews + (st.avgStars ? ' · average ' + st.avgStars + ' stars' : '') + (st.comment ? '\n   “' + st.comment.slice(0, 200) + '”' : ''));
  if (!st.placed && !st.picked) lines.push('', 'A quiet week. A tasting box or a post with your order link can get things moving.');
  lines.push('', 'Open the Flour and Flame app for the details.');
  const subject = (preview ? '(Sample) ' : '') + '🍪 Your week: ' + st.placed + ' order' + (st.placed === 1 ? '' : 's') + ' · ' + money(st.sales) + ' picked up' + (st.best ? ' · top: ' + st.best : '');
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject.slice(0, 180), lines.join('\n'));
  return st;
}

// ---------- instant phone alerts through the free ntfy app (ntfy.sh) ----------
/** Sends a phone alert if one is set up. Returns ntfy's HTTP status, or 0 when alerts are off. */
function ntfy_(shop, title, message, tags, priority) {
  const n = shop.ntfy;
  if (!n || n.off || !/^[A-Za-z0-9_-]{12,64}$/.test(String(n.topic || ''))) return 0;
  const body = { topic: n.topic, title: String(title).slice(0, 120), message: String(message).slice(0, 900), tags: tags, priority: priority };
  if (shop.appUrl && /^https:\/\//.test(shop.appUrl)) body.click = String(shop.appUrl).split('#')[0].split('?')[0] + '?go=1#/orders';
  const res = UrlFetchApp.fetch('https://ntfy.sh/', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  return res.getResponseCode();
}
function ntfyTest_() {
  const s = state_();
  if (!s.shop.ntfy || !s.shop.ntfy.topic) return { ok: false, error: 'no-topic' };
  try {
    const code = ntfy_(Object.assign({}, s.shop, { ntfy: Object.assign({}, s.shop.ntfy, { off: false }) }), '🔔 Flour and Flame alerts are working', 'New orders will pop up here, even when the app is closed.', ['bell'], 4);
    return code >= 200 && code < 300 ? { ok: true } : { ok: false, error: 'ntfy-' + code };
  } catch (err) {
    return { ok: false, error: /permission|authoriz/i.test(String(err)) ? 'needs-permission' : 'failed', detail: String(err).slice(0, 200) };
  }
}
/** Run this once from the script editor (pick it in the list at the top, then ▶ Run) to allow phone alerts. */
function authorizeAlerts() {
  UrlFetchApp.fetch('https://ntfy.sh/', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ topic: 'flour-and-flame-setup-check', message: 'ok' }), muteHttpExceptions: true });
}

// ---------- payment, order again, announcements ----------
function payPublic_(p, shop) {
  p = p || {};
  const out = { cash: p.cash !== false && !(shop && shop.address) }; // with a private address, people pay ahead (no cash at pickup)
  ['venmo', 'cashapp', 'paypal', 'zelle', 'note'].forEach(function (k) { if (p[k]) out[k] = String(p[k]).slice(0, 120); });
  return out;
}
function payText_(p, amount, no, shop) {
  p = payPublic_(p, shop);
  const amt = amount.toFixed(2), note = encodeURIComponent(SHOP_NAME + ' order ' + no);
  const lines = [];
  if (p.venmo) lines.push('• Venmo: https://venmo.com/' + encodeURIComponent(String(p.venmo).replace(/^@/, '')) + '?txn=pay&amount=' + amt + '&note=' + note);
  if (p.cashapp) lines.push('• Cash App: https://cash.app/$' + encodeURIComponent(String(p.cashapp).replace(/^\$/, '')) + '/' + amt);
  if (p.paypal) lines.push('• PayPal: https://paypal.me/' + encodeURIComponent(String(p.paypal).replace(/^@/, '')) + '/' + amt);
  if (p.zelle) lines.push('• Zelle: ' + p.zelle);
  if (p.cash) lines.push('• Cash at pickup');
  return 'How to pay ($' + amt + '):\n' + (lines.length ? lines.join('\n') : '• At pickup') + (p.note ? '\n' + p.note : '');
}
function again_(ev) { return /^https:\/\//.test(String(ev.orderAgainLink || '')) ? '\n\nWant more? Order the same again in one tap:\n' + ev.orderAgainLink + '\n' : ''; }
function subscribers_(s) {
  const list = {};
  Object.keys(s.orders).forEach(function (k) {
    const o = s.orders[k], c = String(o.customer && o.customer.contact || '').trim();
    if (o.news && isEmail_(c) && !s.unsub[c.toLowerCase()]) list[c.toLowerCase()] = { email: c, name: String(o.customer.name || '').split(' ')[0] };
  });
  return Object.keys(list).map(function (k) { return list[k]; });
}
function sendNews_(added) {
  const sends = added.filter(function (e) { return e.type === 'news.send' && e.subject && e.body; });
  if (!sends.length) return;
  const s = state_();
  if (s.shop.emailsPaused) return;
  const props = PropertiesService.getScriptProperties();
  for (const ev of sends) {
    if (props.getProperty('news-' + ev.eventId)) continue;
    props.setProperty('news-' + ev.eventId, '1');
    const subs = subscribers_(s), max = 90;
    let count = 0;
    subs.slice(0, max).forEach(function (r) {
      const unsub = /^https:\/\//.test(String(ev.unsubBase || '')) ? '\n\n—\nDon’t want these emails? Unsubscribe: ' + ev.unsubBase + Utilities.base64EncodeWebSafe(r.email).replace(/=+$/, '') + '/' + sign_('unsub:' + r.email.toLowerCase()) : '';
      try {
        MailApp.sendEmail(r.email, clean_(ev.subject, 120), 'Hi ' + (r.name || 'there') + ',\n\n' + String(ev.body).slice(0, 4000) + (/^https:\/\//.test(String(ev.link || '')) ? '\n\nOrder here: ' + ev.link : '') + '\n\n' + SHOP_NAME + unsub, { name: SHOP_NAME });
        count++;
      } catch (err) { /* daily email limit reached or bad address */ }
    });
    appendEvent_({ type: 'news.sent', sendId: ev.eventId, count: count, skipped: Math.max(0, subs.length - count) });
  }
}
function unsubscribe_(b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!isEmail_(email) || b.token !== sign_('unsub:' + email)) return { ok: false, error: 'bad-link' };
  appendEvent_({ type: 'news.unsub', email: email });
  return { ok: true };
}
function appendEvent_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(), last = sh.getLastRow();
    const seq = maxSeq_(sh, last) + 1;
    const ev = Object.assign({ eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'bakery-sheet' }, data);
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
    SpreadsheetApp.flush(); // saved for real before the lock opens: orders arriving together can't overwrite each other
  } finally { lock.releaseLock(); }
}

// ---------- public reviews (QR on the tuck-in card) ----------
function review_(b) {
  if (b.website) return { ok: true }; // spam trap
  const cache = CacheService.getScriptCache();
  const recent = Number(cache.get('reviews-per-minute') || 0);
  if (recent >= 10) return { ok: false, error: 'busy' };
  cache.put('reviews-per-minute', String(recent + 1), 60);
  const s = state_();
  const titles = {};
  Object.keys(s.products).forEach(function (k) {
    const p = s.products[k];
    if (!p.active) return;
    if (p.kind === 'mixed') (p.options || []).forEach(function (o) { titles[o.recipeId] = o.recipeTitle; });
    else titles[p.recipeId] = p.recipeTitle;
  });
  const ratings = {}, used = {};
  Object.keys(b.ratings || {}).forEach(function (k) { const n = Math.round(Number(b.ratings[k])); if (titles[k] && n >= 1 && n <= 5) { ratings[k] = n; used[k] = titles[k]; } });
  const again = ['yes', 'maybe', 'no'].indexOf(b.again) >= 0 ? b.again : undefined;
  const comment = clean_(b.comment, 600), name = clean_(b.name, 60);
  if (!Object.keys(ratings).length && !comment) return { ok: false, error: 'empty' };
  appendEvent_({ type: 'review', device: 'customer-review', name: name || undefined, ratings: ratings, titles: used, again: again, comment: comment || undefined });
  return { ok: true };
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
    const seq = maxSeq_(sh, last) + 1;
    const ev = { type: 'feedback', eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'customer-feedback', orderId: orderId, ratings: ratings, again: again, comment: comment || undefined };
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
    SpreadsheetApp.flush(); // saved for real before the lock opens: orders arriving together can't overwrite each other
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
    if (o.status === 'cancelled' || o.test || !o.pickupDate || o.pickupDate < from) return;
    const key = per === 'week' ? weekKey_(o.pickupDate) : o.pickupDate;
    out[key] = (out[key] || 0) + piecesOf_(o.items);
  });
  return out;
}

// ---------- public order request ----------
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function order_(b, test) {
  if (b.website && !test) return { ok: true, orderNo: 0 }; // hidden spam trap field: pretend success
  const name = clean_(b.name, 80), contact = clean_(b.contact, 120), notes = clean_(b.notes, 500), pickupDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.pickupDate || '')) ? String(b.pickupDate) : '', heardFrom = clean_(b.heardFrom, 40);
  const giftTo = b.gift ? clean_(b.gift.to, 60) : '', giftMsg = b.gift ? clean_(b.gift.message, 200) : '';
  if (!name || (!test && !contact)) return { ok: false, error: 'missing-contact' };
  if (!test && !isEmail_(contact)) return { ok: false, error: 'need-email' };
  if (!test) {
    const cache = CacheService.getScriptCache();
    const recent = Number(cache.get('orders-per-minute') || 0);
    if (recent >= 10) return { ok: false, error: 'busy' };
    cache.put('orders-per-minute', String(recent + 1), 60);
  }
  const s = state_();
  if (!s.shop.open && !test) return { ok: false, error: 'closed', note: s.shop.note || '' };
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
    // flavours of the week / month: only while they're on, and picked up by their last day
    if (!inWindow_(p, today_())) return { ok: false, error: 'out-of-season', name: p.recipeTitle };
    if (p.to && pickupDate && pickupDate > p.to) return { ok: false, error: 'after-season', name: p.recipeTitle, until: p.to };
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
  let total = Math.round(items.reduce(function (t, i) { return t + i.qty * i.unitPrice; }, 0) * 100) / 100;
  // "use my free half dozen": checked against this email's picked-up orders
  let reward = false, rewardAsk = '', discount = 0;
  if (b.useReward === true && !test && loyaltyOn_(s.shop)) {
    const st = loyaltyStats_(s, contact);
    const halves = items.filter(function (i) { return i.pieces === 6; }).map(function (i) { return i.unitPrice; });
    if (st.available < 1) rewardAsk = 'none';
    else if (!halves.length) rewardAsk = 'need-half';
    else { reward = true; discount = Math.max.apply(null, halves); total = Math.round((total - discount) * 100) / 100; }
  }
  const lim = s.shop.limit && s.shop.limit.pieces > 0 ? s.shop.limit : null;
  if (lim && !test) {
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
    seq = maxSeq_(sh, last) + 1;
    ev = { type: 'order.create', eventId: Utilities.getUuid(), at: new Date().toISOString(), device: 'customer-form', orderId: Utilities.getUuid(), orderNo: seq,
      source: 'form', status: 'pending', customer: { name: name, contact: contact }, items: items, pickupDate: pickupDate || undefined,
      pickupId: pickup ? pickup.pickupId : undefined, pickupGroup: pickup ? pickup.name : undefined, notes: notes || undefined, heardFrom: heardFrom || undefined, gift: giftTo ? { to: giftTo, message: giftMsg || undefined } : undefined, news: b.news === true && !test ? true : undefined, test: test ? true : undefined, reward: reward || undefined, rewardAsk: rewardAsk || undefined, discount: discount || undefined, total: total };
    sh.getRange(last + 1, 1, 1, COLS).setValues([[seq, ev.eventId, ev.at, ev.device, ev.type, JSON.stringify(ev)]]);
    SpreadsheetApp.flush(); // saved for real before the lock opens: orders arriving together can't overwrite each other
  } finally { lock.releaseLock(); }
  const pickupLine = pickupText_(ev, s);
  try {
    const shortItems = items.map(function (i) { return i.qty + ' × ' + i.name; }).join(', ');
    ntfy_(s.shop, (test ? '🧪 Test: ' : '') + 'New order #' + seq + ' · ' + name, shortItems + ' · $' + total.toFixed(2) + (pickupLine ? '\n' + pickupLine.split('\n')[0] : '') + (notes ? '\n“' + notes.slice(0, 120) + '”' : ''), test ? ['test_tube'] : ['cookie'], test ? 3 : 4);
  } catch (err) { /* the order is saved even if the phone alert fails */ }
  if (!s.shop.emailsPaused && s.shop.emailOwner !== false && (!test || b.emailMe === true)) try {
    const short = items.map(function (i) { return i.qty + ' ' + String(i.name).replace(/^(Half dozen|Dozen|Box of \d+|[^:]{1,20}): /, function (m, size) { return size + ' '; }); }).join(', ');
    const subject = (test ? '🧪 TEST · ' : '') + '🍪 New order #' + seq + ' · ' + name + ' · ' + (short.length > 70 ? short.slice(0, 67) + '…' : short) + ' · $' + total.toFixed(2);
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject,
      (pickupLine ? pickupLine.split('\n')[0] + ' · ' : '') + 'Total $' + total.toFixed(2) + '\n\nNew order request #' + seq + '\n\nFrom: ' + name + '\nContact: ' + (contact || '(test order, no email)') + (pickupLine ? '\n' + pickupLine : '') +
      '\n\n' + lines_(items) + '\n\nTotal: $' + total.toFixed(2) + (notes ? '\n\nNotes: ' + notes : '') + (heardFrom ? '\nHeard about us: ' + heardFrom : '') + (giftTo ? '\n🎁 Gift for ' + giftTo + (giftMsg ? ': “' + giftMsg + '”' : '') : '') + '\n\nOpen the Flour and Flame app to confirm it.');
  } catch (err) { /* the order is saved even if email fails */ }
  if (!test && s.shop.emailCustomers && !s.shop.emailsPaused && isEmail_(contact)) {
    try {
      MailApp.sendEmail(contact, SHOP_NAME + ': we received your order #' + seq,
        'Hi ' + name.split(' ')[0] + ',\n\nThanks for your order request #' + seq + '!\n\n' + lines_(items) + (reward ? '\n  🎁 Free half dozen (loyalty reward): −$' + discount.toFixed(2) : '') + '\n\nTotal: $' + total.toFixed(2) + (pickupLine ? '\n' + pickupLine : '') +
        '\n\nIt isn’t confirmed yet. You’ll get another email when it is.' + (reward ? '' : loyaltyLine_(s, contact, 0, rewardAsk)) + '\n\n' + SHOP_NAME, { name: SHOP_NAME });
    } catch (err) { /* best-effort */ }
  }
  return { ok: true, orderNo: seq, total: total, reward: reward ? discount : undefined, rewardAsk: rewardAsk || undefined };
}
