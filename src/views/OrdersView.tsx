import { Printer } from 'lucide-react';
import { QrCode, Trash2 } from 'lucide-react';
import { CalendarDays, CheckCircle2, ClipboardList, Copy, Link2, Minus, Pencil, Plus, Share2, ShoppingBag, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp, useRoute } from '../app-context';
import { addEvents, getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';
import { doughUsedBy, ballsFor, itemsTotal, itemText, orderCoverage, orderLabel, orderParts, partTitle, productSize, RESERVES, STATUS_LABEL, type Order, type PlanRow, type Shortfall } from '../bakery';
import { AlertTriangle } from 'lucide-react';
import type { OrderItem, OrderStatus } from '../freezer';
import { money } from '../costing';
import { SheetStatus } from './FreezerView';
import { MixPicker, mixParts, mixTotal, type MixValue } from '../components/MixPicker';
import { Picture } from '../components/MenuPicture';
import { handOff, PackingTab, PickupTab } from './OrdersExtra';
import { MenuTab } from './OrdersMenu';
import { pickedUpEvent, readyEvent } from '../feedback';
import { celebrateAt } from '../celebrate';
import { customerKey } from '../reports';
import { avgRating, Stars } from '../components/Stars';
import { CustomersTab, ReportsTab } from './OrdersInsights';
import { Truck } from 'lucide-react';
import { TestOrderButton } from '../components/TestOrderButton';
import { loyaltyEvery, loyaltyOn, loyaltyRows, progressText, rewardValue } from '../loyalty';

const fmtDate = (d?: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date');

export function customerLink(): string | null {
  const url = getSheetConfig().url ?? '';
  const m = url.match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
  return m ? `${location.origin}${location.pathname}#/order-form/${m[1]}` : null;
}


export function OrdersView() {
  const [, tab = 'list'] = useRoute();
  const { connected } = useLedger();
  return (
    <div className="page orders">
      <div className="page-head left-group"><h2><ShoppingBag size={24} /> Orders</h2><button className="cards-btn" onClick={() => go('cards')}><Printer size={18} /> Order cards</button><TestOrderButton /></div>
      <div className="tabs" role="tablist">
        {[['list', 'Orders'], ['pack', 'Packing'], ['plan', 'Planning'], ['menu', 'Menu'], ['customers', 'Customers'], ['reports', 'Reports'], ['form', 'Pickup & form']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k === 'list' ? 'orders' : 'orders/' + k)}>{l}</button>)}
      </div>
      <SheetStatus />
      {!connected && <p className="muted small">Orders work on this device now. Connect the shared bakery sheet to see them on both devices and to receive customer orders.</p>}
      {tab === 'menu' ? <MenuTab /> : tab === 'plan' ? <PlanTab /> : tab === 'pack' ? <PackingTab /> : tab === 'form' ? <PickupTab linkCard={<CustomerLinkCard />} /> : tab === 'customers' ? <CustomersTab /> : tab === 'reports' ? <ReportsTab /> : <OrdersTab />}
    </div>
  );
}

