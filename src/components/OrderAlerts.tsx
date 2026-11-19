// Hard-to-miss alerts for new customer order requests:
// a large banner at the top that stays until you look, a chime, an optional system notification
// (Windows / Android), and the request count in the tab title.
import { Bell, BellOff, BellRing, ShoppingBag, X } from 'lucide-react';
import { PhoenixEmblem } from './Logo';
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
export function setAlertSound(on: boolean) { try { localStorage.setItem(SOUND, on ? 'on' : 'off'); } catch { /* ignore */ } window.dispatchEvent(new Event('ff-alerts')); if (on) playAlert(); }
export type SoundKind = 'whoosh' | 'chime' | 'both';
const KIND = 'ff-alert-sound-kind';
export function getSoundKind(): SoundKind { try { const v = localStorage.getItem(KIND); return v === 'chime' || v === 'both' ? v : 'whoosh'; } catch { return 'whoosh'; } }
export function setSoundKind(k: SoundKind) { try { localStorage.setItem(KIND, k); } catch { /* ignore */ } window.dispatchEvent(new Event('ff-alerts')); playAlert(k); }
/** The new-order sound: phoenix wing whoosh (default), the chime, or both. */
export function playAlert(kind: SoundKind = getSoundKind()) {
  if (kind === 'chime') return chime();
  whoosh();
  if (kind === 'both') setTimeout(chime, 900);
}

/** Two soft wing-beats sweeping left to right: filtered noise with a rising and falling pitch (no audio file needed). */
export function whoosh() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    void ctx.resume?.();
    const len = Math.floor(ctx.sampleRate * 1.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const now = ctx.currentTime;
    const beat = (t: number, strength: number, dur: number) => {
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(300, now + t);
      bp.frequency.exponentialRampToValueAtTime(1500, now + t + dur * 0.45);
      bp.frequency.exponentialRampToValueAtTime(450, now + t + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.5 * strength, now + t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
      let node: AudioNode = g;
      if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(-0.8 + t, now + t); pan.pan.linearRampToValueAtTime(-0.2 + t * 1.6, now + t + dur); g.connect(pan); node = pan; }
      src.connect(bp).connect(lp).connect(g); node.connect(ctx.destination);
      src.start(now + t, Math.random() * 0.3, dur + 0.05);
    };
    beat(0, 1, 0.42);      // first big wing-beat
    beat(0.36, 0.75, 0.38); // second, a little softer
    beat(0.7, 0.4, 0.5);    // glide past
    setTimeout(() => void ctx.close?.(), 2200);
  } catch { /* no audio available */ }
}

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
const placedAt = (o: Order) => new Date(o.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function ago(iso: string, now: number) {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function useNow(ms = 30000) { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; }

export function NewOrderBanner() {
  const { unseen } = useRequests();
  const { sound, system } = useAlertPrefs();
  const [page] = useRoute();
  const now = useNow();
  const { bakery } = useLedger();
  const formIds = useMemo(() => bakery.newFormOrders.map(o => o.orderId).join(','), [bakery.newFormOrders]);

  // chime + system notification once per order (per device)
  useEffect(() => {
    const done = readSet(NOTIFIED);
    if (!localStorage.getItem(NOTIFIED)) { bakery.newFormOrders.forEach(o => done.add(o.orderId)); writeSet(NOTIFIED, done); return; } // first run: don't ring for old orders
    const fresh = bakery.newFormOrders.filter(o => !done.has(o.orderId));
    if (!fresh.length) return;
    fresh.forEach(o => done.add(o.orderId)); writeSet(NOTIFIED, done);
    if (getAlertSound()) playAlert();
    void showSystem(fresh.length === 1 ? `New order from ${fresh[0].customer.name}` : `${fresh.length} new orders`,
      fresh.map(o => `${orderLabel(o)} ${o.customer.name}: ${itemsText(o)} (${money(o.total)}) · placed ${placedAt(o)}`).join('\n'));
  }, [formIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // looking at the Orders list counts as seeing them
  // The banner stays until you tap View order / Later, or answer the request (confirm or cancel).

  // request count in the browser tab title
  useEffect(() => {
    const n = bakery.orders.filter(o => o.status === 'pending').length;
    document.title = (n ? `(${n}) ` : '') + 'Flour and Flame Bakery';
  }, [bakery.orders]);

  if (!unseen.length) return null;
  return (
    <div className={'order-alert' + (page === 'bake' ? ' compact' : '')} role="alert" aria-live="assertive">
      <span className="oa-flight" aria-hidden="true">
        <span className="oa-trail">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ['--i' as any]: i }} />)}</span>
        <span className="oa-phoenix smolder animate"><PhoenixEmblem size={54} /></span>
      </span>
      <div className="oa-body">
        <strong>{unseen.length === 1 ? 'New order request!' : `${unseen.length} new order requests!`}</strong>
        {unseen.slice(0, 3).map(o => <span key={o.orderId}>{o.customer.name}: {itemsText(o)} · {money(o.total)}{o.pickupGroup ? ` · ${o.pickupGroup}` : ''}<em className="oa-when"> · Placed {placedAt(o)} ({ago(o.createdAt, now)})</em></span>)}
        {unseen.length > 3 && <span>…and {unseen.length - 3} more</span>}
      </div>
      <div className="oa-actions">
        <button className="primary big" onClick={() => { markSeen(unseen); if (page === 'orders') document.querySelector('.order-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); else go('orders'); }}><ShoppingBag size={18} /> View {unseen.length === 1 ? 'order' : 'orders'}</button>
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
      <label className="agree"><input type="checkbox" checked={sound} onChange={e => setAlertSound(e.target.checked)} /> Play a sound</label>
      {sound && <SoundChoice />}
      {system === 'on' && <p className="small">✓ Windows/phone notifications are on for this device.</p>}
      {system === 'off' && <button onClick={() => void enableSystemAlerts()}><Bell size={16} /> Turn on Windows/phone notifications</button>}
      {system === 'blocked' && <p className="muted small">Notifications are blocked for this site. To allow them, click the icon at the left of the address bar → Notifications → Allow.</p>}
      <button className="small-btn" onClick={() => playAlert()}>Test the sound</button>
    </section>
  );
}

export function SoundChoice() {
  const [k, setK] = useState<SoundKind>(getSoundKind);
  const opts: [SoundKind, string][] = [['whoosh', '🔥 Phoenix wings'], ['chime', '🔔 Chime'], ['both', 'Both']];
  return (
    <div className="seg" role="radiogroup" aria-label="New order sound">
      {opts.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={k === v} className={k === v ? 'on' : ''} onClick={() => { setK(v); setSoundKind(v); }}>{l}</button>)}
    </div>
  );
}
