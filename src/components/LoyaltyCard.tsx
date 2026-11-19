// Dashboard tile: who has a free half dozen to use, whose next order earns one, and who's getting close.
import { Gift } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { go } from '../app-context';
import { orderLabel } from '../bakery';
import { useLedger } from '../ledgerState';
import { loyaltyEvery, loyaltyOn, loyaltyRows } from '../loyalty';

export function LoyaltyCard({ style }: { style?: CSSProperties }) {
  const { bakery } = useLedger();
  const every = loyaltyEvery(bakery.shop);
  const rows = useMemo(() => [...loyaltyRows(bakery.orders, every).values()], [bakery.orders, every]);
  if (!loyaltyOn(bakery.shop)) return null;
  const toUse = rows.filter(r => r.available > 0);
  const earning = rows.filter(r => r.earner);
  const close = rows.filter(r => !r.earner && r.done > 0 && r.toNext <= 2).sort((a, b) => a.toNext - b.toNext);
  return (
    <section className="card loyalty-card" data-tile="loyalty" style={style}>
      <h3><Gift size={18} /> Loyalty</h3>
      <p className="muted small">A free half dozen after every {every} picked-up orders, then it starts again. The sheet emails the customer when they earn one.</p>
      {!toUse.length && !earning.length && !close.length && <p className="muted">No one is close yet. Progress shows here as orders are picked up.</p>}
      {toUse.length > 0 && <div className="loy-group"><b>🎁 Free half dozen to use</b>{toUse.map(r => <span key={r.key} className="loy-row">{r.name}{r.available > 1 ? ` ×${r.available}` : ''}</span>)}</div>}
      {earning.length > 0 && <div className="loy-group"><b>✨ Earns one when picked up</b>{earning.map(r => <span key={r.key} className="loy-row">{r.name} · order {orderLabel(r.earner!)}</span>)}</div>}
      {close.length > 0 && <div className="loy-group"><b>Getting close</b>{close.map(r => <span key={r.key} className="loy-row">{r.name} <span className="loy-dots" aria-label={`${r.done % every} of ${every}`}>{Array.from({ length: every }, (_, k) => <i key={k} className={k < r.done % every ? 'on' : ''} />)}</span> {r.toNext} to go</span>)}</div>}
      <button onClick={() => go('orders/customers')}>Customers</button>
    </section>
  );
}
