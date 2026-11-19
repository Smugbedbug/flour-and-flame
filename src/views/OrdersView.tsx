import { CheckCircle2, ClipboardList, Copy, Link2, Minus, Pencil, Plus, Share2, ShoppingBag, Store, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp, useRoute } from '../app-context';
import { addEvents, getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';
import { ballsFor, itemsTotal, orderCoverage, orderLabel, RESERVES, STATUS_LABEL, type Order, type PlanRow, type Shortfall } from '../bakery';
import { AlertTriangle } from 'lucide-react';
import type { OrderItem, OrderStatus, Product } from '../freezer';
import { costPerItem, expectedItems, money, recipeCost } from '../costing';
import { writeRecipe } from '../db';
import { SheetStatus } from './FreezerView';
import { handOff, PackingTab, PickupTab } from './OrdersExtra';
import { Truck } from 'lucide-react';
import type { Recipe } from '../types';

const SIZES = [{ pieces: 6, label: 'Half dozen' }, { pieces: 12, label: 'Dozen' }];
const fmtDate = (d?: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date');

export function customerLink(): string | null {
  const url = getSheetConfig().url ?? '';
  const m = url.match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
  return m ? `${location.origin}${location.pathname}#/order-form/${m[1]}` : null;
}

/** Ingredient cost per cookie for a recipe (null if costing incomplete). */
function perPiece(r: Recipe | undefined, catalog: Parameters<typeof recipeCost>[1]): number | null {
  if (!r) return null;
  return costPerItem(recipeCost(r, catalog), expectedItems(r));
}

export function OrdersView() {
  const [, tab = 'list'] = useRoute();
  const { connected } = useLedger();
  return (
    <div className="page orders">
      <div className="page-head"><h2><ShoppingBag size={24} /> Orders</h2></div>
      <div className="tabs" role="tablist">
        {[['list', 'Orders'], ['pack', 'Packing'], ['plan', 'Planning'], ['menu', 'Menu'], ['form', 'Pickup & form']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k === 'list' ? 'orders' : 'orders/' + k)}>{l}</button>)}
      </div>
      <SheetStatus />
      {!connected && <p className="muted small">Orders work on this device now. Connect the shared bakery sheet to see them on both devices and to receive customer orders.</p>}
      {tab === 'menu' ? <MenuTab /> : tab === 'plan' ? <PlanTab /> : tab === 'pack' ? <PackingTab /> : tab === 'form' ? <PickupTab linkCard={<CustomerLinkCard />} /> : <OrdersTab />}
    </div>
  );
}

