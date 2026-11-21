// Orders page intro: a clipboard slides in and your open orders are written on the sheet in pencil,
// with ticks beside the confirmed ones. Tap to skip. Can be switched off in Aa → Page intros.
import '@fontsource/caveat/latin-600.css';
import { useEffect, useState } from 'react';
import { cameFrom } from './Cookbook';
import { introOn } from '../intros';
import { itemText, orderLabel, type Order } from '../bakery';
import { firstName } from '../abbr';

export function OrdersIntro({ orders }: { orders: Order[] }) {
  const open = orders.filter(o => !o.test && ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status))
    .sort((a, b) => (a.pickupDate ?? '9999').localeCompare(b.pickupDate ?? '9999'));
  const lines = open.slice(0, 5);
  const HEAD = 0.45, T_HEAD = 0.55, LINE = 0.34;
  const end = HEAD + T_HEAD + Math.max(1, lines.length) * LINE + 0.25;
  const total = Math.round((end + 0.75) * 1000);
  const [on, setOn] = useState(() => introOn('orders') && cameFrom() !== 'orders');
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), total); return () => clearTimeout(t); }, [on, total]);
  if (!on) return null;
  const pencil = <span className="quill pencil" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 21l1.6-5.2L16.8 3.6a2 2 0 012.8 0l.8.8a2 2 0 010 2.8L8.2 19.4z" fill="#f2c14e" stroke="#7a5a1d" strokeWidth="1.1" /><path d="M3 21l1.6-5.2 3.6 3.6z" fill="#f3dfb8" stroke="#7a5a1d" strokeWidth="1" /><path d="M3 21l.7-2.2 1.5 1.5z" fill="#3a3a3a" /><path d="M16.8 3.6l3.6 3.6" stroke="#e98b8b" strokeWidth="2.4" /></svg></span>;
  const ink = (d: number, t: number, text: string, cls = '') => <span className={'ink ' + cls} style={{ ['--d' as any]: `${d}s`, ['--t' as any]: `${t}s` }}><span className="ink-text">{text}</span>{pencil}</span>;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const toConfirm = open.filter(o => o.status === 'pending').length;
  return (
    <div className="clip-intro" onClick={() => setOn(false)} style={{ ['--total' as any]: `${total}ms` }} role="status" aria-label={`Orders: ${open.length} open`}>
      <div className="clipboard">
        <div className="clip-metal"><span /></div>
        <div className="clip-paper">
          <div className="clip-head">{ink(HEAD, T_HEAD, `Orders · ${today}`, 'ink-title')}</div>
          <ul className="clip-lines">
            {lines.length === 0 && <li>{ink(HEAD + T_HEAD, 0.6, 'All caught up, no open orders!', 'ink-line')}</li>}
            {lines.map((o, i) => {
              const d = HEAD + T_HEAD + i * LINE;
              const done = o.status !== 'pending';
              return (
                <li key={o.orderId}>
                  <span className={'clip-box' + (done ? ' done' : '')} style={{ ['--d' as any]: `${d + LINE - 0.05}s` }} aria-hidden="true">{done && <svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9" /></svg>}</span>
                  {ink(d, LINE, `${orderLabel(o)} ${firstName(o.customer.name)} · ${o.items.map(itemText).join(', ')}`, 'ink-line')}
                </li>
              );
            })}
          </ul>
          {open.length > 0 && <p className="clip-foot" style={{ ['--d' as any]: `${end - 0.1}s` }}>{open.length} open{toConfirm ? ` · ${toConfirm} to confirm` : ''}{open.length > lines.length ? ` · +${open.length - lines.length} more` : ''}</p>}
        </div>
      </div>
      <p className="write-hint">Tap to skip</p>
    </div>
  );
}
