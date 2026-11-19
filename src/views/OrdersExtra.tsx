import { Printer } from 'lucide-react';
import { Check, Mail, MapPin, Package, Plus, Settings2, Sheet, Store, Truck, Wallet } from 'lucide-react';
import { payOptions } from '../payment';
import { go } from '../app-context';
import { AlertSettings } from '../components/OrderAlerts';
import { pickedUpEvent } from '../feedback';
import { customerKey } from '../reports';
import { celebrateAt } from '../celebrate';
import { getSheetConfig } from '../ledger';
import { useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';
import { itemText, orderLabel, type Order } from '../bakery';
import { money } from '../costing';
import type { OrderLimit, PickupOption } from '../freezer';

const fmt = (d?: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date');

/** Mark handed to someone (e.g. Mom) — separate from the customer picking it up. */
export async function handOff(o: Order, defaultName: string | undefined, run: (t: () => Promise<void>) => Promise<void>) {
  const name = window.prompt('Handed to whom? (e.g. Mom)', defaultName ?? '');
  if (name === null || !name.trim()) return;
  await run(async () => { await addEvents([{ type: 'order.handoff', orderId: o.orderId, to: name.trim() } as any]); });
}

// ---------------- Packing ----------------
export function PackingTab() {
  const { bakery } = useLedger();
  const { run, notify, recipes, catalog } = useApp();
  const open = bakery.orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status));
  const groups = new Map<string, Order[]>();
  for (const o of open) { const k = `${o.pickupDate ?? '9999'}|${o.pickupGroup ?? ''}`; groups.set(k, [...(groups.get(k) ?? []), o]); }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const setPacked = (o: Order, packed: boolean, el?: EventTarget) => { if (packed) celebrateAt(el ?? null); return run(async () => { await addEvents([{ type: 'order.packed', orderId: o.orderId, packed } as any]); }); };
  if (!open.length) return <p className="muted">Nothing to pack. Confirmed orders appear here, grouped by pickup place and date.</p>;
  return (
    <>
      <div className="btn-row"><button className="cards-btn" onClick={() => go('cards')}><Printer size={16} /> Print order cards to tuck in the boxes</button></div>
      <p className="muted small">Tick each box as you pack it. “Handed to…” is for orders you give to someone who passes them on; “Picked up” is when the customer has them.</p>
      {sorted.map(([key, list]) => {
        const [date, place] = key.split('|');
        const pickup = bakery.pickups.find(p => p.name === place);
        const packedCount = list.filter(o => o.packed).length;
        const totals = new Map<string, number>();
        for (const o of list) for (const i of o.items) { const k = i.mix?.length ? itemText({ ...i, qty: 1 }).replace(/^1 × /, '') : i.name; totals.set(k, (totals.get(k) ?? 0) + i.qty); }
        return (
          <section key={key} className="card packing">
            <div className="order-top">
              <div>
                <strong className="packing-title"><MapPin size={16} /> {place || 'No pickup place'} · {fmt(date === '9999' ? undefined : date)}</strong>
                {pickup?.details && <span className="muted small">{pickup.details}</span>}
              </div>
              <span className={'pill small ' + (packedCount === list.length ? 'ok' : '')}>{packedCount}/{list.length} packed</span>
            </div>
            <p className="small muted">Boxes: {[...totals.entries()].map(([n, q]) => `${q} × ${n}`).join(' · ')}</p>
            <ul className="pack-list">
              {list.map(o => (
                <li key={o.orderId} className={o.packed ? 'done' : ''}>
                  <button className="step-check" aria-pressed={!!o.packed} aria-label={`Packed ${orderLabel(o)} ${o.customer.name}`} onClick={e => void setPacked(o, !o.packed, e.currentTarget)}>{o.packed && <Check size={16} strokeWidth={3} />}</button>
                  <div className="pack-body">
                    <strong>{o.customer.name}</strong> <span className="muted small">{orderLabel(o)}{o.customer.contact ? ` · ${o.customer.contact}` : ''}</span>
                    <div className="small">{o.items.map(itemText).join(', ')}</div>
                    <div className="small">
                      {o.sample && <span className="pill small tasting">🎁 Tasting box</span>}{o.total > 0 || !o.sample ? <span className={'pill small ' + (o.paid ? 'ok' : 'warn')}>{o.paid ? 'Paid' : `Collect ${money(o.total)}`}</span> : <span className="pill small ok">Free</span>}
                      {o.status !== 'ready' && <span className="pill small">Not baked yet</span>}
                      {o.handedTo && <span className="pill small"><Truck size={12} /> With {o.handedTo}</span>}
                      {o.notes && <span className="muted"> “{o.notes}”</span>}
                      {o.gift && <span className="pill small tasting">🎁 Gift for {o.gift.to}{o.gift.message ? `: “${o.gift.message}”` : ''}</span>}
                      {bakery.notes[customerKey(o)] && <span className="pill small note-pill">📝 {bakery.notes[customerKey(o)]}</span>}
                    </div>
                  </div>
                  <span className="btn-row">
                    {o.status === 'ready' && !o.handedTo && <button className="small-btn" onClick={() => void handOff(o, pickup?.handler, run)}>Handed to…</button>}
                    {o.status === 'ready' && <button className="small-btn primary" onClick={e => { celebrateAt(e.currentTarget); void run(async () => { await addEvents([await pickedUpEvent(o, recipes, catalog)]); notify(`${orderLabel(o)} picked up.`); }); }}>Picked up</button>}
                  </span>
                </li>
              ))}
            </ul>
            {pickup?.handler && list.some(o => o.status === 'ready' && !o.handedTo) && (
              <button className="small-btn" onClick={() => void run(async () => { await addEvents(list.filter(o => o.status === 'ready' && !o.handedTo).map(o => ({ type: 'order.handoff', orderId: o.orderId, to: pickup.handler } as any))); notify(`Marked as handed to ${pickup.handler}.`); })}><Truck size={14} /> All ready boxes handed to {pickup.handler}</button>
            )}
          </section>
        );
      })}
    </>
  );
}

