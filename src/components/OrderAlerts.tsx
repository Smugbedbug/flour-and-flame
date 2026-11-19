// Hard-to-miss alerts for new customer order requests:
// a large banner at the top that stays until you look, a chime, an optional system notification
// (Windows / Android), and the request count in the tab title.
import { Bell, BellOff, BellRing, ShoppingBag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { go, useRoute } from '../app-context';
import { useLedger } from '../ledgerState';
import { orderLabel, type Order } from '../bakery';
import { money } from '../costing';

const SEEN = 'ff-seen-orders';        // banner dismissed / looked at
const NOTIFIED = 'ff-notified-orders'; // chime + system notification already given
const SOUND = 'ff-alert-sound';

function readSet(k: string): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(k) ?? '[]')); } catch { return new Set(); } }
function writeSet(k: string, s: Set<string>) { try { localStorage.setItem(k, JSON.stringify([...s].slice(-300))); } catch { /* storage unavailable */ } window.dispatchEvent(new Event('ff-alerts')); }

export function getAlertSound(): boolean { try { return localStorage.getItem(SOUND) !== 'off'; } catch { return true; } }
export function setAlertSound(on: boolean) { try { localStorage.setItem(SOUND, on ? 'on' : 'off'); } catch { /* ignore */ } window.dispatchEvent(new Event('ff-alerts')); if (on) chime(); }

/** A gentle three-note chime (no audio file needed). */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume?.();
    [[784, 0], [988, 0.18], [1319, 0.36]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.5);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.55);
    });
    setTimeout(() => void ctx.close?.(), 1500);
  } catch { /* no audio available */ }
}

export function systemAlertsState(): 'on' | 'off' | 'blocked' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off';
}
export async function enableSystemAlerts(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const p = await Notification.requestPermission();
  window.dispatchEvent(new Event('ff-alerts'));
  if (p === 'granted') void showSystem('Order alerts are on', 'You’ll see an alert like this when a customer sends an order.');
  return p === 'granted';
}
async function showSystem(title: string, body: string) {
  if (systemAlertsState() !== 'on') return;
  const opts: NotificationOptions = { body, icon: new URL('icon-192.png', document.baseURI).href, tag: 'ff-order', requireInteraction: true } as any;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, opts); return; }
    const n = new Notification(title, opts); n.onclick = () => { window.focus(); go('orders'); n.close(); };
  } catch { /* not allowed on this device */ }
}

function useAlertPrefs() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump(x => x + 1); window.addEventListener('ff-alerts', f); return () => window.removeEventListener('ff-alerts', f); }, []);
  return { sound: getAlertSound(), system: systemAlertsState() };
}

/** Pending requests, and which of them haven't been looked at yet. */
export function useRequests() {
  const { bakery } = useLedger();
  useAlertPrefs();
  const requests = bakery.orders.filter(o => o.status === 'pending');
  const seen = readSet(SEEN);
  const unseen = bakery.newFormOrders.filter(o => !seen.has(o.orderId));
  return { requests, unseen };
}
export function markSeen(orders: Order[]) { const s = readSet(SEEN); orders.forEach(o => s.add(o.orderId)); writeSet(SEEN, s); }

const itemsText = (o: Order) => o.items.map(i => `${i.qty} × ${i.name}`).join(', ');

export function NewOrderBanner() {
  const { unseen } = useRequests();
  const { sound, system } = useAlertPrefs();
  const [page] = useRoute();
  const { bakery } = useLedger();
  const formIds = useMemo(() => bakery.newFormOrders.map(o => o.orderId).join(','), [bakery.newFormOrders]);

  // chime + system notification once per order (per device)
  useEffect(() => {
    const done = readSet(NOTIFIED);
    if (!localStorage.getItem(NOTIFIED)) { bakery.newFormOrders.forEach(o => done.add(o.orderId)); writeSet(NOTIFIED, done); return; } // first run: don't ring for old orders
    const fresh = bakery.newFormOrders.filter(o => !done.has(o.orderId));
    if (!fresh.length) return;
    fresh.forEach(o => done.add(o.orderId)); writeSet(NOTIFIED, done);
    if (getAlertSound()) chime();
    void showSystem(fresh.length === 1 ? `New order from ${fresh[0].customer.name}` : `${fresh.length} new orders`,
      fresh.map(o => `${orderLabel(o)} ${o.customer.name}: ${itemsText(o)} (${money(o.total)})`).join('\n'));
  }, [formIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // looking at the Orders list counts as seeing them
  useEffect(() => { if (page === 'orders' && unseen.length) markSeen(unseen); }, [page, unseen.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // request count in the browser tab title
  useEffect(() => {
    const n = bakery.orders.filter(o => o.status === 'pending').length;
    document.title = (n ? `(${n}) ` : '') + 'Flour and Flame Bakery';
  }, [bakery.orders]);

  if (!unseen.length || page === 'orders' || page === 'bake') return null;
  return (
    <div className="order-alert" role="alert" aria-live="assertive">
      <BellRing size={30} className="oa-bell" />
      <div className="oa-body">
        <strong>{unseen.length === 1 ? 'New order request!' : `${unseen.length} new order requests!`}</strong>
        {unseen.slice(0, 3).map(o => <span key={o.orderId}>{o.customer.name}: {itemsText(o)} · {money(o.total)}{o.pickupGroup ? ` · ${o.pickupGroup}` : ''}</span>)}
        {unseen.length > 3 && <span>…and {unseen.length - 3} more</span>}
      </div>
      <div className="oa-actions">
        <button className="primary big" onClick={() => { markSeen(unseen); go('orders'); }}><ShoppingBag size={18} /> View {unseen.length === 1 ? 'order' : 'orders'}</button>
        <button className="small-btn" onClick={() => setAlertSound(!sound)} aria-label={sound ? 'Turn alert sound off' : 'Turn alert sound on'} title={sound ? 'Sound on' : 'Sound off'}>{sound ? <Bell size={16} /> : <BellOff size={16} />}</button>
        <button className="small-btn" onClick={() => markSeen(unseen)} aria-label="Dismiss"><X size={16} /> Later</button>
      </div>
      {system === 'off' && <button className="link oa-system" onClick={() => void enableSystemAlerts()}>Also show Windows/phone notifications</button>}
    </div>
  );
}

/** Alert settings (Orders → Pickup & form). */
export function AlertSettings() {
  const { sound, system } = useAlertPrefs();
  return (
    <section className="card">
      <h3><BellRing size={18} /> New order alerts on this device</h3>
      <p className="muted small">A large banner appears at the top when a customer sends an order, and the Orders button pulses until every request is answered. Alerts appear while the app is open (on the phone too); when it’s closed, you still get the email.</p>
      <label className="agree"><input type="checkbox" checked={sound} onChange={e => setAlertSound(e.target.checked)} /> Play a chime</label>
      {system === 'on' && <p className="small">✓ Windows/phone notifications are on for this device.</p>}
      {system === 'off' && <button onClick={() => void enableSystemAlerts()}><Bell size={16} /> Turn on Windows/phone notifications</button>}
      {system === 'blocked' && <p className="muted small">Notifications are blocked for this site. To allow them, click the icon at the left of the address bar → Notifications → Allow.</p>}
      <button className="small-btn" onClick={chime}>Test the chime</button>
    </section>
  );
}