// ---------------- Orders ----------------
function OrdersTab() {
  const { bakery } = useLedger();
  const { notify, run } = useApp();
  const [editing, setEditing] = useState<Order | 'new' | null>(null);
  const [clearing, setClearing] = useState(false);
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

      {bakery.orders.length > 0 && <div className="btn-row clear-row"><button className="small-btn danger-outline" onClick={() => setClearing(true)}><Trash2 size={14} /> Clear orders…</button>{bakery.shop.emailsPaused && <span className="pill small warn">🧪 Testing mode: emails paused</span>}</div>}
      {clearing && <ClearOrdersDialog orders={bakery.orders} onClose={() => setClearing(false)} />}
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
            <button onClick={() => go('cards')}><QrCode size={16} /> Print tuck-in cards</button>
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
  const [deleting, setDeleting] = useState<Order | null>(null);
  void plan;
  const setStatus = (status: OrderStatus, extra: Record<string, unknown> = {}) => run(async () => { await addEvents([{ type: 'order.status', orderId: o.orderId, status, ...extra } as any]); notify(`${orderLabel(o)} ${STATUS_LABEL[status].toLowerCase()}.`); });
  const confirm = (e?: React.MouseEvent) => {
    const target = e?.currentTarget ?? null;
    if (shorts.length && !window.confirm(`Not enough dough in the freezer: ${shorts.map(s => `${s.recipeTitle} needs ${s.need}, ${s.need - s.short} available`).join('; ')}.\n\nConfirm anyway? You'll need to make ${shorts.map(s => `${s.short} more ${s.recipeTitle}`).join(' and ')}.`)) return;
    celebrateAt(target);
    void setStatus('confirmed');
  };
  const complete = (e?: React.MouseEvent) => { celebrateAt(e?.currentTarget ?? null); void run(async () => { await addEvents([await pickedUpEvent(o, recipes, catalog)]); notify(`${orderLabel(o)} picked up.`); }); };
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
          <span className="muted small">{o.customer.contact}{o.source === 'form' ? ' · from order form' : ''}{o.heardFrom ? ` · heard via ${o.heardFrom}` : ''}</span>
        </div>
        <span className={'pill small ' + (o.status === 'pending' ? 'warn' : o.status === 'ready' ? 'ok' : '')}>{STATUS_LABEL[o.status]}</span>
      </div>
      <p className="small order-when">📅 {fmtDate(o.pickupDate)}{o.pickupGroup ? ` · ${o.pickupGroup}` : ''}</p>
      <ul className="order-items">{o.items.map((i, k) => <li key={i.productId + k}>{itemText(i)} <span className="muted">{money(i.qty * i.unitPrice)}</span></li>)}</ul>
      <p className="order-total"><strong>{money(o.total)}</strong>{o.discount ? <span className="muted small"> (incl. −{money(o.discount)})</span> : null} <span className={'pill small ' + (o.paid ? 'ok' : '')}>{o.paid ? `Paid${o.paidMethod ? ' · ' + o.paidMethod : ''}` : 'Unpaid'}</span></p>
      {o.notes && <p className="muted small">“{o.notes}”</p>}
      <LoyaltyLine o={o} />
      {o.test && <p className="small"><span className="pill small warn">🧪 Test order</span></p>}
      {o.sample && <p className="small"><span className="pill small tasting">🎁 Tasting box</span></p>}
      {o.gift && <p className="small gift-line">🎁 Gift for <b>{o.gift.to}</b>{o.gift.message ? <> · “{o.gift.message}”</> : null}</p>}
      {bakery.notes[customerKey(o)] && <p className="small note-line">📝 {bakery.notes[customerKey(o)]}</p>}
      {o.feedback && <p className="small feedback-line"><Stars value={avgRating(o.feedback.ratings)} /> {o.feedback.again === 'yes' ? 'Would order again' : o.feedback.again === 'maybe' ? 'Maybe again' : o.feedback.again === 'no' ? 'Wouldn’t order again' : ''}{o.feedback.comment ? <span className="muted"> · “{o.feedback.comment}”</span> : null}</p>}
      {(o.packed || o.handedTo) && !['completed', 'cancelled'].includes(o.status) && <p className="small">{o.packed && <span className="pill small ok">Packed</span>} {o.handedTo && <span className="pill small"><Truck size={12} /> With {o.handedTo}</span>}</p>}
      {shorts.length > 0 && (o.status === 'pending' || RESERVES.includes(o.status)) && (
        <p className="short-note"><AlertTriangle size={15} /><span>{o.status === 'pending' ? 'If confirmed, you\'d need' : 'Make'} {shorts.map(s => `${s.short} more ${s.recipeTitle} dough ball${s.short > 1 ? 's' : ''}`).join(' and ')} <span className="muted small">({shorts.map(s => `${s.need - s.short} of ${s.need} in freezer`).join('; ')})</span></span></p>
      )}
      {o.costSnapshot?.complete && o.costSnapshot.total !== null && <p className="muted small">Ingredient cost at sale: {money(o.costSnapshot.total)} · est. gross profit {money(o.total - o.costSnapshot.total)}</p>}
      <div className="btn-row">
        {o.status === 'pending' && <button className="primary small-btn" onClick={e => confirm(e)}><CheckCircle2 size={14} /> Confirm</button>}
        {(o.status === 'confirmed' || o.status === 'preparing') && <button className="primary small-btn" onClick={e => { celebrateAt(e.currentTarget); void run(async () => { await addEvents([readyEvent(o)]); notify(`${orderLabel(o)} ready for pickup.`); }); }}>Baked &amp; ready</button>}
        {o.status === 'ready' && <button className="primary small-btn" onClick={e => complete(e)}>Picked up</button>}
        {o.status === 'ready' && !o.handedTo && <button className="small-btn" onClick={() => void handOff(o, bakery.pickups.find(p => p.pickupId === o.pickupId || p.name === o.pickupGroup)?.handler, run)}><Truck size={14} /> Handed to…</button>}
        {o.status === 'ready' && o.handedTo && <button className="small-btn" onClick={() => void run(async () => { await addEvents([{ type: 'order.handoff', orderId: o.orderId, to: null } as any]); })}>Undo hand-off</button>}
        {o.status === 'ready' && <button className="small-btn" onClick={() => void setStatus('confirmed')}>Undo ready</button>}
        {o.status === 'completed' && <button className="small-btn" onClick={() => void setStatus('ready')}>Undo pickup</button>}
        {o.status === 'cancelled' && <button className="small-btn" onClick={() => void setStatus('pending')}>Restore</button>}
        <button className="small-btn" onClick={() => pay(!o.paid)}>{o.paid ? 'Mark unpaid' : 'Mark paid'}</button>
        {['pending', 'confirmed', 'preparing'].includes(o.status) && <button className="small-btn" aria-label="Edit order" onClick={onEdit}><Pencil size={14} /></button>}
        <button className="small-btn" aria-label={`Delete order ${orderLabel(o)}`} title="Delete (e.g. a test order)" onClick={() => setDeleting(o)}><Trash2 size={14} /></button>
        {!['cancelled', 'completed'].includes(o.status) && <button className="small-btn" aria-label="Cancel order" onClick={() => { if (window.confirm(`Cancel order ${orderLabel(o)} for ${o.customer.name}?${o.status === 'ready' ? ' The cookies were already baked, so the dough stays counted as used.' : ' Any reserved dough is released.'}`)) void setStatus('cancelled'); }}><X size={14} /></button>}
      </div>
      {deleting && <ClearOrdersDialog only={[deleting]} orders={[deleting]} onClose={() => setDeleting(null)} />}
    </article>
  );
}