// ---------------- Pickup options & order form settings ----------------
export function PickupTab({ linkCard }: { linkCard: React.ReactNode }) {
  const { bakery } = useLedger();
  const { run, notify } = useApp();
  const [editing, setEditing] = useState<PickupOption | null>(null);
  const shop = bakery.shop;
  const [note, setNote] = useState(shop.note ?? '');
  const [town, setTown] = useState(shop.town ?? '');
  const [address, setAddress] = useState(shop.address ?? '');
  const [every, setEvery] = useState(String(shop.loyalty?.every ?? 5));
  const saveShop = (patch: Partial<typeof shop>) => run(async () => { await addEvents([{ type: 'shop.settings', settings: { ...shop, ...patch } } as any]); notify('Order form settings saved.'); });
  return (
    <>
      <section className="card">
        <h3><MapPin size={18} /> Pickup options</h3>
        <p className="muted small">Customers choose one of these on the order form. Add who hands orders out (e.g. Mom) to get a one-tap “handed to” on packing lists.</p>
        {!bakery.pickups.length && <p className="muted">No pickup options yet. Customers won’t be asked to choose until you add one.</p>}
        <div className="list">
          {bakery.pickups.map(p => (
            <div key={p.pickupId} className={'history-row' + (p.active ? '' : ' inactive')}>
              <span><strong>{p.name}</strong>{p.details ? <span className="muted small"> · {p.details}</span> : null}{p.handler ? <span className="muted small"> · handed out by {p.handler}</span> : null}{!p.active && <span className="pill small">hidden</span>}</span>
              <span className="btn-row"><button className="small-btn" onClick={() => setEditing(p)}>Edit</button></span>
            </div>
          ))}
        </div>
        <button onClick={() => setEditing({ pickupId: crypto.randomUUID(), name: '', active: true })}><Plus size={16} /> Add pickup option</button>
        {editing && <PickupEditor value={editing} onClose={() => setEditing(null)} onSave={p => run(async () => { await addEvents([{ type: 'pickup.upsert', pickup: p } as any]); notify('Pickup option saved.'); setEditing(null); })} />}
      </section>

      <section className={'card emails-card' + (shop.emailsPaused ? ' paused' : '')}>
        <h3><Mail size={18} /> Emails</h3>
        <label className="agree testing-toggle"><input type="checkbox" checked={!!shop.emailsPaused} onChange={e => void saveShop({ emailsPaused: e.target.checked })} /> 🧪 <b>Testing mode: pause all emails</b> (to you and to customers). Turn this on while you try things out.</label>
        {shop.emailsPaused && <p className="banner warn small">Emails are paused. Orders still arrive in the app (with the pop-up), but nobody gets an email, including you. Remember to turn this off before sharing your link.</p>}
        <fieldset className="email-switches" disabled={!!shop.emailsPaused}>
          <label className="agree"><input type="checkbox" checked={shop.emailOwner !== false} onChange={e => void saveShop({ emailOwner: e.target.checked })} /> Email me when a new order comes in (your phone notification)</label>
          <label className="agree"><input type="checkbox" checked={shop.emailCustomers} onChange={e => void saveShop({ emailCustomers: e.target.checked })} /> Email customers: received, confirmed, ready</label>
          <label className="agree"><input type="checkbox" checked={shop.askFeedback !== false} disabled={!shop.emailCustomers} onChange={e => void saveShop({ askFeedback: e.target.checked })} /> ⭐ After pickup, ask customers “How were they?”</label>
        </fieldset>
        <p className="muted small">The bakery sheet sends these emails. Changes reach it within a few seconds when you’re online. Needs bakery-sheet script version 8.</p>
      </section>

      <PaymentCard />

      <section className="card">
        <h3><Store size={18} /> Order form</h3>
        <label className="agree"><input type="checkbox" checked={shop.open} onChange={e => void saveShop({ open: e.target.checked })} /> Taking orders (uncheck to close the form temporarily)</label>
        <label className="field">Note at the top of the form (optional)<input value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (shop.note ?? '') && void saveShop({ note: note.trim() || undefined })} placeholder="e.g. Orders close Wednesday · pickups Friday" /></label>
        <label className="agree"><input type="checkbox" checked={!!shop.holiday} onChange={e => void saveShop({ holiday: e.target.checked })} /> ✨ Holiday lights and snow on the order form</label>
        <LimitSetting value={shop.limit ?? null} onSave={limit => void saveShop({ limit })} />
        <p className="muted small">To mark an item sold out, use <b>Hide</b> on the Menu tab. These settings need bakery-sheet script version 3.</p>
      </section>
      <section className="card">
        <h3>📍 Pickup location</h3>
        <label className="field">Town shown on the order form<input value={town} onChange={e => setTown(e.target.value)} onBlur={() => town.trim() !== (shop.town ?? '') && void saveShop({ town: town.trim() || undefined })} placeholder="e.g. Plainfield" maxLength={60} /></label>
        <label className="field">Your pickup address (private)<textarea rows={2} value={address} onChange={e => setAddress(e.target.value)} onBlur={() => address.trim() !== (shop.address ?? '') && void saveShop({ address: address.trim() || undefined })} placeholder="Street, apartment, any directions (e.g. side door, ring the bell)" maxLength={300} /></label>
        <p className="muted small">{shop.address
          ? <>The form says pickup is in <b>{shop.town || 'your town'}</b> and that the address comes after payment. The sheet emails the address automatically once an order is <b>confirmed and marked paid</b> (free tasting boxes count as paid). “Cash at pickup” is hidden, since people pay ahead.</>
          : <>Leave the address empty to keep things as they are. When you add one, it’s only ever emailed to a customer after their order is confirmed and paid. It’s never shown on the form.</>}
          {' '}Keep the address out of the pickup option details below, because those show on the form.</p>
      </section>
      <section className="card">
        <h3>🎁 Loyalty</h3>
        <label className="agree"><input type="checkbox" checked={shop.loyalty?.off !== true} onChange={e => void saveShop({ loyalty: { ...shop.loyalty, off: !e.target.checked || undefined } })} /> Free half dozen for regulars</label>
        {shop.loyalty?.off !== true && <label className="field narrow">After every … picked-up orders<input inputMode="numeric" value={every} onChange={e => setEvery(e.target.value.replace(/\D/g, ''))} onBlur={() => { const n = Math.min(20, Math.max(2, Number(every) || 5)); setEvery(String(n)); if (n !== (shop.loyalty?.every ?? 5)) void saveShop({ loyalty: { ...shop.loyalty, every: n } }); }} /></label>}
        <p className="muted small">Counted by email (the form asks people to use the same one). Tasting boxes and test orders don’t count. When an order that earns one is picked up, the sheet emails the customer. They tick “Use my free half dozen” on their next order and a half dozen comes off automatically. You can also apply it yourself on the order card. Then it starts again.</p>
      </section>
      {linkCard}
      <AlertSettings />
      <section className="card">
        <h3><Sheet size={18} /> Bakery sheet</h3>
        <p className="muted small">The Google Sheet that shares orders and the freezer between your devices and receives customer orders.{getSheetConfig().url ? ` Script version ${(getSheetConfig() as any).scriptVersion ?? '?'}.` : ' Not connected yet.'}</p>
        <button onClick={() => go('sheet')}><Settings2 size={16} /> Bakery sheet settings</button>
      </section>
    </>
  );
}

