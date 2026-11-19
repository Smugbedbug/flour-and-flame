// Public customer order page: shows the active menu from the bakery sheet and sends an order request.
// It never sees the owner's key or any other data.
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FullLogo, PhoenixEmblem, PhoenixSmolder, usePrefersReducedMotion } from '../components/Logo';
import { money } from '../costing';

type Pickup = { pickupId: string; name: string; details?: string };
type MenuItem = { productId: string; name: string; recipeTitle: string; pieces: number; price: number };
const ERRORS: Record<string, string> = {
  'missing-contact': 'Please enter your name and a way to reach you.',
  'empty-order': 'Some items are no longer available. Please reload and choose again.',
  busy: 'Lots of orders right now. Please try again in a minute.',
  'choose-pickup': 'Please choose a pickup option.',
  closed: 'Sorry, we’re not taking orders right now.',
};

export function OrderForm({ deploymentId }: { deploymentId: string }) {
  const valid = /^[A-Za-z0-9_-]{20,}$/.test(deploymentId);
  const url = `https://script.google.com/macros/s/${deploymentId}/exec`;
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // hidden spam trap
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ orderNo: number; total: number; email: boolean } | null>(null);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [pickupId, setPickupId] = useState('');
  const [shop, setShop] = useState<{ open: boolean; note: string }>({ open: true, note: '' });

  useEffect(() => {
    document.title = 'Order: Flour and Flame Bakery';
    if (!valid) { setError('This order link is incomplete. Please ask for a new link.'); return; }
    fetch(`${url}?action=menu`, { redirect: 'follow', cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.ok) throw Error(); setMenu(d.menu); setPickups(d.pickups ?? []); if (d.shop) setShop({ open: d.shop.open !== false, note: d.shop.note ?? '' }); if (d.pickups?.length === 1) setPickupId(d.pickups[0].pickupId); })
      .catch(() => setError('The menu couldn’t be loaded. Check your internet connection and try again.'));
  }, [url, valid]);

  const chosen = (menu ?? []).filter(m => (qty[m.productId] ?? 0) > 0);
  const total = chosen.reduce((s, m) => s + m.price * qty[m.productId], 0);
  const today = new Date(); const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen.length) { setError('Choose at least one item.'); return; }
    if (!name.trim() || !contact.trim()) { setError(ERRORS['missing-contact']); return; }
    if (pickups.length && !pickupId) { setError(ERRORS['choose-pickup']); return; }
    setSending(true); setError('');
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'order', name, contact, pickupDate: date, pickupId: pickupId || undefined, notes, website, items: chosen.map(m => ({ productId: m.productId, qty: qty[m.productId] })) }) });
      const d = await res.json();
      if (!d.ok) { if (d.error === 'closed') setShop({ open: false, note: d.note ?? '' }); throw Error(ERRORS[d.error] ?? 'Something went wrong. Please try again.'); }
      setDone({ orderNo: d.orderNo, total: d.total, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim()) });
      window.scrollTo({ top: 0 });
    } catch (err) { setError(err instanceof Error && err.message ? err.message : 'The order couldn’t be sent. Please try again.'); }
    setSending(false);
  }

  const groups = [...new Set((menu ?? []).map(m => m.recipeTitle))];
  return (
    <div className="order-form-page">
      {!done && <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder></div>}
      {done ? (
        <section className="card done" aria-live="polite">
          <OrderSuccess />
          <div className="done-text">
            <h2>Order received!</h2>
            <p>Thank you, {name.split(' ')[0]}. Your order {done.orderNo ? <b>#{done.orderNo}</b> : null} has been received{done.total ? <> ({money(done.total)})</> : null}.</p>
            {pickups.find(p => p.pickupId === pickupId) && <p className="muted">Pickup: {pickups.find(p => p.pickupId === pickupId)!.name}{date ? ` · ${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` : ''}</p>}
            <p className="muted">{done.email ? 'We’ve emailed you a copy. You’ll get another email once your order is confirmed.' : 'It isn’t confirmed yet. We’ll be in touch soon to confirm pickup and payment.'}</p>
          </div>
        </section>
      ) : !shop.open ? (
        <section className="card done">
          <h2>Not taking orders right now</h2>
          <p className="muted">{shop.note || 'Please check back soon!'}</p>
        </section>
      ) : (
        <form onSubmit={e => void submit(e)} className="card">
          <h2>Place an order</h2>
          {shop.note && <p className="banner info">{shop.note}</p>}
          {!menu && !error && <p className="muted">Loading the menu…</p>}
          {menu && !menu.length && <p className="muted">Nothing is on the menu right now. Please check back soon!</p>}
          {groups.map(g => (
            <div key={g} className="of-group">
              <h3>{g}</h3>
              {menu!.filter(m => m.recipeTitle === g).map(m => (
                <div key={m.productId} className="pick-row">
                  <span>{m.pieces === 12 ? 'Dozen' : m.pieces === 6 ? 'Half dozen' : `${m.pieces} pieces`} <span className="muted">· {money(m.price)}</span></span>
                  <span className="stepper small">
                    <button type="button" aria-label={`Fewer ${m.name}`} onClick={() => setQty({ ...qty, [m.productId]: Math.max(0, (qty[m.productId] ?? 0) - 1) })}><Minus size={16} /></button>
                    <input aria-label={`Quantity ${m.name}`} inputMode="numeric" value={qty[m.productId] ?? 0} onChange={e => setQty({ ...qty, [m.productId]: Math.max(0, Math.min(20, Math.round(Number(e.target.value)) || 0)) })} />
                    <button type="button" aria-label={`More ${m.name}`} onClick={() => setQty({ ...qty, [m.productId]: Math.min(20, (qty[m.productId] ?? 0) + 1) })}><Plus size={16} /></button>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {menu && menu.length > 0 && (
            <>
              <div className="form-grid">
                <label className="field">Your name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} required /></label>
                <label className="field">Phone or email<input autoComplete="tel" value={contact} onChange={e => setContact(e.target.value)} required /></label>
                {pickups.length > 0 && (
                  <fieldset className="field of-pickups">
                    <legend>Pickup</legend>
                    {pickups.map(p => (
                      <label key={p.pickupId} className={'pickup-opt' + (pickupId === p.pickupId ? ' on' : '')}>
                        <input type="radio" name="pickup" value={p.pickupId} checked={pickupId === p.pickupId} onChange={() => setPickupId(p.pickupId)} />
                        <span><strong>{p.name}</strong>{p.details && <span className="muted small"> {p.details}</span>}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <label className="field">Preferred pickup date (optional)<input type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)} /></label>
              </div>
              <label className="field">Notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder={pickups.length ? 'Allergies, gift note…' : 'Allergies, pickup place, gift note…'} /></label>
              <label className="hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
              <p className="order-total">Total: <strong>{money(total)}</strong></p>
              <button className="primary big" type="submit" disabled={sending || !chosen.length}>{sending ? 'Sending…' : 'Send order request'}</button>
              <p className="muted small">Your name, contact and order go only to Flour and Flame Bakery.</p>
            </>
          )}
          {error && <p className="banner error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}

/** Celebration shown once an order is received: the phoenix rises in a burst of embers, then a check mark draws in. */
function OrderSuccess() {
  const reduced = usePrefersReducedMotion();
  return (
    <div className={'order-success' + (reduced ? ' still' : '')} aria-hidden="true">
      <div className="os-glow" />
      {!reduced && Array.from({ length: 12 }, (_, i) => <span key={i} className="os-ember" style={{ ['--i' as any]: i }} />)}
      <div className="os-phoenix smolder animate"><PhoenixEmblem size={120} /></div>
      <svg className="os-check" viewBox="0 0 52 52" width="58" height="58">
        <circle cx="26" cy="26" r="24" />
        <path d="M15 27l7 7 15-16" />
      </svg>
    </div>
  );
}