/** Delete orders everywhere (test orders). Optionally keep the dough they used counted as used. */
const OPEN_STATUSES = ['pending', 'confirmed', 'preparing', 'ready'];
/** Loyalty and pickup-address status on an order card. */
function LoyaltyLine({ o }: { o: Order }) {
  const { bakery } = useLedger();
  const { run, notify } = useApp();
  const every = loyaltyEvery(bakery.shop);
  const rows = useMemo(() => loyaltyRows(bakery.orders, every), [bakery.orders, every]);
  if (o.test || o.sample) return null;
  const open = OPEN_STATUSES.includes(o.status);
  const r = rows.get(customerKey(o));
  const value = rewardValue(o);
  const patch = (on: boolean) => run(async () => {
    const v = value ?? 0, discount = Math.max(0, Math.round(((o.discount ?? 0) + (on ? v : -v)) * 100) / 100);
    await addEvents([{ type: 'order.update', orderId: o.orderId, patch: { reward: on, rewardAsk: undefined, discount: discount || undefined, total: Math.max(0, Math.round((o.total + (on ? -v : v)) * 100) / 100) } } as any]);
    notify(on ? `Free half dozen applied to ${orderLabel(o)} (−${money(v)}).` : `Free half dozen removed from ${orderLabel(o)}.`);
  });
  const lines: React.ReactNode[] = [];
  if (loyaltyOn(bakery.shop) && r) {
    if (o.reward) lines.push(<span key="r" className="pill small loyal">🎁 Free half dozen applied{value ? ` (−${money(value)})` : ''}</span>, open && <button key="u" className="small-btn" onClick={() => void patch(false)}>Undo</button>);
    else if (open && r.available > 0) lines.push(<span key="a" className="pill small loyal">🎁 Has a free half dozen to use</span>, value ? <button key="b" className="small-btn" onClick={() => void patch(true)}>Apply it (−{money(value)})</button> : <span key="c" className="muted small">Add a half dozen to this order to use it.</span>);
    if (o.rewardAsk === 'none') lines.push(<span key="n" className="muted small">Asked to use a free half dozen, but none was found for this email.</span>);
    if (bakery.loyaltyMailed.includes(o.orderId)) lines.push(<span key="m" className="pill small loyal">🎁 Earned a free half dozen · email sent</span>);
    else if (r.earner?.orderId === o.orderId) lines.push(<span key="e" className="pill small loyal glow">✨ Picking this up earns a free half dozen</span>);
    else if (open && !o.reward && r.available === 0 && r.key.includes('@')) lines.push(<span key="p" className="muted small">Loyalty: {progressText(r, every)}</span>);
  }
  if (bakery.shop.address && open) lines.push(bakery.addressSent.includes(o.orderId) ? <span key="ad" className="pill small ok">📍 Address emailed</span> : <span key="ad" className="muted small">📍 {o.paid || !(o.total > 0) ? (o.status === 'pending' ? 'Address goes out when you confirm' : 'Address email on its way') : 'Address goes out once paid'}</span>);
  return lines.length ? <div className="loyal-line">{lines}</div> : null;
}

