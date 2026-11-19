import { FeatureToggle } from '../components/ShopExtras';
// Customers and Reports tabs (Orders screen).
import { BarChart3, Copy, Download, Plus, Search, Send } from 'lucide-react';
import { getSheetConfig } from '../ledger';
import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';
import { itemText, orderLabel, STATUS_LABEL } from '../bakery';
import { money } from '../costing';
import { loyaltyEvery, loyaltyOn, loyaltyRows, progressText, type LoyaltyRow } from '../loyalty';
import { customerList, customersCsv, downloadText, feedbackStats, heardFromStats, localDay, periods, salesCsv, salesReport, saleDay, tastingStats, type Bucket, type CustomerRow } from '../reports';
import { Stars } from '../components/Stars';
import { Gift, MessageSquareHeart, Megaphone } from 'lucide-react';
import { OrderDialog } from './OrdersView';
import { demoOrders, useDemo } from '../demoData';
import { FlaskConical } from 'lucide-react';

/** Real orders, or made-up sample sales (in memory only) when sample mode is on. */
function useInsightOrders() {
  const { bakery } = useLedger();
  const { recipes, catalog } = useApp();
  const [demo, setDemo] = useDemo();
  const sample = useMemo(() => (demo ? demoOrders(bakery.products, recipes, catalog, bakery.pickups.filter(p => p.active).map(p => p.name)) : []), [demo, bakery.products, recipes, catalog, bakery.pickups]);
  return { orders: demo ? sample : bakery.orders.filter(o => !o.test), demo, setDemo };
}
function DemoBar({ demo, setDemo }: { demo: boolean; setDemo: (v: boolean) => void }) {
  return demo ? (
    <div className="banner warn demo-bar"><FlaskConical size={20} /><div><strong>Showing SAMPLE sales: made up, not your real orders.</strong><p className="small">Three months of pretend orders using your menu, prices and ingredient costs. Nothing is saved or sent, and no one is emailed.</p></div><button className="primary" onClick={() => setDemo(false)}>Back to my real data</button></div>
  ) : (
    <div className="btn-row"><button className="small-btn" onClick={() => setDemo(true)}><FlaskConical size={14} /> Try with sample sales</button></div>
  );
}

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// ---------------- Customers ----------------
export function CustomersTab() {
  const { notify, run } = useApp();
  const { orders, demo, setDemo } = useInsightOrders();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'spent' | 'orders'>('recent');
  const [open, setOpen] = useState<string | null>(null);
  const [newFor, setNewFor] = useState<CustomerRow | null>(null);
  const { bakery } = useLedger();
  const all = useMemo(() => customerList(orders, bakery.news.unsubscribed), [orders, bakery.news.unsubscribed]);
  const every = loyaltyEvery(bakery.shop);
  const loyal = useMemo(() => loyaltyOn(bakery.shop) && !demo ? loyaltyRows(orders, every) : new Map<string, LoyaltyRow>(), [orders, every, bakery.shop, demo]);
  const shown = all.filter(c => !q.trim() || `${c.name} ${c.contact ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === 'spent' ? b.spent - a.spent : sort === 'orders' ? b.placed - a.placed : b.lastAt.localeCompare(a.lastAt));
  const emails = all.map(c => c.email).filter(Boolean) as string[];
  if (!all.length) return <><DemoBar demo={demo} setDemo={setDemo} /><p className="muted">Customers appear here automatically once orders come in.</p></>;
  return (
    <>
      <DemoBar demo={demo} setDemo={setDemo} />
      {!demo && <Announce subscribers={all.filter(c => c.subscribed).length} />}
      <div className="btn-row cust-tools">
        <label className="search-field"><Search size={16} /><input aria-label="Search customers" placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} /></label>
        <label className="inline">Sort <select value={sort} onChange={e => setSort(e.target.value as any)}><option value="recent">Most recent</option><option value="spent">Most spent</option><option value="orders">Most orders</option></select></label>
      </div>
      <div className="btn-row">
        <button disabled={!emails.length} onClick={() => void navigator.clipboard?.writeText(emails.join(', ')).then(() => notify(`${emails.length} email address${emails.length > 1 ? 'es' : ''} copied: paste into Gmail’s “Bcc” to announce a new menu.`)).catch(() => notify('Copy failed.', true))}><Copy size={16} /> Copy all emails ({emails.length})</button>
        <button onClick={() => downloadText('flour-and-flame-customers.csv', customersCsv(all))}><Download size={16} /> Download list (CSV)</button>
      </div>
      <p className="muted small">{all.length} customer{all.length > 1 ? 's' : ''}. Built from your orders; the same email address counts as one customer.</p>
      <div className="list cust-list">
        {shown.map(c => (
          <section key={c.key} className="card cust-card">
            <button className="cust-head" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)}>
              <span><strong>{c.name}</strong><span className="muted small"> {c.contact ?? ''}</span></span>
              <span className="cust-stats small">
                <span><b>{c.placed}</b> order{c.placed !== 1 ? 's' : ''}</span>
                <span><b>{money(c.spent)}</b> spent</span>
                {c.open > 0 && <span className="pill small warn">{c.open} open</span>}
                {(() => { const r = loyal.get(c.key); if (!r || !r.done && !r.available) return null; return r.available > 0 ? <span className="pill small loyal">🎁 Free half dozen to use</span> : <span className={'pill small' + (r.toNext === 1 ? ' loyal' : '')} title={progressText(r, every)}>🍪 {r.done % every}/{every}</span>; })()}
                {c.subscribed && <span className="pill small" title="Gets your announcement emails">📬 News</span>}
                {bakery.notes[c.key] && <span className="pill small note-pill" title={bakery.notes[c.key]}>📝 Note</span>}
                {c.tasted && <span className="pill small tasting">{c.cameBack ? '🎁 Tasted → came back ✓' : '🎁 Tasted'}</span>}
                {c.rating !== undefined && <Stars value={c.rating} size={13} />}
                <span className="muted">last {fmtDay(localDay(c.lastAt))}</span>
              </span>
            </button>
            {open === c.key && (
              <div className="cust-body">
                {c.favorite && <p className="small">Favourite: <b>{c.favorite}</b></p>}
                {!demo && <NoteEditor k={c.key} name={c.name} />}
                <ul className="cust-orders">
                  {c.orders.map(o => <li key={o.orderId} className="small"><b>{orderLabel(o)}</b> {fmtDay(localDay(o.createdAt))} · {o.items.map(itemText).join(', ')} · {money(o.total)} · <span className="muted">{STATUS_LABEL[o.status]}{o.status === 'completed' && !o.paid ? ' · unpaid' : ''}</span></li>)}
                </ul>
                <div className="btn-row">
                  <button className="small-btn primary" disabled={demo} onClick={() => setNewFor(c)}><Plus size={14} /> New order for {c.name.split(' ')[0]}</button>
                  {c.email && <button className="small-btn" onClick={() => void navigator.clipboard?.writeText(c.email!).then(() => notify('Email copied.'))}><Copy size={14} /> Copy email</button>}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
      {newFor && <OrderDialog order={null} preset={{ name: newFor.name, contact: newFor.contact }} onClose={() => setNewFor(null)} onSave={async evs => { await run(async () => { await addEvents(evs); notify('Order saved.'); setNewFor(null); }); }} />}
    </>
  );
}

// ---------------- Reports ----------------
export function ReportsTab() {
  const { orders, demo, setDemo } = useInsightOrders();
  const { bakery } = useLedger();
  const P = useMemo(() => periods(), []);
  const [key, setKey] = useState<string>('month');
  const [from, setFrom] = useState(P.month.from), [to, setTo] = useState(P.month.to);
  const period = key === 'custom' ? { from: from || '0000-01-01', to: to || '9999-12-31', label: 'Custom' } : P[key];
  const r = useMemo(() => salesReport(orders, period), [orders, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const booked = orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status));
  const bookedTotal = booked.reduce((s, o) => s + o.total, 0);
  const owed = orders.filter(o => o.status === 'completed' && !o.paid);
  return (
    <>
      <DemoBar demo={demo} setDemo={setDemo} />
      <div className="chip-row" role="tablist" aria-label="Report period">
        {[...Object.entries(P).map(([k, p]) => [k, p.label] as const), ['custom', 'Custom…'] as const].map(([k, l]) => <button key={k} role="tab" aria-selected={key === k} className={'chip' + (key === k ? ' on' : '')} onClick={() => setKey(k)}>{l}</button>)}
      </div>
      {key === 'custom' && <div className="form-grid"><label className="field">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="field">To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>}
      <p className="muted small">Sales count when an order is marked <b>Picked up</b>. {period.from !== '0000-01-01' ? `${fmtDay(period.from)} – ${fmtDay(period.to)}.` : ''}</p>

      <div className="stat-tiles">
        <Tile label="Sales" value={money(r.revenue)} sub={`${r.orders.length} order${r.orders.length !== 1 ? 's' : ''}${r.discounts ? ` · ${money(r.discounts)} discounts` : ''}`} />
        <Tile label="Sold" value={`${r.boxes} box${r.boxes !== 1 ? 'es' : ''}`} sub={`${r.pieces} pieces`} />
        <Tile label="Est. profit (ingredients)" value={r.costed ? money(r.costed.profit) : '—'} sub={r.costed ? `cost ${money(r.costed.cost)}${r.uncosted ? ` · ${r.uncosted} order${r.uncosted > 1 ? 's' : ''} without full costs not included` : ''}` : r.orders.length ? 'No orders with complete costs yet' : 'No sales yet'} />
        <Tile label="Not paid yet" value={money(r.unpaid.total)} sub={r.unpaid.orders.length ? `${r.unpaid.orders.length} picked-up order${r.unpaid.orders.length > 1 ? 's' : ''}` : 'All paid'} warn={r.unpaid.total > 0} />
      </div>

      <section className="card">
        <h3><BarChart3 size={18} /> Sales by {r.bucketUnit}</h3>
        {r.orders.length ? <SalesChart buckets={r.buckets} unit={r.bucketUnit} /> : <p className="muted">No picked-up orders in this period.</p>}
      </section>

      {r.orders.length > 0 && (
        <div className="report-grid">
          <section className="card">
            <h3>By product</h3>
            <table className="report-table"><thead><tr><th>Product</th><th>Boxes</th><th>Sales</th></tr></thead>
              <tbody>{r.byProduct.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.boxes}</td><td>{money(p.revenue)}</td></tr>)}</tbody></table>
            <p className="muted small">Before discounts.</p>
          </section>
          <section className="card">
            <h3>By flavour</h3>
            <table className="report-table"><thead><tr><th>Recipe</th><th>Pieces</th></tr></thead>
              <tbody>{r.byFlavor.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.pieces}</td></tr>)}</tbody></table>
            <p className="muted small">Mixed boxes are split into their flavours.</p>
          </section>
          <section className="card">
            <h3>Top customers</h3>
            <table className="report-table"><thead><tr><th>Customer</th><th>Orders</th><th>Spent</th></tr></thead>
              <tbody>{r.topCustomers.map(c => <tr key={c.name}><td>{c.name}</td><td>{c.orders}</td><td>{money(c.total)}</td></tr>)}</tbody></table>
          </section>
          <section className="card">
            <h3>Payments</h3>
            {r.payments.length ? <table className="report-table"><thead><tr><th>How</th><th>Orders</th><th>Total</th></tr></thead>
              <tbody>{r.payments.map(p => <tr key={p.method}><td>{p.method}</td><td>{p.orders}</td><td>{money(p.total)}</td></tr>)}</tbody></table> : <p className="muted small">No paid orders in this period.</p>}
          </section>
        </div>
      )}

      <InsightCards orders={orders} reviews={demo ? [] : bakery.reviews} demo={demo} />

      <section className="card">
        <h3>Right now</h3>
        <p className="small"><b>{money(bookedTotal)}</b> booked in {booked.length} confirmed order{booked.length !== 1 ? 's' : ''} not picked up yet.</p>
        {owed.length > 0 ? <><p className="small warn-text"><b>{money(owed.reduce((s, o) => s + o.total, 0))}</b> to collect from picked-up orders (all time):</p>
          <ul className="small">{owed.map(o => <li key={o.orderId}>{orderLabel(o)} {o.customer.name} · {money(o.total)} · picked up {fmtDay(saleDay(o))}</li>)}</ul></> : <p className="small muted">Nothing owed. Every picked-up order is paid.</p>}
      </section>

      <div className="btn-row">
        <button disabled={!r.orders.length} onClick={() => downloadText(`flour-and-flame-${demo ? 'SAMPLE-' : ''}sales-${period.from === '0000-01-01' ? 'all' : period.from}-to-${period.to === '9999-12-31' ? localDay(new Date().toISOString()) : period.to}.csv`, salesCsv(r.orders))}><Download size={16} /> Download sales (CSV for Excel / Google Sheets)</button>
      </div>
    </>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return <div className={'stat-tile' + (warn ? ' warn' : '')}><span className="st-label">{label}</span><strong className="st-value">{value}</strong>{sub && <span className="st-sub">{sub}</span>}</div>;
}

/** One series (sales), so no legend: the heading names it. Hover/tap a bar for its value; the tables above are the table view. */
function SalesChart({ buckets, unit }: { buckets: Bucket[]; unit: 'week' | 'month' }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 200, padL = 48, padB = 26, padT = 10;
  const max = Math.max(...buckets.map(b => b.revenue), 1);
  const nice = (() => { const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)!; return step; })();
  const top = nice * Math.ceil(max / nice);
  const n = buckets.length, slot = (W - padL) / n, bw = Math.max(4, Math.min(44, slot - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const labelEvery = Math.ceil(n / 8);
  const h = hover !== null ? buckets[hover] : null;
  return (
    <div className="sales-chart">
      <p className="chart-readout small" aria-live="polite">{h ? <><b>{unit === 'week' ? `Week of ${h.label}` : h.label}</b>: {money(h.revenue)} · {h.orders} order{h.orders !== 1 ? 's' : ''}</> : <span className="muted">Hover or tap a bar for details.</span>}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales by ${unit}: ` + buckets.map(b => `${b.label} ${money(b.revenue)}`).join(', ')}>
        {[0, 1, 2, 3, 4].map(i => { const v = (top / 4) * i; return <g key={i}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x={padL - 6} y={y(v) + 4} className="axis" textAnchor="end">${v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)}</text></g>; })}
        {buckets.map((b, i) => {
          const x = padL + i * slot + (slot - bw) / 2, yy = y(b.revenue), hgt = H - padB - yy;
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${b.label}: ${money(b.revenue)}`}>
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} className="hit" />
              {b.revenue > 0 && <path className={'bar' + (hover === i ? ' on' : '')} d={`M${x},${H - padB} V${yy + Math.min(4, hgt)} Q${x},${yy} ${x + Math.min(4, bw / 2)},${yy} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${yy} ${x + bw},${yy + Math.min(4, hgt)} V${H - padB} Z`} />}
              {i % labelEvery === 0 && <text x={padL + i * slot + slot / 2} y={H - 8} className="axis" textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="baseline" />
      </svg>
    </div>
  );
}

/** Tasting boxes, feedback and how people found you (all time). */
function InsightCards({ orders, reviews, demo }: { orders: import('../bakery').Order[]; reviews: import('../bakery').BakeryState['reviews']; demo?: boolean }) {
  const t = useMemo(() => tastingStats(orders), [orders]);
  const f = useMemo(() => feedbackStats(orders, reviews), [orders, reviews]);
  const h = useMemo(() => heardFromStats(orders), [orders]);
  const againTotal = f.again.yes + f.again.maybe + f.again.no;
  return (
    <div className="report-grid">
      <section className="card">
        <h3><Gift size={18} /> Tasting boxes <span className="muted small">(all time)</span></h3>
        {t.given ? (
          <>
            <p className="tasting-funnel"><b>{t.given}</b> given to {t.people} {t.people === 1 ? 'person' : 'people'} → <b>{t.cameBack}</b> came back and ordered{t.people ? ` (${Math.round((t.cameBack / t.people) * 100)}%)` : ''}</p>
            <div className="funnel-bar" aria-hidden="true"><span style={{ width: `${t.people ? (t.cameBack / t.people) * 100 : 0}%` }} /></div>
            <p className="small">{t.boughtTotal > 0 ? <>They’ve since spent <b>{money(t.boughtTotal)}</b>. </> : null}{t.cost !== null ? <>Ingredients for tasting boxes: about <b>{money(t.cost)}</b>{t.uncosted ? ` (+${t.uncosted} without full costs)` : ''}.</> : null}</p>
          </>
        ) : <p className="muted small">Tick “Tasting box” when you make an order for a free or discounted sample. This shows how many of those people come back and order.</p>}
      </section>
      <section className="card">
        <h3><MessageSquareHeart size={18} /> What people think <span className="muted small">({f.responses} response{f.responses !== 1 ? 's' : ''})</span></h3>
        {f.responses ? (
          <>
            <table className="report-table"><thead><tr><th>Flavour</th><th>Rating</th><th>Votes</th></tr></thead>
              <tbody>{f.flavours.map(x => <tr key={x.name}><td>{x.name}</td><td><Stars value={x.avg} size={14} /> {x.avg.toFixed(1)}</td><td>{x.count}</td></tr>)}</tbody></table>
            {againTotal > 0 && <p className="small">Would order again: <b>{Math.round((f.again.yes / againTotal) * 100)}%</b> yes · {f.again.maybe} maybe · {f.again.no} no</p>}
            {f.comments.length > 0 && <ul className="comments">{f.comments.map((c, i) => <li key={i}><Stars value={c.avg} size={12} /> “{c.text}” <span className="muted small">· {c.name}</span>{!demo && <FeatureToggle c={c} />}</li>)}</ul>}
          </>
        ) : <p className="muted small">After you tap Picked up, customers get a short “How were they?” email, and anyone can scan the review QR code on your tuck-in cards. Star ratings and comments appear here.</p>}
      </section>
      <section className="card">
        <h3><Megaphone size={18} /> How people found you</h3>
        {h.length ? <table className="report-table"><thead><tr><th>Source</th><th>Orders</th></tr></thead><tbody>{h.map(x => <tr key={x.source}><td>{x.source}</td><td>{x.orders}</td></tr>)}</tbody></table>
          : <p className="muted small">The order form now asks “How did you hear about us?”. Answers show here.</p>}
      </section>
    </div>
  );
}

function NoteEditor({ k, name }: { k: string; name: string }) {
  const { bakery } = useLedger();
  const { run, notify } = useApp();
  const [v, setV] = useState(bakery.notes[k] ?? '');
  const dirty = v.trim() !== (bakery.notes[k] ?? '');
  return (
    <div className="note-editor">
      <label className="field">Private note about {name.split(' ')[0]} (only you see this)<input value={v} onChange={e => setV(e.target.value)} maxLength={200} placeholder="e.g. nut allergy · Mom’s coworker · loves the cocoa ones" /></label>
      {dirty && <button className="small-btn primary" onClick={() => void run(async () => { await addEvents([{ type: 'customer.note', key: k, note: v.trim() } as any]); notify(v.trim() ? 'Note saved.' : 'Note removed.'); })}>Save note</button>}
    </div>
  );
}

function Announce({ subscribers }: { subscribers: number }) {
  const { bakery } = useLedger();
  const { run, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('New at Flour and Flame 🍪');
  const [body, setBody] = useState('');
  const link = (() => { const url = getSheetConfig().url ?? ''; const m = url.match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/); return m ? { form: `${location.origin}${location.pathname}#/order-form/${m[1]}`, unsub: `${location.origin}${location.pathname}#/unsubscribe/${m[1]}/` } : null; })();
  const v = Number((getSheetConfig() as any).scriptVersion ?? 0);
  return (
    <section className="card announce">
      <div className="order-top"><h3><Send size={18} /> Announcements</h3><span className="pill small">📬 {subscribers} subscriber{subscribers !== 1 ? 's' : ''}</span></div>
      <p className="muted small">Customers who tick “Email me when new flavours or pickup days open” on the order form get these. Every email has an unsubscribe link.</p>
      {!open ? <button disabled={!link || !subscribers} onClick={() => setOpen(true)}><Send size={16} /> Write an announcement</button> : (
        <div className="announce-form">
          <label className="field">Subject<input value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} /></label>
          <label className="field">Message<textarea rows={5} value={body} onChange={e => setBody(e.target.value)} maxLength={4000} placeholder={'e.g. Holiday boxes are here! Pickups on Friday Dec 19 and Saturday Dec 20. Brown butter cocoa espresso is back, plus a new mixed dozen.'} /></label>
          <p className="small muted">We add “Hi [first name],” at the top, then your order link and an unsubscribe link at the bottom.</p>
          {bakery.shop.emailsPaused && <p className="banner warn small">Testing mode is on, so the sheet won’t send this. Turn it off in Pickup &amp; form first.</p>}
          {v < 9 && <p className="banner warn small">Announcements need bakery-sheet script version 9.</p>}
          <p className="small muted">Gmail lets the sheet send about 100 emails a day, so up to 90 people get each announcement.</p>
          <div className="btn-row">
            <button className="primary" disabled={!body.trim() || !subject.trim() || !link} onClick={() => { if (window.confirm(`Send “${subject}” to ${subscribers} subscriber${subscribers !== 1 ? 's' : ''}?`)) void run(async () => { await addEvents([{ type: 'news.send', subject: subject.trim(), body: body.trim(), link: link!.form, unsubBase: link!.unsub } as any]); notify('Announcement sent to the bakery sheet. It emails your subscribers within a few seconds.'); setOpen(false); setBody(''); }); }}><Send size={16} /> Send to {subscribers}</button>
            <button onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {bakery.news.sends.length > 0 && <ul className="small sent-list">{bakery.news.sends.slice(0, 5).map(x => <li key={x.id}>{new Date(x.at).toLocaleDateString()} · “{x.subject}” · {x.count === undefined ? 'sending…' : `sent to ${x.count}`}{x.skipped ? ` (${x.skipped} not sent: daily email limit)` : ''}</li>)}</ul>}
    </section>
  );
}
