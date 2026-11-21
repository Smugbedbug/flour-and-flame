// Public order tracker, opened from the link in the order emails (signed per order).
// Shows where the order is (Received → Confirmed → Baking → Ready → Picked up) and the customer's stamp card.
import { CheckCircle2, ChefHat, ClipboardCheck, Gift, Inbox, PackageCheck, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FullLogo, PhoenixSmolder } from '../components/Logo';

type Track = {
  orderNo: number; name: string; status: string; statusAt: Record<string, string>;
  items: { qty: number; name: string; mix?: { count: number; recipeTitle: string }[] }[];
  total: number; paid: boolean; pickupDate: string; pickup: string; town: string; reward: boolean;
  loyalty?: { done: number; every: number; available: number };
};
const STEPS = [
  { key: 'pending', label: 'Received', icon: Inbox, text: 'We have your order request.' },
  { key: 'confirmed', label: 'Confirmed', icon: ClipboardCheck, text: 'Your order is confirmed.' },
  { key: 'preparing', label: 'Baking', icon: ChefHat, text: 'It’s in the oven.' },
  { key: 'ready', label: 'Ready', icon: PackageCheck, text: 'Baked, boxed and ready for pickup!' },
  { key: 'completed', label: 'Picked up', icon: CheckCircle2, text: 'Picked up. Enjoy!' },
];
const when = (iso?: string) => iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const money = (n: number) => '$' + n.toFixed(2);

export function TrackPage({ deploymentId, orderId, token }: { deploymentId: string; orderId: string; token: string }) {
  const url = `https://script.google.com/macros/s/${deploymentId}/exec`;
  const [t, setT] = useState<Track | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(deploymentId) || !orderId || !token) { setError('This link is incomplete. Please use the link from your email.'); return; }
    setLoading(true);
    fetch(`${url}?action=track&o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`, { redirect: 'follow', cache: 'no-store' })
      .then(r => r.json()).then(d => { if (!d.ok) throw Error(d.error); setT(d); setError(''); })
      .catch(e => setError(e?.message === 'bad-link' ? 'This link doesn’t look right, or the order was removed. Please use the link from your latest email.' : 'This page couldn’t load. Check your internet connection and try again.'))
      .finally(() => setLoading(false));
  }, [url, deploymentId, orderId, token]);
  useEffect(() => { document.title = 'Your order · Flour and Flame Bakery'; load(); const i = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000); return () => clearInterval(i); }, [load]);

  const cancelled = t?.status === 'cancelled';
  const at = t ? STEPS.findIndex(s => s.key === t.status) : -1;
  // "preparing" is optional: if the order skipped it, still show Ready as reached
  const reached = (i: number) => at >= i || (!!t && !!t.statusAt[STEPS[i].key]);
  return (
    <div className="order-form-page track-page">
      <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder></div>
      <section className="card">
        {!t && !error && <p className="muted">Loading your order…</p>}
        {error && <p className="banner error" role="alert">{error}</p>}
        {t && (
          <>
            <div className="tr-head">
              <h2>{t.name ? `${t.name}, your` : 'Your'} order{t.orderNo ? ` #${t.orderNo}` : ''}</h2>
              <button className="small-btn" onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
            </div>
            {cancelled ? <p className="banner warn">This order was cancelled. If that’s a surprise, reply to any of our emails.</p> : (
              <>
                <p className="tr-now" aria-live="polite">{STEPS[Math.max(0, at)].text}</p>
                <ol className="tr-steps" style={{ ['--progress' as any]: Math.max(0, at) / (STEPS.length - 1) }}>
                  {STEPS.map((s, i) => {
                    const Icon = s.icon, done = reached(i), current = i === at;
                    return (
                      <li key={s.key} className={(done ? 'done' : '') + (current ? ' current' : '')} style={{ ['--i' as any]: i }}>
                        <span className="tr-dot"><Icon size={20} /></span>
                        <span className="tr-label"><b>{s.label}</b>{t.statusAt[s.key] && <small>{when(t.statusAt[s.key])}</small>}</span>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
            <div className="tr-details">
              {(t.pickupDate || t.pickup) && <p><b>Pickup:</b> {t.pickup}{t.pickup && t.pickupDate ? ' · ' : ''}{t.pickupDate ? day(t.pickupDate) : ''}{!t.pickup && t.town ? ` in ${t.town}` : ''}</p>}
              <ul className="tr-items">{t.items.map((i, k) => <li key={k}>{i.qty} × {i.name}{i.mix ? <span className="muted small"> ({i.mix.map(m => `${m.count} ${m.recipeTitle}`).join(', ')})</span> : null}</li>)}</ul>
              <p><b>Total:</b> {money(t.total)}{t.reward ? ' (free half dozen applied 🎁)' : ''} · {t.paid ? <span className="ok-text">Paid ✓</span> : <span className="muted">Not paid yet</span>}</p>
            </div>
            {t.loyalty && <StampCard {...t.loyalty} />}
          </>
        )}
      </section>
      <p className="muted small center">Flour and Flame Bakery · this page updates by itself</p>
    </div>
  );
}

function StampCard({ done, every, available }: { done: number; every: number; available: number }) {
  const n = done % every;
  return (
    <div className="stamp-card" aria-label={`Stamp card: ${n} of ${every} stamps toward a free half dozen${available ? `; ${available} free half dozen ready to use` : ''}`}>
      <div className="sc-head"><b>Stamp card</b><span>{every - n === every && done > 0 ? 'Card complete!' : `${every - n} more for a free half dozen`}</span></div>
      <div className="sc-row">{Array.from({ length: every }, (_, i) => <span key={i} className={'sc-spot' + (i < n ? ' on' : '')} style={{ ['--i' as any]: i }}>{i < n ? <span className="sc-ink">🍪</span> : i + 1}</span>)}</div>
      {available > 0 && <p className="sc-free"><Gift size={16} /> You have {available} free half dozen{available > 1 ? 's' : ''}! Tick “Use my free half dozen” on your next order.</p>}
      <p className="muted small">One stamp per picked-up order. Use the same email every time.</p>
    </div>
  );
}