function ClearOrdersDialog({ only, orders, onClose }: { only?: Order[]; orders: Order[]; onClose: () => void }) {
  const { run, notify } = useApp();
  const tests = orders.filter(o => o.test);
  const [which, setWhich] = useState<'all' | 'done' | 'test'>(tests.length ? 'test' : 'all');
  const [sure, setSure] = useState(false);
  const [keepDough, setKeepDough] = useState(false);
  const list = only ?? (which === 'test' ? tests : which === 'all' ? orders : orders.filter(o => o.status === 'completed' || o.status === 'cancelled'));
  const used = Object.entries(list.filter(doughUsedBy).reduce((m, o) => { for (const p of orderParts(o.items)) if (p.dough) m[p.recipeId] = { title: p.recipeTitle, n: (m[p.recipeId]?.n ?? 0) + p.count }; return m; }, {} as Record<string, { title: string; n: number }>));
  const go_ = () => void run(async () => {
    const evs: any[] = [{ type: 'order.delete', orderIds: list.map(o => o.orderId) }];
    if (keepDough) for (const [recipeId, u] of used) evs.push({ type: 'freezer.remove', recipeId, recipeTitle: u.title, count: u.n, reason: 'baked', note: 'Dough used by deleted orders' });
    await addEvents(evs);
    notify(list.length === 1 ? `Order ${orderLabel(list[0])} deleted.` : `${list.length} orders deleted.`);
    onClose();
  });
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-title">
      <div className="modal">
        <h3 id="clear-title"><Trash2 size={18} /> {only ? `Delete order ${orderLabel(only[0])}?` : 'Clear orders'}</h3>
        {!only && (
          <div className="seg" role="radiogroup" aria-label="Which orders">
            {tests.length > 0 && <button role="radio" aria-checked={which === 'test'} className={which === 'test' ? 'on' : ''} onClick={() => setWhich('test')}>🧪 Test orders ({tests.length})</button>}
            <button role="radio" aria-checked={which === 'all'} className={which === 'all' ? 'on' : ''} onClick={() => setWhich('all')}>All orders ({orders.length})</button>
            <button role="radio" aria-checked={which === 'done'} className={which === 'done' ? 'on' : ''} onClick={() => setWhich('done')}>Picked up &amp; cancelled ({orders.filter(o => o.status === 'completed' || o.status === 'cancelled').length})</button>
          </div>
        )}
        <p className="small">{only ? `${only[0].customer.name}: ${only[0].items.map(itemText).join(', ')}.` : `${list.length} order${list.length !== 1 ? 's' : ''} will disappear from Orders, Packing, Planning, Customers and Reports on both devices.`} Use this for test orders. For a real order that fell through, use Cancel instead so it stays in your history.</p>
        {used.length > 0 && <>
          <p className="small">{only ? 'This order' : 'These orders'} took dough out of the freezer: {used.map(([, u]) => `${u.n} ${u.title}`).join(', ')}. Deleting {only ? 'it' : 'them'} puts that dough back in the freezer count.</p>
          <label className="agree"><input type="checkbox" checked={keepDough} onChange={e => setKeepDough(e.target.checked)} /> The cookies were really baked: keep that dough counted as used</label>
        </>}
        {!only && <label className="agree"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} /> Yes, delete {list.length} order{list.length !== 1 ? 's' : ''}</label>}
        <div className="btn-row">
          <button className="danger" disabled={!list.length || (!only && !sure)} onClick={go_}><Trash2 size={16} /> Delete</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function OrderDialog({ order, preset, onClose, onSave }: { order: Order | null; preset?: { name: string; contact?: string }; onClose: () => void; onSave: (evs: any[]) => Promise<void> }) {
  const { bakery } = useLedger();
  const products = bakery.products.filter(p => p.kind !== 'mixed' && (p.active || order?.items.some(i => i.productId === p.productId)));
  const mixedProducts = bakery.products.filter(p => p.kind === 'mixed' && (p.active || order?.items.some(i => i.productId === p.productId)));
  const [boxes, setBoxes] = useState<{ key: string; productId: string; mix: MixValue; qty: number; unitPrice?: number }[]>(() =>
    (order?.items ?? []).filter(i => i.mix?.length).map(i => ({ key: crypto.randomUUID(), productId: i.productId, qty: i.qty, unitPrice: i.unitPrice, mix: Object.fromEntries(i.mix!.map(m => [m.recipeId, m.count])) })));
  const [name, setName] = useState(order?.customer.name ?? preset?.name ?? '');
  const [contact, setContact] = useState(order?.customer.contact ?? preset?.contact ?? '');
  const [date, setDate] = useState(order?.pickupDate ?? '');
  const [group, setGroup] = useState(order?.pickupGroup ?? '');
  const [pickupId, setPickupId] = useState(order?.pickupId ?? '');
  const [choice, setChoice] = useState(order?.pickupId ?? (order?.pickupGroup ? '__other' : ''));
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries((order?.items ?? []).filter(i => !i.mix?.length).map(i => [i.productId, i.qty])));
  const [discount, setDiscount] = useState(order?.discount ? String(order.discount) : '');
  const [sample, setSample] = useState(!!order?.sample);
  const [charge, setCharge] = useState(order?.sample ? String(order.total) : '0');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [status, setStatus] = useState<OrderStatus>('confirmed');
  const [paid, setPaid] = useState(false);
  const customers = useMemo(() => [...new Set(bakery.orders.map(o => o.customer.name))], [bakery.orders]);
  const groups = useMemo(() => [...new Set(bakery.orders.map(o => o.pickupGroup).filter(Boolean) as string[])], [bakery.orders]);
  const singles: OrderItem[] = products.filter(p => (qty[p.productId] ?? 0) > 0).map(p => {
    const old = order?.items.find(i => i.productId === p.productId && !i.mix?.length);
    return { productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty: qty[p.productId], unitPrice: old?.unitPrice ?? p.price, dough: p.dough !== false };
  });
  const boxItems: OrderItem[] = boxes.flatMap(b => {
    const p = bakery.products.find(x => x.productId === b.productId);
    if (!p || mixTotal(b.mix) !== p.pieces) return [];
    return [{ productId: p.productId, name: p.name, recipeId: 'mixed', recipeTitle: p.name, pieces: p.pieces, qty: b.qty, unitPrice: b.unitPrice ?? p.price, mix: mixParts(p.options ?? [], b.mix) }];
  });
  const items: OrderItem[] = [...singles, ...boxItems];
  const boxesIncomplete = boxes.some(b => { const p = bakery.products.find(x => x.productId === b.productId); return !p || mixTotal(b.mix) !== p.pieces; });
  const sub = itemsTotal(items);
  const disc = sample ? Math.max(0, Math.round((sub - Math.min(sub, Number(charge) || 0)) * 100) / 100) : Number(discount) > 0 ? Math.round(Number(discount) * 100) / 100 : 0;
  const total = Math.max(0, Math.round((sub - disc) * 100) / 100);
  const valid = name.trim() && items.length > 0 && !boxesIncomplete;
  // live freezer check (counts this order's own reservation back in when editing)
  const own = order && RESERVES.includes(order.status) ? ballsFor(order.items) : {};
  const needs = Object.entries(ballsFor(items)).map(([id, n]) => {
    const row = bakery.plan.find(r => r.recipeId === id);
    const avail = Math.max(0, (row?.available ?? 0) + (own[id] ?? 0));
    return { id, title: partTitle(items, id), n, avail };
  }).filter(x => x.n > x.avail);
  function save() {
    const base = { customer: { name: name.trim(), ...(contact.trim() ? { contact: contact.trim() } : {}) }, items, ...(date ? { pickupDate: date } : {}), ...(group.trim() ? { pickupGroup: group.trim() } : {}), ...(pickupId ? { pickupId } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(disc ? { discount: disc } : {}), ...(sample ? { sample: true } : {}), total };
    if (order) return onSave([{ type: 'order.update', orderId: order.orderId, patch: { pickupDate: undefined, pickupGroup: undefined, pickupId: undefined, sample: undefined, notes: undefined, discount: undefined, ...base } }]);
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
              <span><strong>{p.recipeTitle}</strong><span className="muted small"> {productSize(p)} · {money(p.price)}</span></span>
              <span className="stepper small">
                <button type="button" aria-label={`Fewer ${p.name}`} onClick={() => setQty({ ...qty, [p.productId]: Math.max(0, (qty[p.productId] ?? 0) - 1) })}><Minus size={16} /></button>
                <input aria-label={`Quantity ${p.name}`} inputMode="numeric" value={qty[p.productId] ?? 0} onChange={e => setQty({ ...qty, [p.productId]: Math.max(0, Math.min(50, Math.round(Number(e.target.value)) || 0)) })} />
                <button type="button" aria-label={`More ${p.name}`} onClick={() => setQty({ ...qty, [p.productId]: Math.min(50, (qty[p.productId] ?? 0) + 1) })}><Plus size={16} /></button>
              </span>
            </div>
          ))}
        </div>
        {mixedProducts.length > 0 && (
          <div className="mixed-lines">
            {boxes.map((b, idx) => {
              const p = bakery.products.find(x => x.productId === b.productId);
              if (!p) return null;
              const label = `${p.name} ${idx + 1}`;
              return (
                <div key={b.key} className="mixed-line card">
                  <div className="order-top"><strong>{p.name} <span className="muted small">· {money(b.unitPrice ?? p.price)} each</span></strong>
                    <span className="btn-row">
                      <span className="stepper small">
                        <button type="button" aria-label={`Fewer boxes of ${label}`} onClick={() => setBoxes(boxes.map(x => x.key === b.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Minus size={16} /></button>
                        <output>{b.qty}</output>
                        <button type="button" aria-label={`More boxes of ${label}`} onClick={() => setBoxes(boxes.map(x => x.key === b.key ? { ...x, qty: Math.min(20, x.qty + 1) } : x))}><Plus size={16} /></button>
                      </span>
                      <button type="button" className="small-btn" aria-label={`Remove ${label}`} onClick={() => setBoxes(boxes.filter(x => x.key !== b.key))}><X size={14} /></button>
                    </span>
                  </div>
                  <MixPicker label={label} options={p.options ?? []} pictureOf={o => <Picture look={bakery.looks[o.recipeId]} title={o.recipeTitle} seed={o.recipeId} size={36} />} pieces={p.pieces} step={p.step} value={b.mix} onChange={mix => setBoxes(boxes.map(x => x.key === b.key ? { ...x, mix } : x))} />
                </div>
              );
            })}
            <div className="btn-row">{mixedProducts.filter(p => p.active).map(p => <button key={p.productId} type="button" onClick={() => setBoxes([...boxes, { key: crypto.randomUUID(), productId: p.productId, mix: {}, qty: 1 }])}><Plus size={16} /> {p.name}</button>)}</div>
          </div>
        )}
        <div className="form-grid">
          {sample ? <label className="field">Charge for this tasting box ($)<input inputMode="decimal" value={charge} onChange={e => setCharge(e.target.value)} /></label>
            : <label className="field">Discount ($, optional)<input inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} /></label>}
          {!order && <label className="field">Status<select value={status} onChange={e => setStatus(e.target.value as OrderStatus)}><option value="confirmed">Confirmed (reserve dough)</option><option value="pending">Request (not reserved yet)</option></select></label>}
        </div>
        <label className="agree tasting-toggle"><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)} /> 🎁 Tasting box (a free or discounted sample). Kept out of sales totals; the app tracks whether they come back and order.</label>
        <label className="field">Notes (optional)<input value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {!order && <label className="agree"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> Already paid</label>}
        <p className="order-total">Total: <strong>{money(total)}</strong> · {orderParts(items).reduce((a, b) => a + b.count, 0)} pieces</p>
        {boxesIncomplete && <p className="muted small">Finish choosing the flavours in each mixed box to save.</p>}
        {needs.length > 0 && <p className="short-note"><AlertTriangle size={15} /><span>Not enough in the freezer: {needs.map(x => `${x.title} needs ${x.n}, ${x.avail} available (make ${x.n - x.avail} more)`).join('; ')}. You can still save it.</span></p>}
        <div className="btn-row">
          <button className="primary" disabled={!valid} onClick={() => void save()}>{order ? 'Save changes' : 'Save order'}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CapacityBar({ day }: { day: string }) {
  const { bakery } = useLedger();
  const lim = bakery.shop.limit!;
  const week = (x: string) => { const d = new Date(x + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toDateString(); };
  const used = bakery.orders.filter(o => o.status !== 'cancelled' && o.pickupDate && (lim.per === 'day' ? o.pickupDate === day : week(o.pickupDate) === week(day))).reduce((t, o) => t + orderParts(o.items).reduce((a, p) => a + p.count, 0), 0);
  const pct = Math.min(100, (used / lim.pieces) * 100);
  return <span className={'cap-bar' + (used >= lim.pieces ? ' full' : '')} title={`${used} of ${lim.pieces} pieces ${lim.per === 'day' ? 'that day' : 'that week'}`}><span className="cap-track"><i style={{ width: `${pct}%` }} /></span><em>{used}/{lim.pieces}{lim.per === 'week' ? ' this week' : ''}</em></span>;
}

// ---------------- Planning ----------------
function PlanTab() {
  const { bakery } = useLedger();
  const open = bakery.orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
  const byDate = new Map<string, Order[]>();
  for (const o of open) { const k = o.pickupDate ?? ''; byDate.set(k, [...(byDate.get(k) ?? []), o]); }
  return (
    <>
      <div className="btn-row"><button className="primary" onClick={() => go('bakeday')}><CalendarDays size={16} /> Plan a bake day</button><button onClick={() => go('shopping')}>Shopping list</button></div>
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
            <strong>{fmtDate(d || undefined)}</strong>{d && bakery.shop.limit && <CapacityBar day={d} />}
            <ul>{list.map(o => <li key={o.orderId}>{orderLabel(o)} {o.customer.name}{o.pickupGroup ? ` (${o.pickupGroup})` : ''}: {o.items.map(itemText).join(', ')} · <span className="muted">{STATUS_LABEL[o.status]}</span></li>)}</ul>
          </div>
        ))}
      </section>
    </>
  );
}
