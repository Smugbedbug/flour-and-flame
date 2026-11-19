// Public customer order page: shows the active menu from the bakery sheet and sends an order request.
// It never sees the owner's key or any other data.
import { Minus, Plus, X } from 'lucide-react';
import { MixPicker, mixTotal, type MixValue } from '../components/MixPicker';
import { productSize } from '../bakery';
import { Picture } from '../components/MenuPicture';
import { decodeAgain } from '../feedback';
import { hasOnlinePay, payOptions } from '../payment';
import type { PaymentInfo } from '../freezer';
import { FrostLayer } from '../components/Frost';
import { HolidayLights } from '../components/Holiday';
import { useEffect, useState } from 'react';
import { FullLogo, PhoenixEmblem, PhoenixSmolder, usePrefersReducedMotion } from '../components/Logo';
import { money } from '../costing';

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
type Pickup = { pickupId: string; name: string; details?: string };
type Look = { art?: any; photo?: string; illustration?: boolean; blurb?: string };
type MenuItem = { productId: string; name: string; recipeTitle: string; pieces: number; price: number; kind?: 'single' | 'mixed'; sizeLabel?: string; step?: number; look?: Look; options?: { recipeId: string; recipeTitle: string; look?: Look }[] };
type Box = { key: string; productId: string; mix: MixValue; qty: number };
const ERRORS: Record<string, string> = {
  'missing-contact': 'Please enter your name and email address.',
  'need-email': 'Please enter a valid email address, e.g. name@gmail.com.',
  'empty-order': 'Some items are no longer available. Please reload and choose again.',
  'bad-mix': 'Please finish choosing the flavours in each mixed box.',
  'need-date': 'Please choose a pickup date.',
  full: 'Sorry, that pickup date is fully booked. Please choose another day.',
  busy: 'Lots of orders right now. Please try again in a minute.',
  'choose-pickup': 'Please choose a pickup option.',
  closed: 'Sorry, we’re not taking orders right now.',
};

