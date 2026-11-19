import { Check, Mail, MapPin, Package, Plus, Settings2, Sheet, Store, Truck } from 'lucide-react';
import { go } from '../app-context';
import { AlertSettings } from '../components/OrderAlerts';
import { getSheetConfig } from '../ledger';
import { useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';
import { itemText, orderLabel, type Order } from '../bakery';
import { money } from '../costing';
import type { PickupOption } from '../freezer';

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
  const { run, notify } = useApp();
  const open = bakery.orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status));
  const groups = new Map<string, Order[]>();
  for (const o of open) { const k = `${o.pickupDate ?? '9999'}|${o.pickupGroup ?? ''}`; groups.set(k, [...(groups.get(k) ?? []), o]); }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const setPacked = (o: Order, packed: boolean) => run(async () => { await addEvents([{ type: 'order.packed', orderId: o.orderId, packed } as any]); });
  if (!open.length) return <p className="muted">Nothing to pack. Confirmed orders appear here, grouped by pickup place and date.</p>;
  return (
    <>
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
                  <button className="step-check" aria-pressed={!!o.packed} aria-label={`Packed ${orderLabel(o)} ${o.customer.name}`} onClick={() => void setPacked(o, !o.packed)}>{o.packed && <Check size={16} strokeWidth={3} />}</button>
                  <div className="pack-body">
                    <strong>{o.customer.name}</strong> <span className="muted small">{orderLabel(o)}{o.customer.contact ? ` · ${o.customer.contact}` : ''}</span>
                    <div className="small">{o.items.map(itemText).join(', ')}</div>
                    <div className="small">
                      <span className={'pill small ' + (o.paid ? 'ok' : 'warn')}>{o.paid ? 'Paid' : `Collect ${money(o.total)}`}</span>
                      {o.status !== 'ready' && <span className="pill small">Not baked yet</span>}
                      {o.handedTo && <span className="pill small"><Truck size={12} /> With {o.handedTo}</span>}
                      {o.notes && <span className="muted"> “{o.notes}”</span>}
                    </div>
                  </div>
                  <span className="btn-row">
                    {o.status === 'ready' && !o.handedTo && <button className="small-btn" onClick={() => void handOff(o, pickup?.handler, run)}>Handed to…</button>}
                    {o.status === 'ready' && <button className="small-btn primary" onClick={() => void run(async () => { await addEvents([{ type: 'order.status', orderId: o.orderId, status: 'completed' } as any]); notify(`${orderLabel(o)} picked up.`); })}>Picked up</button>}
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

      <section className="card">
        <h3><Store size={18} /> Order form</h3>
        <label className="agree"><input type="checkbox" checked={shop.open} onChange={e => void saveShop({ open: e.target.checked })} /> Taking orders (uncheck to close the form temporarily)</label>
        <label className="field">Note at the top of the form (optional)<input value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (shop.note ?? '') && void saveShop({ note: note.trim() || undefined })} placeholder="e.g. Orders close Wednesday · pickups Friday" /></label>
        <label className="agree"><input type="checkbox" checked={shop.emailCustomers} onChange={e => void saveShop({ emailCustomers: e.target.checked })} /> <Mail size={15} /> Email customers who give an email address (received, confirmed, ready)</label>
        <p className="muted small">To mark an item sold out, use <b>Hide</b> on the Menu tab. These settings need bakery-sheet script version 3.</p>
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
