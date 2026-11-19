// Customers and Reports tabs (Orders screen).
import { BarChart3, Copy, Download, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';
import { itemText, orderLabel, STATUS_LABEL } from '../bakery';
import { money } from '../costing';
import { customerList, customersCsv, downloadText, localDay, periods, salesCsv, salesReport, saleDay, type Bucket, type CustomerRow } from '../reports';
import { OrderDialog } from './OrdersView';

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// ---------------- Customers ----------------
export function CustomersTab() {
  const { bakery } = useLedger();
  const { notify, run } = useApp();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'spent' | 'orders'>('recent');
  const [open, setOpen] = useState<string | null>(null);
  const [newFor, setNewFor] = useState<CustomerRow | null>(null);
  const all = useMemo(() => customerList(bakery.orders), [bakery.orders]);
  const shown = all.filter(c => !q.trim() || `${c.name} ${c.contact ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === 'spent' ? b.spent - a.spent : sort === 'orders' ? b.placed - a.placed : b.lastAt.localeCompare(a.lastAt));
  const emails = all.map(c => c.email).filter(Boolean) as string[];
  if (!all.length) return <p className="muted">Customers appear here automatically once orders come in.</p>;
  return (
    <>
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
                <span className="muted">last {fmtDay(localDay(c.lastAt))}</span>
              </span>
            </button>
            {open === c.key && (
              <div className="cust-body">
                {c.favorite && <p className="small">Favourite: <b>{c.favorite}</b></p>}
                <ul className="cust-orders">
                  {c.orders.map(o => <li key={o.orderId} className="small"><b>{orderLabel(o)}</b> {fmtDay(localDay(o.createdAt))} · {o.items.map(itemText).join(', ')} · {money(o.total)} · <span className="muted">{STATUS_LABEL[o.status]}{o.status === 'completed' && !o.paid ? ' · unpaid' : ''}</span></li>)}
                </ul>
                <div className="btn-row">
                  <button className="small-btn primary" onClick={() => setNewFor(c)}><Plus size={14} /> New order for {c.name.split(' ')[0]}</button>
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
  const { bakery } = useLedger();
  const P = useMemo(() => periods(), []);
  const [key, setKey] = useState<string>('month');
  const [from, setFrom] = useState(P.month.from), [to, setTo] = useState(P.month.to);
  const period = key === 'custom' ? { from: from || '0000-01-01', to: to || '9999-12-31', label: 'Custom' } : P[key];
  const r = useMemo(() => salesReport(bakery.orders, period), [bakery.orders, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const booked = bakery.orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status));
  const bookedTotal = booked.reduce((s, o) => s + o.total, 0);
  const owed = bakery.orders.filter(o => o.status === 'completed' && !o.paid);
  return (
    <>
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

      <section className="card">
        <h3>Right now</h3>
        <p className="small"><b>{money(bookedTotal)}</b> booked in {booked.length} confirmed order{booked.length !== 1 ? 's' : ''} not picked up yet.</p>
        {owed.length > 0 ? <><p className="small warn-text"><b>{money(owed.reduce((s, o) => s + o.total, 0))}</b> to collect from picked-up orders (all time):</p>
          <ul className="small">{owed.map(o => <li key={o.orderId}>{orderLabel(o)} {o.customer.name} · {money(o.total)} · picked up {fmtDay(saleDay(o))}</li>)}</ul></> : <p className="small muted">Nothing owed. Every picked-up order is paid.</p>}
      </section>

      <div className="btn-row">
        <button disabled={!r.orders.length} onClick={() => downloadText(`flour-and-flame-sales-${period.from === '0000-01-01' ? 'all' : period.from}-to-${period.to === '9999-12-31' ? localDay(new Date().toISOString()) : period.to}.csv`, salesCsv(r.orders))}><Download size={16} /> Download sales (CSV for Excel / Google Sheets)</button>
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