function PaymentCard() {
  const { bakery } = useLedger();
  const { run, notify } = useApp();
  const p = bakery.shop.payment ?? {};
  const [v, setV] = useState({ venmo: p.venmo ?? '', cashapp: p.cashapp ?? '', paypal: p.paypal ?? '', zelle: p.zelle ?? '', note: p.note ?? '', cash: p.cash !== false });
  const save = () => run(async () => {
    const payment = { cash: v.cash, ...Object.fromEntries((['venmo', 'cashapp', 'paypal', 'zelle', 'note'] as const).filter(k => v[k].trim()).map(k => [k, v[k].trim()])) };
    await addEvents([{ type: 'shop.settings', settings: { ...bakery.shop, payment } } as any]); notify('Payment options saved.');
  });
  const preview = payOptions({ ...v, cash: v.cash }, 28, 'Flour and Flame Bakery order #12');
  return (
    <section className="card">
      <h3><Wallet size={18} /> Payment</h3>
      <p className="muted small">Optional. Leave these empty and customers simply see “Cash at pickup”. When you set up an account, type your name or handle here and customers get one-tap pay buttons with the amount filled in (on the thank-you screen and in the confirmed and ready emails).</p>
      <label className="agree"><input type="checkbox" checked={v.cash} onChange={e => setV({ ...v, cash: e.target.checked })} /> Cash at pickup</label>
      <div className="form-grid">
        <label className="field">Venmo username<input value={v.venmo} onChange={e => setV({ ...v, venmo: e.target.value })} placeholder="@YourName" /></label>
        <label className="field">Cash App $cashtag<input value={v.cashapp} onChange={e => setV({ ...v, cashapp: e.target.value })} placeholder="$YourName" /></label>
        <label className="field">PayPal.me name<input value={v.paypal} onChange={e => setV({ ...v, paypal: e.target.value })} placeholder="YourName" /></label>
        <label className="field">Zelle (email or phone)<input value={v.zelle} onChange={e => setV({ ...v, zelle: e.target.value })} placeholder="you@example.com" /></label>
      </div>
      <label className="field">Payment note (optional)<input value={v.note} onChange={e => setV({ ...v, note: e.target.value })} placeholder="e.g. Please include your order number" /></label>
      <p className="small muted">Customers will see: {preview.length ? preview.map(o => o.label).join(' · ') : 'At pickup'}</p>
      <button className="primary" onClick={() => void save()}>Save payment options</button>
    </section>
  );
}