export function OrderForm({ deploymentId, again, from }: { deploymentId: string; again?: string; from?: string }) {
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
  const [done, setDone] = useState<{ orderNo: number; total: number; email: boolean; reward?: number; rewardAsk?: string } | null>(null);
  const [useReward, setUseReward] = useState(false);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [pickupId, setPickupId] = useState('');
  const [shop, setShop] = useState<{ open: boolean; note: string; holiday?: boolean; limit?: { pieces: number; per: 'day' | 'week' } | null; payment?: PaymentInfo; town?: string; payFirst?: boolean; loyalty?: { every: number } | null }>({ open: true, note: '' });
  const [booked, setBooked] = useState<Record<string, number>>({});
  const [heard, setHeard] = useState(from === 'card' ? 'Tried a tasting box' : '');
  const [isGift, setIsGift] = useState(false);
  const [giftTo, setGiftTo] = useState('');
  const [giftMsg, setGiftMsg] = useState('');
  const [news, setNews] = useState(false);
  const [refilled, setRefilled] = useState(false);

  useEffect(() => {
    document.title = 'Order: Flour and Flame Bakery';
    if (!valid) { setError('This order link is incomplete. Please ask for a new link.'); return; }
    fetch(`${url}?action=menu`, { redirect: 'follow', cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.ok) throw Error(); setMenu(d.menu); setPickups(d.pickups ?? []); if (d.shop) setShop({ open: d.shop.open !== false, note: d.shop.note ?? '', holiday: !!d.shop.holiday, limit: d.shop.limit ?? null, payment: d.shop.payment, town: d.shop.town || '', payFirst: !!d.shop.payFirst, loyalty: d.shop.loyalty ?? null }); setBooked(d.booked ?? {}); if (d.pickups?.length === 1) setPickupId(d.pickups[0].pickupId); })
      .catch(() => setError('The menu couldn’t be loaded. Check your internet connection and try again.'));
  }, [url, valid]);

  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => { setError(e => (e && menu ? '' : e)); }, [qty, boxes, name, contact, pickupId]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Order again" link: fill in last time's boxes (only what's still on the menu)
  useEffect(() => {
    if (!menu || !again || refilled) return;
    setRefilled(true);
    const prev = decodeAgain(again);
    const q: Record<string, number> = {}; const bx: Box[] = [];
    for (const it of prev) {
      const m = menu.find(x => x.productId === it.productId);
      if (!m) continue;
      if (m.kind === 'mixed') {
        const ok = new Set((m.options ?? []).map(o => o.recipeId));
        const mix = Object.fromEntries((it.mix ?? []).filter(([id, n]) => ok.has(id) && n > 0));
        bx.push({ key: crypto.randomUUID(), productId: m.productId, qty: it.qty, mix: mixTotal(mix) === m.pieces ? mix : {} });
      } else q[m.productId] = it.qty;
    }
    setQty(q); setBoxes(bx);
  }, [menu, again, refilled]);
  const singles = (menu ?? []).filter(m => m.kind !== 'mixed');
  const mixed = (menu ?? []).filter(m => m.kind === 'mixed' && (m.options?.length ?? 0) > 0);
  const chosen = singles.filter(m => (qty[m.productId] ?? 0) > 0);
  const boxOf = (b: Box) => mixed.find(m => m.productId === b.productId);
  const boxesDone = boxes.every(b => mixTotal(b.mix) === (boxOf(b)?.pieces ?? -1));
  const total = chosen.reduce((s, m) => s + m.price * qty[m.productId], 0) + boxes.reduce((s, b) => s + (boxOf(b)?.price ?? 0) * b.qty, 0);
  const anything = chosen.length > 0 || boxes.length > 0;
  const boxCount = chosen.reduce((t, m) => t + qty[m.productId], 0) + boxes.reduce((t, b) => t + b.qty, 0);
  const wantPieces = chosen.reduce((t, m) => t + m.pieces * qty[m.productId], 0) + boxes.reduce((t, b) => t + (boxOf(b)?.pieces ?? 0) * b.qty, 0);
  const weekOf = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const left = shop.limit && date ? Math.max(0, shop.limit.pieces - (booked[shop.limit.per === 'week' ? weekOf(date) : date] ?? 0)) : null;
  const tooMuch = left !== null && wantPieces > left;
  const today = new Date(); const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!anything) { setError('Choose at least one item.'); return; }
    if (!boxesDone) { setError(ERRORS['bad-mix']); return; }
    if (!name.trim() || !contact.trim()) { setError(ERRORS['missing-contact']); return; }
    if (!isEmail(contact)) { setError(ERRORS['need-email']); return; }
    if (pickups.length && !pickupId) { setError(ERRORS['choose-pickup']); return; }
    if (shop.limit && !date) { setError(ERRORS['need-date']); return; }
    if (tooMuch) { setError(left ? `Only ${left} more pieces can be ordered for that ${shop.limit!.per === 'week' ? 'week' : 'day'}. Please choose fewer or another date.` : ERRORS.full); return; }
    setSending(true); setError('');
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'order', name, contact, pickupDate: date, pickupId: pickupId || undefined, heardFrom: heard || undefined, gift: isGift && giftTo.trim() ? { to: giftTo.trim(), message: giftMsg.trim() || undefined } : undefined, news: news || undefined, useReward: useReward || undefined, notes, website, items: [...chosen.map(m => ({ productId: m.productId, qty: qty[m.productId] })), ...boxes.map(b => ({ productId: b.productId, qty: b.qty, mix: Object.entries(b.mix).filter(([, n]) => n > 0).map(([recipeId, count]) => ({ recipeId, count })) }))] }) });
      const d = await res.json();
      if (!d.ok) { if (d.error === 'closed') setShop({ open: false, note: d.note ?? '' }); if (d.error === 'full' && d.left) throw Error(`Only ${d.left} more pieces can be ordered for that ${d.per === 'week' ? 'week' : 'day'}. Please choose fewer or another date.`); throw Error(ERRORS[d.error] ?? 'Something went wrong. Please try again.'); }
      setDone({ orderNo: d.orderNo, total: d.total, email: isEmail(contact), reward: d.reward, rewardAsk: d.rewardAsk });
      window.scrollTo({ top: 0 });
    } catch (err) { setError(err instanceof Error && err.message ? err.message : 'The order couldn’t be sent. Please try again.'); }
    setSending(false);
  }

  const groups = [...new Set(singles.map(m => m.recipeTitle))];
  return (
    <div className={'order-form-page' + (shop.holiday ? ' holiday' : '')}>
      {shop.holiday && <HolidayLights />}
      {shop.holiday && <FrostLayer />}
      {!done && shop.open && anything && (
        <button type="button" className="cart-bar" onClick={() => document.getElementById('of-send')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <span><b>{boxCount}</b> box{boxCount !== 1 ? 'es' : ''} · <b>{money(total)}</b></span><span>Review &amp; send ↓</span>
        </button>
      )}
      {!done && <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder></div>}
      {done ? (
        <section className="card done" aria-live="polite">
          <OrderSuccess />
          <div className="done-text">
            <h2>Order received!</h2>
            <p>Thank you, {name.split(' ')[0]}. Your order {done.orderNo ? <b>#{done.orderNo}</b> : null} has been received{done.total ? <> ({money(done.total)})</> : null}.</p>
            {pickups.find(p => p.pickupId === pickupId) && <p className="muted">Pickup: {pickups.find(p => p.pickupId === pickupId)!.name}{date ? ` · ${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` : ''}</p>}
            {done.reward ? <p className="reward-note">🎁 Your free half dozen was applied (−{money(done.reward)}). Enjoy!</p>
              : done.rewardAsk === 'none' ? <p className="muted small">We couldn’t find a free half dozen for this email yet, so the order is at the normal price. We’ll double-check when we confirm it.</p>
              : done.rewardAsk === 'need-half' ? <p className="muted small">You do have a free half dozen! It only applies when the order includes a half dozen, so it’s saved for next time.</p> : null}
            {shop.payFirst && <p className="small">📍 Pickup is {shop.town ? <>in <b>{shop.town}</b></> : 'at our home'}. Once your order is confirmed and paid, we’ll email you the exact address.</p>}
            {done.total > 0 && hasOnlinePay(shop.payment) && <PayButtons payment={shop.payment} amount={done.total} note={`Flour and Flame Bakery order #${done.orderNo}`} />}
            <p className="muted">{done.email ? <>We’ve emailed a copy to <b>{contact.trim()}</b>. You’ll get another email once your order is confirmed. (Check your spam folder if you don’t see it.)</> : 'It isn’t confirmed yet. We’ll be in touch soon to confirm pickup and payment.'}</p>
          </div>
        </section>
      ) : !shop.open ? (
        <section className="card done">
          <h2>Not taking orders right now</h2>
          <p className="muted">{shop.note || 'Please check back soon!'}</p>
        </section>
      ) : (
        <form onSubmit={e => void submit(e)} className="card" noValidate>
          <h2>Place an order</h2>
          {again && refilled && (Object.keys(qty).length > 0 || boxes.length > 0) && <p className="banner info">Welcome back! We filled in your last order. Change anything you like.</p>}
          {shop.note && <p className="banner info">{shop.note}</p>}
          {!menu && !error && <p className="muted">Loading the menu…</p>}
          {menu && !menu.length && <p className="muted">Nothing is on the menu right now. Please check back soon!</p>}
          {groups.map(g => (
            <div key={g} className="of-group">
              <div className="of-head"><Picture look={singles.find(m => m.recipeTitle === g)?.look} title={g} seed={g} size={84} label /><div><h3>{g}</h3>{singles.find(m => m.recipeTitle === g)?.look?.blurb && <p className="of-blurb">{singles.find(m => m.recipeTitle === g)!.look!.blurb}</p>}</div></div>
              {singles.filter(m => m.recipeTitle === g).map(m => (
                <div key={m.productId} className="pick-row">
                  <span>{productSize(m)}{m.sizeLabel ? <span className="muted small"> ({m.pieces})</span> : null} <span className="muted">· {money(m.price)}</span></span>
                  <span className="stepper small">
                    <button type="button" aria-label={`Fewer ${m.name}`} onClick={() => setQty({ ...qty, [m.productId]: Math.max(0, (qty[m.productId] ?? 0) - 1) })}><Minus size={16} /></button>
                    <input aria-label={`Quantity ${m.name}`} inputMode="numeric" value={qty[m.productId] ?? 0} onChange={e => setQty({ ...qty, [m.productId]: Math.max(0, Math.min(20, Math.round(Number(e.target.value)) || 0)) })} />
                    <button type="button" aria-label={`More ${m.name}`} onClick={() => setQty({ ...qty, [m.productId]: Math.min(20, (qty[m.productId] ?? 0) + 1) })}><Plus size={16} /></button>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {mixed.length > 0 && (
            <div className="of-group">
              <div className="of-head"><span className="mix-stack">{mixed[0].options!.slice(0, 3).map(o => <Picture key={o.recipeId} look={o.look} title={o.recipeTitle} seed={o.recipeTitle} size={52} />)}</span><div><h3>Mixed boxes</h3><p className="muted small">Pick your own flavours.</p></div></div>
              {boxes.map((b, i) => {
                const m = boxOf(b); if (!m) return null;
                const label = `${m.name} ${boxes.filter(x => x.productId === b.productId).indexOf(b) + 1}`;
                return (
                  <div key={b.key} className="mixed-line card">
                    <div className="order-top"><strong>{label} <span className="muted small">· {money(m.price)}</span></strong>
                      <span className="btn-row">
                        <span className="stepper small">
                          <button type="button" aria-label={`Fewer boxes of ${label}`} onClick={() => setBoxes(boxes.map(x => x.key === b.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Minus size={16} /></button>
                          <output aria-label={`Boxes of ${label}`}>{b.qty}</output>
                          <button type="button" aria-label={`More boxes of ${label}`} onClick={() => setBoxes(boxes.map(x => x.key === b.key ? { ...x, qty: Math.min(20, x.qty + 1) } : x))}><Plus size={16} /></button>
                        </span>
                        <button type="button" className="small-btn" aria-label={`Remove ${label}`} onClick={() => setBoxes(boxes.filter(x => x.key !== b.key))}><X size={14} /></button>
                      </span>
                    </div>
                    <MixPicker label={label} options={m.options!} pictureOf={o => <Picture look={(o as any).look} title={o.recipeTitle} seed={o.recipeTitle} size={40} />} pieces={m.pieces} step={m.step} value={b.mix} onChange={mix => setBoxes(boxes.map((x, k) => k === i ? { ...x, mix } : x))} />
                  </div>
                );
              })}
              {mixed.map(m => (
                <div key={m.productId} className="pick-row">
                  <span>{m.name} <span className="muted small">({m.pieces})</span> <span className="muted">· {money(m.price)}</span></span>
                  <button type="button" className="small-btn" onClick={() => setBoxes([...boxes, { key: crypto.randomUUID(), productId: m.productId, mix: {}, qty: 1 }])}><Plus size={14} /> Build a box</button>
                </div>
              ))}
            </div>
          )}
          {menu && menu.length > 0 && (
            <>
              <div className="form-grid">
                <label className="field">Your name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} required /></label>
                <label className="field">Email<input type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} value={contact} onChange={e => setContact(e.target.value)} placeholder="name@gmail.com" required /></label>
                {shop.loyalty && <p className="small loyalty-hint">🍪 Use the same email every time: every {shop.loyalty.every} orders earns you a <b>free half dozen</b>.</p>}
                {pickups.length > 0 && (
                  <fieldset className="field of-pickups">
                    <legend>Pickup{shop.town ? ` in ${shop.town}` : ''}</legend>
                    {pickups.map(p => (
                      <label key={p.pickupId} className={'pickup-opt' + (pickupId === p.pickupId ? ' on' : '')}>
                        <input type="radio" name="pickup" value={p.pickupId} checked={pickupId === p.pickupId} onChange={() => setPickupId(p.pickupId)} />
                        <span><strong>{p.name}</strong>{p.details && <span className="muted small"> {p.details}</span>}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {shop.town && !pickups.length && <div className="town-line"><span>📍 <b>Pickup in {shop.town}</b>{shop.payFirst ? <><br /><span className="muted small">The exact address is emailed once your order is confirmed and paid.</span></> : null}</span></div>}
                <label className="field">{shop.limit ? 'Pickup date' : 'Preferred pickup date (optional)'}<input type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)} required={!!shop.limit} />
                  {left !== null && <span className={'small ' + (tooMuch || left === 0 ? 'warn-text' : 'muted')}>{left === 0 ? 'That date is fully booked. Please pick another.' : tooMuch ? `Only ${left} more pieces fit that ${shop.limit!.per === 'week' ? 'week' : 'day'}.` : `${left} pieces still available that ${shop.limit!.per === 'week' ? 'week' : 'day'}.`}</span>}</label>
                <label className="field">How did you hear about us? (optional)<select value={heard} onChange={e => setHeard(e.target.value)}>
                  <option value="">Choose…</option>
                  {['Tried a tasting box', 'Friend or family', 'Facebook', 'Instagram', 'At work', 'Other'].map(x => <option key={x}>{x}</option>)}
                </select></label>
              </div>
              <label className="agree gift-toggle"><input type="checkbox" checked={isGift} onChange={e => setIsGift(e.target.checked)} /> 🎁 This is a gift</label>
              {isGift && <div className="form-grid gift-fields">
                <label className="field">Who is it for?<input value={giftTo} onChange={e => setGiftTo(e.target.value)} maxLength={60} placeholder="e.g. Grandma Jo" /></label>
                <label className="field">Gift note (optional)<input value={giftMsg} onChange={e => setGiftMsg(e.target.value)} maxLength={200} placeholder="Happy birthday! Love, Sue" /></label>
              </div>}
              {shop.loyalty && <label className="agree reward-toggle"><input type="checkbox" checked={useReward} onChange={e => setUseReward(e.target.checked)} /> <span>🎁 <b>Use my free half dozen</b><br /><span className="muted small">If you’ve earned one: add a half dozen to your order and it’s free.</span></span></label>}
              <label className="field">Notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder={pickups.length ? 'Allergies, special requests…' : 'Allergies, pickup place, special requests…'} /></label>
              <PayInfo payment={shop.payment} payFirst={shop.payFirst} town={shop.town} hasPickups={pickups.length > 0} />
              <label className="agree news-optin"><input type="checkbox" checked={news} onChange={e => setNews(e.target.checked)} /> 📬 Email me when new flavours or pickup days open (unsubscribe anytime)</label>
              <label className="hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
              <p className="order-total">Total: <strong>{money(total)}</strong></p>
              <div id="of-send" />
              <button className="primary big" type="submit" disabled={sending || !anything}>{sending ? 'Sending…' : 'Send order request'}</button>
              <p className="muted small">We’ll email you when your order is received, confirmed and ready. Your name, email and order go only to Flour and Flame Bakery.</p>
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

/** How to pay (shown before sending). */
function PayInfo({ payment, payFirst, town, hasPickups }: { payment?: PaymentInfo; payFirst?: boolean; town?: string; hasPickups?: boolean }) {
  const opts = payOptions(payment, 0, '');
  if (payFirst) return (
    <div className="pay-info">
      <strong>Paying &amp; pickup</strong>
      <span className="muted small">After we confirm your order, you pay ahead{opts.length ? ` (${opts.map(o => o.label).join(' · ')})` : ''}{payment?.note ? `. ${payment.note}` : ''}. Once it’s paid, we email you the pickup address{town && hasPickups ? ` in ${town}` : ''}. No payment is taken now.</span>
    </div>
  );
  return (
    <div className="pay-info">
      <strong>Paying</strong>
      <span className="muted small">{opts.length ? opts.map(o => o.label + (o.detail ? ` (${o.detail})` : '')).join(' · ') : 'At pickup'}{payment?.note ? `. ${payment.note}` : ''}. No payment is taken now.</span>
    </div>
  );
}
/** Pay-now buttons after the order is sent (only when an online option is set up). */
function PayButtons({ payment, amount, note }: { payment?: PaymentInfo; amount: number; note: string }) {
  const opts = payOptions(payment, amount, note);
  return (
    <div className="pay-buttons">
      <p className="small"><b>Pay now or at pickup</b>, whichever you like:</p>
      <div className="btn-row">
        {opts.map(o => o.url ? <a key={o.key} className={'pay-btn ' + o.key} href={o.url} target="_blank" rel="noopener noreferrer">Pay {money(amount)} with {o.label}</a>
          : <span key={o.key} className="pay-btn plain">{o.label}{o.detail ? `: ${o.detail}` : ''}</span>)}
      </div>
    </div>
  );
}