// ---------------- Orders ----------------
function OrdersTab() {
  const { bakery } = useLedger();
  const { notify, run } = useApp();
  const [editing, setEditing] = useState<Order | 'new' | null>(null);
  const groups: [string, Order[]][] = [
    ['Requests', bakery.orders.filter(o => o.status === 'pending')],
    ['Confirmed', bakery.orders.filter(o => o.status === 'confirmed' || o.status === 'preparing')],
    ['Ready for pickup', bakery.orders.filter(o => o.status === 'ready')],
  ];
  const done = bakery.orders.filter(o => o.status === 'completed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cancelled = bakery.orders.filter(o => o.status === 'cancelled');
  const coverage = useMemo(() => orderCoverage(bakery), [bakery]);
  const makeMore = bakery.plan.filter(r => r.makeMore > 0);

  return (
    <>
      <div className="btn-row">
        <button className="primary" disabled={!bakery.products.some(p => p.active)} onClick={() => setEditing('new')}><Plus size={16} /> New order</button>
        {!bakery.products.length && <span className="muted small">First add products on the <button className="link" onClick={() => go('orders/menu')}>Menu</button> tab.</span>}
      </div>
      {makeMore.length > 0 && (
        <div className="banner warn make-more">
          <AlertTriangle size={20} />
          <div><strong>Make more dough</strong><p>{makeMore.map(r => `${r.makeMore} × ${r.recipeTitle} (have ${Math.max(0, r.inFreezer)})`).join(' · ')}</p></div>
          <button onClick={() => go('orders/plan')}>Planning</button>
        </div>
      )}
      {groups.map(([title, list]) => list.length > 0 && (
        <section key={title}>
          <h3>{title} <span className="pill small">{list.length}</span></h3>
          <div className="order-grid">{list.map(o => <OrderCard key={o.orderId} o={o} plan={bakery.plan} shorts={coverage[o.orderId]} onEdit={() => setEditing(o)} />)}</div>
        </section>
      ))}
      {!bakery.orders.some(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)) && <p className="muted">No open orders.</p>}
      {done.length > 0 && <details className="card"><summary>Picked up ({done.length})</summary><div className="order-grid">{done.slice(0, 30).map(o => <OrderCard key={o.orderId} o={o} plan={bakery.plan} onEdit={() => setEditing(o)} />)}</div></details>}
      {cancelled.length > 0 && <details className="card"><summary>Cancelled ({cancelled.length})</summary><div className="order-grid">{cancelled.map(o => <OrderCard key={o.orderId} o={o} plan={bakery.plan} onEdit={() => setEditing(o)} />)}</div></details>}

      <p className="muted small"><Link2 size={14} /> Your customer order link, pickup options and order-form settings are on the <button className="link" onClick={() => go('orders/form')}>Pickup &amp; form</button> tab.</p>

      {editing && <OrderDialog order={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={async evs => { await run(async () => { await addEvents(evs); notify(editing === 'new' ? 'Order saved.' : 'Order updated.'); setEditing(null); }); }} />}
    </>
  );
}

function CustomerLinkCard() {
  const { notify } = useApp();
  const link = customerLink();
  const v = (getSheetConfig() as any).scriptVersion ?? 0;
  const scriptOk = v >= 2;
  return (
    <section className="card">
      <h3><Link2 size={18} /> Customer order link</h3>
      {link && scriptOk ? (
        <>
          <p className="muted small">Share this with family and customers. Orders arrive here as <b>Requests</b> and you get an email for each one. Customers only see your active menu items and prices.</p>
          {v < 3 && <p className="banner warn small">Pickup choices, the shop note and customer emails need script version 3. Open <button className="link" onClick={() => go('sheet')}>bakery sheet settings</button> → “Update the script”.</p>}
            <code className="pair-link">{link}</code>
          <div className="btn-row">
            <button onClick={() => void navigator.clipboard?.writeText(link).then(() => notify('Link copied.')).catch(() => notify('Copy failed.', true))}><Copy size={16} /> Copy link</button>
            {'share' in navigator && <button onClick={() => void (navigator as any).share({ title: 'Order from Flour and Flame Bakery', url: link }).catch(() => {})}><Share2 size={16} /> Share</button>}
            <button onClick={() => window.open(link, '_blank')}>Preview</button>
          </div>
        </>
      ) : link ? (
        <p className="muted small">Your bakery sheet runs an older script. Open <button className="link" onClick={() => go('sheet')}>bakery sheet settings</button> and follow “Update the script” to enable customer orders.</p>
      ) : <p className="muted small">Connect the <button className="link" onClick={() => go('sheet')}>shared bakery sheet</button> to get a customer order link.</p>}
    </section>
  );
}

function OrderCard({ o, plan, shorts = [], onEdit }: { o: Order; plan: PlanRow[]; shorts?: Shortfall[]; onEdit: () => void }) {
  const { recipes, catalog, notify, run } = useApp();
  const { bakery } = useLedger();
  void plan;
  const setStatus = (status: OrderStatus, extra: Record<string, unknown> = {}) => run(async () => { await addEvents([{ type: 'order.status', orderId: o.orderId, status, ...extra } as any]); notify(`${orderLabel(o)} ${STATUS_LABEL[status].toLowerCase()}.`); });
  const confirm = () => {
    if (shorts.length && !window.confirm(`Not enough dough in the freezer: ${shorts.map(s => `${s.recipeTitle} needs ${s.need}, ${s.need - s.short} available`).join('; ')}.\n\nConfirm anyway? You'll need to make ${shorts.map(s => `${s.short} more ${s.recipeTitle}`).join(' and ')}.`)) return;
    void setStatus('confirmed');
  };
  const complete = () => {
    // cost snapshot at sale time: later price changes won't rewrite it
    let total = 0, complete = true;
    for (const i of o.items) { const pp = perPiece(recipes.find(r => r.id === i.recipeId), catalog); if (pp === null) complete = false; else total += pp * i.pieces * i.qty; }
    void setStatus('completed', { costSnapshot: { total: complete ? Math.round(total * 100) / 100 : null, complete } });
  };
  const pay = (paid: boolean) => {
    const method = paid ? (window.prompt('Paid how? (cash, Venmo, Zelle, card…)', 'cash') ?? undefined) : undefined;
    if (paid && method === undefined) return;
    void run(async () => { await addEvents([{ type: 'order.payment', orderId: o.orderId, paid, ...(method ? { method } : {}) } as any]); });
  };
  return (
    <article className={'card order-card s-' + o.status}>
      <div className="order-top">
        <div>
          <strong>{orderLabel(o)} · {o.customer.name}</strong>
          <span className="muted small">{o.customer.contact}{o.source === 'form' ? ' · from order form' : ''}</span>
        </div>
        <span className={'pill small ' + (o.status === 'pending' ? 'warn' : o.status === 'ready' ? 'ok' : '')}>{STATUS_LABEL[o.status]}</span>
      </div>
      <p className="small order-when">📅 {fmtDate(o.pickupDate)}{o.pickupGroup ? ` · ${o.pickupGroup}` : ''}</p>
      <ul className="order-items">{o.items.map(i => <li key={i.productId}>{i.qty} × {i.name} <span className="muted">{money(i.qty * i.unitPrice)}</span></li>)}</ul>
      <p className="order-total"><strong>{money(o.total)}</strong>{o.discount ? <span className="muted small"> (incl. −{money(o.discount)})</span> : null} <span className={'pill small ' + (o.paid ? 'ok' : '')}>{o.paid ? `Paid${o.paidMethod ? ' · ' + o.paidMethod : ''}` : 'Unpaid'}</span></p>
      {o.notes && <p className="muted small">“{o.notes}”</p>}
      {(o.packed || o.handedTo) && !['completed', 'cancelled'].includes(o.status) && <p className="small">{o.packed && <span className="pill small ok">Packed</span>} {o.handedTo && <span className="pill small"><Truck size={12} /> With {o.handedTo}</span>}</p>}
      {shorts.length > 0 && (o.status === 'pending' || RESERVES.includes(o.status)) && (
        <p className="short-note"><AlertTriangle size={15} /><span>{o.status === 'pending' ? 'If confirmed, you\'d need' : 'Make'} {shorts.map(s => `${s.short} more ${s.recipeTitle} dough ball${s.short > 1 ? 's' : ''}`).join(' and ')} <span className="muted small">({shorts.map(s => `${s.need - s.short} of ${s.need} in freezer`).join('; ')})</span></span></p>
      )}
      {o.costSnapshot?.complete && o.costSnapshot.total !== null && <p className="muted small">Ingredient cost at sale: {money(o.costSnapshot.total)} · est. gross profit {money(o.total - o.costSnapshot.total)}</p>}
      <div className="btn-row">
        {o.status === 'pending' && <button className="primary small-btn" onClick={confirm}><CheckCircle2 size={14} /> Confirm</button>}
        {(o.status === 'confirmed' || o.status === 'preparing') && <button className="primary small-btn" onClick={() => void setStatus('ready')}>Baked &amp; ready</button>}
        {o.status === 'ready' && <button className="primary small-btn" onClick={complete}>Picked up</button>}
        {o.status === 'ready' && !o.handedTo && <button className="small-btn" onClick={() => void handOff(o, bakery.pickups.find(p => p.pickupId === o.pickupId || p.name === o.pickupGroup)?.handler, run)}><Truck size={14} /> Handed to…</button>}
        {o.status === 'ready' && o.handedTo && <button className="small-btn" onClick={() => void run(async () => { await addEvents([{ type: 'order.handoff', orderId: o.orderId, to: null } as any]); })}>Undo hand-off</button>}
        {o.status === 'ready' && <button className="small-btn" onClick={() => void setStatus('confirmed')}>Undo ready</button>}
        {o.status === 'completed' && <button className="small-btn" onClick={() => void setStatus('ready')}>Undo pickup</button>}
        {o.status === 'cancelled' && <button className="small-btn" onClick={() => void setStatus('pending')}>Restore</button>}
        <button className="small-btn" onClick={() => pay(!o.paid)}>{o.paid ? 'Mark unpaid' : 'Mark paid'}</button>
        {['pending', 'confirmed', 'preparing'].includes(o.status) && <button className="small-btn" aria-label="Edit order" onClick={onEdit}><Pencil size={14} /></button>}
        {!['cancelled', 'completed'].includes(o.status) && <button className="small-btn" aria-label="Cancel order" onClick={() => { if (window.confirm(`Cancel order ${orderLabel(o)} for ${o.customer.name}?${o.status === 'ready' ? ' The cookies were already baked, so the dough stays counted as used.' : ' Any reserved dough is released.'}`)) void setStatus('cancelled'); }}><X size={14} /></button>}
      </div>
    </article>
  );
}

function OrderDialog({ order, onClose, onSave }: { order: Order | null; onClose: () => void; onSave: (evs: any[]) => Promise<void> }) {
  const { bakery } = useLedger();
  const products = bakery.products.filter(p => p.active || order?.items.some(i => i.productId === p.productId));
  const [name, setName] = useState(order?.customer.name ?? '');
  const [contact, setContact] = useState(order?.customer.contact ?? '');
  const [date, setDate] = useState(order?.pickupDate ?? '');
  const [group, setGroup] = useState(order?.pickupGroup ?? '');
  const [pickupId, setPickupId] = useState(order?.pickupId ?? '');
  const [choice, setChoice] = useState(order?.pickupId ?? (order?.pickupGroup ? '__other' : ''));
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries((order?.items ?? []).map(i => [i.productId, i.qty])));
  const [discount, setDiscount] = useState(order?.discount ? String(order.discount) : '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [status, setStatus] = useState<OrderStatus>('confirmed');
  const [paid, setPaid] = useState(false);
  const customers = useMemo(() => [...new Set(bakery.orders.map(o => o.customer.name))], [bakery.orders]);
  const groups = useMemo(() => [...new Set(bakery.orders.map(o => o.pickupGroup).filter(Boolean) as string[])], [bakery.orders]);
  const items: OrderItem[] = products.filter(p => (qty[p.productId] ?? 0) > 0).map(p => {
    const old = order?.items.find(i => i.productId === p.productId);
    return { productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty: qty[p.productId], unitPrice: old?.unitPrice ?? p.price };
  });
  const disc = Number(discount) > 0 ? Math.round(Number(discount) * 100) / 100 : 0;
  const total = Math.max(0, Math.round((itemsTotal(items) - disc) * 100) / 100);
  const valid = name.trim() && items.length > 0;
  // live freezer check (counts this order's own reservation back in when editing)
  const own = order && RESERVES.includes(order.status) ? ballsFor(order.items) : {};
  const needs = Object.entries(ballsFor(items)).map(([id, n]) => {
    const row = bakery.plan.find(r => r.recipeId === id);
    const avail = Math.max(0, (row?.available ?? 0) + (own[id] ?? 0));
    return { id, title: items.find(i => i.recipeId === id)!.recipeTitle, n, avail };
  }).filter(x => x.n > x.avail);
  function save() {
    const base = { customer: { name: name.trim(), ...(contact.trim() ? { contact: contact.trim() } : {}) }, items, ...(date ? { pickupDate: date } : {}), ...(group.trim() ? { pickupGroup: group.trim() } : {}), ...(pickupId ? { pickupId } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(disc ? { discount: disc } : {}), total };
    if (order) return onSave([{ type: 'order.update', orderId: order.orderId, patch: { pickupDate: undefined, pickupGroup: undefined, pickupId: undefined, notes: undefined, discount: undefined, ...base } }]);
    const orderId = crypto.randomUUID();
    const evs: any[] = [{ type: 'order.create', orderId, source: 'manual', status, ...base }];
    if (paid) evs.push({ type: 'order.payment', orderId, paid: true, method: 'cash' });
    return onSave(evs);
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="order-title">
      <div className="modal wide">
        <h3 id="order-title">{order ? `Edit order ${orderLabel(order)}` : 'New order'}</h3>
        <div className="form-grid">
          <label className="field">Customer name<input list="customers" value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field">Contact (optional)<input value={contact} onChange={e => setContact(e.target.value)} placeholder="phone or email" /></label>
          <label className="field">Pickup date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          {bakery.pickups.length > 0 ? (
            <label className="field">Pickup option<select value={choice} onChange={e => { const v = e.target.value; setChoice(v); setPickupId(v === '__other' ? '' : v); setGroup(v === '__other' || !v ? '' : bakery.pickups.find(p => p.pickupId === v)?.name ?? ''); }}>
              <option value="">(none)</option>
              {bakery.pickups.filter(p => p.active || p.pickupId === pickupId).map(p => <option key={p.pickupId} value={p.pickupId}>{p.name}</option>)}
              <option value="__other">Other…</option>
            </select>{choice === '__other' && <input aria-label="Other pickup place" list="groups" value={group} onChange={e => setGroup(e.target.value)} placeholder="Where?" />}</label>
          ) : <label className="field">Pickup place / group<input list="groups" value={group} onChange={e => setGroup(e.target.value)} placeholder="Work, Mom & Dad's, porch…" /></label>}
        </div>
        <datalist id="customers">{customers.map(c => <option key={c} value={c} />)}</datalist>
        <datalist id="groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        <div className="order-picker">
          {products.map(p => (
            <div key={p.productId} className="pick-row">
              <span><strong>{p.recipeTitle}</strong><span className="muted small"> {SIZES.find(s => s.pieces === p.pieces)?.label ?? `${p.pieces}-pack`} · {money(p.price)}</span></span>
              <span className="stepper small">
                <button type="button" aria-label={`Fewer ${p.name}`} onClick={() => setQty({ ...qty, [p.productId]: Math.max(0, (qty[p.productId] ?? 0) - 1) })}><Minus size={16} /></button>
                <input aria-label={`Quantity ${p.name}`} inputMode="numeric" value={qty[p.productId] ?? 0} onChange={e => setQty({ ...qty, [p.productId]: Math.max(0, Math.min(50, Math.round(Number(e.target.value)) || 0)) })} />
                <button type="button" aria-label={`More ${p.name}`} onClick={() => setQty({ ...qty, [p.productId]: Math.min(50, (qty[p.productId] ?? 0) + 1) })}><Plus size={16} /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">Discount ($, optional)<input inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} /></label>
          {!order && <label className="field">Status<select value={status} onChange={e => setStatus(e.target.value as OrderStatus)}><option value="confirmed">Confirmed (reserve dough)</option><option value="pending">Request (not reserved yet)</option></select></label>}
        </div>
        <label className="field">Notes (optional)<input value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {!order && <label className="agree"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> Already paid</label>}
        <p className="order-total">Total: <strong>{money(total)}</strong> · {Object.values(ballsFor(items)).reduce((a, b) => a + b, 0)} cookies</p>
        {needs.length > 0 && <p className="short-note"><AlertTriangle size={15} /><span>Not enough in the freezer: {needs.map(x => `${x.title} needs ${x.n}, ${x.avail} available (make ${x.n - x.avail} more)`).join('; ')}. You can still save it.</span></p>}
        <div className="btn-row">
          <button className="primary" disabled={!valid} onClick={() => void save()}>{order ? 'Save changes' : 'Save order'}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Planning ----------------
function PlanTab() {
  const { bakery } = useLedger();
  const open = bakery.orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
  const byDate = new Map<string, Order[]>();
  for (const o of open) { const k = o.pickupDate ?? ''; byDate.set(k, [...(byDate.get(k) ?? []), o]); }
  return (
    <>
      <section className="card">
        <h3><ClipboardList size={18} /> Have vs. ordered (dough balls)</h3>
        {!bakery.plan.length ? <p className="muted">Nothing in the freezer or on order yet.</p> : (
          <div className="plan-table" role="table">
            <div className="plan-row head" role="row"><span>Recipe</span><span>Freezer</span><span>Confirmed</span><span>Available</span><span>Requests</span><span>Make</span></div>
            {bakery.plan.map(r => (
              <div key={r.recipeId} className={'plan-row' + (r.makeMore ? ' short' : '')} role="row">
                <span><strong>{r.recipeTitle}</strong></span>
                <span data-label="In freezer">{r.inFreezer}</span>
                <span data-label="Confirmed">{r.reserved}</span>
                <span data-label="Available" className={r.available < 0 ? 'warn-text' : ''}>{r.available}</span>
                <span data-label="Requests">{r.pending}</span>
                <span data-label="Make more">{r.makeMore ? <b className="warn-text">{r.makeMore}</b> : '✓'}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">Confirmed orders hold dough balls; marking an order “Baked & ready” takes them out of the freezer. “Make” covers confirmed orders plus requests.</p>
      </section>
      <section className="card">
        <h3>Upcoming pickups</h3>
        {!open.length ? <p className="muted">No open orders.</p> : [...byDate.entries()].sort(([a], [b]) => (a || '9999').localeCompare(b || '9999')).map(([d, list]) => (
          <div key={d} className="pickup-day">
            <strong>{fmtDate(d || undefined)}</strong>
            <ul>{list.map(o => <li key={o.orderId}>{orderLabel(o)} {o.customer.name}{o.pickupGroup ? ` (${o.pickupGroup})` : ''}: {o.items.map(i => `${i.qty}×${i.pieces === 12 ? 'dozen' : i.pieces === 6 ? '½ dozen' : i.pieces} ${i.recipeTitle}`).join(', ')} · <span className="muted">{STATUS_LABEL[o.status]}</span></li>)}</ul>
          </div>
        ))}
      </section>
    </>
  );
}

// ---------------- Menu ----------------
function MenuTab() {
  const { recipes, catalog, packaging, run, refresh, notify } = useApp();
  const { bakery } = useLedger();
  const cookies = recipes.filter(r => r.category === 'Cookies' || bakery.products.some(p => p.recipeId === r.id));
  return (
    <>
      <p className="muted">Choose what you sell. Prices are per box; costs are estimates from your price list (ingredients{' '}+ packaging if set). Only <b>Approved</b> recipes can be sold.</p>
      {!cookies.length && <p className="muted">No cookie recipes yet.</p>}
      <div className="menu-grid">
        {cookies.map(r => {
          const pp = perPiece(r, catalog);
          return (
            <section key={r.id} className="card menu-card">
              <div className="order-top"><strong>{r.title}</strong><span className={'pill small ' + (r.status === 'Approved' ? 'ok' : '')}>{r.status}</span></div>
              {r.status !== 'Approved' ? (
                <div>
                  <p className="muted small">Not approved for sale yet.</p>
                  <button className="small-btn" onClick={() => { if (window.confirm(`Mark “${r.title}” as Approved for sale? This saves a new version of the recipe.`)) void run(async () => { await writeRecipe({ ...r, status: 'Approved' }, r.version); await refresh(); notify(`${r.title} approved for sale.`); }); }}>Mark approved</button>
                </div>
              ) : SIZES.map(s => <ProductRow key={s.pieces} recipe={r} pieces={s.pieces} label={s.label} existing={bakery.products.find(p => p.productId === `${r.id}-${s.pieces}`)} cost={pp !== null ? pp * s.pieces + (packaging[r.id] ?? 0) : null} />)}
            </section>
          );
        })}
      </div>
    </>
  );
}

function ProductRow({ recipe, pieces, label, existing, cost }: { recipe: Recipe; pieces: number; label: string; existing?: Product; cost: number | null }) {
  const { run, notify } = useApp();
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const p = Number(price);
  const save = (active: boolean) => {
    if (!(p > 0)) { notify('Enter a price.', true); return; }
    const product: Product = { productId: `${recipe.id}-${pieces}`, name: `${label}: ${recipe.title}`, recipeId: recipe.id, recipeTitle: recipe.title, pieces, price: Math.round(p * 100) / 100, active };
    void run(async () => { await addEvents([{ type: 'product.upsert', product } as any]); notify(active ? `${product.name} is on the menu at ${money(product.price)}.` : `${product.name} hidden from the menu.`); });
  };
  const margin = cost !== null && p > 0 ? (p - cost) / p : null;
  return (
    <div className="product-row">
      <span className="product-label"><Store size={14} /> {label} <span className="muted small">({pieces})</span></span>
      <label className="inline">$<input aria-label={`${label} price for ${recipe.title}`} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></label>
      {cost !== null && <span className="muted small">cost ≈ {money(cost)}{margin !== null ? ` · ${Math.round(margin * 100)}% margin` : ''}</span>}
      <span className="btn-row">
        <button className="small-btn primary" onClick={() => save(true)}>{existing?.active ? 'Update' : 'Add to menu'}</button>
        {existing?.active && <button className="small-btn" onClick={() => save(false)}>Hide</button>}
      </span>
    </div>
  );
}