function LimitSetting({ value, onSave }: { value: OrderLimit | null; onSave: (v: OrderLimit | null) => void }) {
  const [on, setOn] = useState(!!value);
  const [dozens, setDozens] = useState(value ? String(Math.round((value.pieces / 12) * 10) / 10) : '10');
  const [per, setPer] = useState<OrderLimit['per']>(value?.per ?? 'day');
  const pieces = Math.round((Number(dozens) || 0) * 12);
  return (
    <div className="limit-setting">
      <label className="agree"><input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); if (!e.target.checked) onSave(null); }} /> Limit how much people can order (optional)</label>
      {on && (
        <div className="btn-row">
          <label className="inline">Up to <input aria-label="Limit in dozens" inputMode="decimal" value={dozens} onChange={e => setDozens(e.target.value)} /> dozen</label>
          <select aria-label="Limit period" value={per} onChange={e => setPer(e.target.value as OrderLimit['per'])}><option value="day">per pickup day</option><option value="week">per week</option></select>
          <button className="small-btn primary" disabled={!(pieces > 0)} onClick={() => onSave({ pieces, per })}>Save limit</button>
          <span className="muted small">= {pieces} pieces (brownies and other treats count by piece). Customers then have to pick a pickup date, and a full {per === 'day' ? 'day' : 'week'} can’t be ordered.</span>
        </div>
      )}
    </div>
  );
}

function PickupEditor({ value, onClose, onSave }: { value: PickupOption; onClose: () => void; onSave: (p: PickupOption) => void }) {
  const [p, setP] = useState(value);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pickup-title">
      <div className="modal">
        <h3 id="pickup-title"><Package size={18} /> Pickup option</h3>
        <label className="field">Name<input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} placeholder="Work, Mom & Dad's, Porch pickup…" /></label>
        <label className="field">Details for customers (optional)<input value={p.details ?? ''} onChange={e => setP({ ...p, details: e.target.value || undefined })} placeholder="Fridays after 3 pm, front desk" /></label>
        <label className="field">Handed out by (optional)<input value={p.handler ?? ''} onChange={e => setP({ ...p, handler: e.target.value || undefined })} placeholder="Mom" /></label>
        <label className="agree"><input type="checkbox" checked={p.active} onChange={e => setP({ ...p, active: e.target.checked })} /> Show on the order form</label>
        <div className="btn-row">
          <button className="primary" disabled={!p.name.trim()} onClick={() => onSave({ ...p, name: p.name.trim() })}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
