// Wide screens only: a "kitchen rail" down the left (today's orders, freezer, baking timers, test bakes due,
// recent recipes) and a quiet animated illustration on the right. Hidden on phones and narrower windows.
import { BookOpen, ChefHat, NotebookPen, ShoppingBag, Snowflake, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { useShortNames } from '../abbr';
import { itemText, orderLabel } from '../bakery';
import { listSessions } from '../db';
import { useLedger } from '../ledgerState';
import { firstName } from '../abbr';
import type { BakingSession } from '../types';

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const niceDay = (iso: string) => { const today = localDay(); const t = new Date(); t.setDate(t.getDate() + 1); if (iso === today) return 'Today'; if (iso === localDay(t)) return 'Tomorrow'; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function KitchenRail() {
  const { recipes, prefs } = useApp();
  const { bakery } = useLedger();
  const short = useShortNames();
  const [sessions, setSessions] = useState<BakingSession[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const load = () => void listSessions().then(setSessions).catch(() => {});
    load(); const a = setInterval(load, 8000); const b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const open = bakery.orders.filter(o => !o.test && ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
  const count = (s: string[]) => open.filter(o => s.includes(o.status)).length;
  const upcoming = useMemo(() => open.filter(o => o.status !== 'pending').sort((a, b) => (a.pickupDate ?? '9999').localeCompare(b.pickupDate ?? '9999')).slice(0, 3), [open]);
  const freezer = [...bakery.freezer.items].filter(i => i.total > 0).sort((a, b) => b.total - a.total);
  const low = bakery.plan.filter(p => p.makeMore > 0);
  const baking = sessions.map(s => ({ s, r: recipes.find(r => r.id === s.recipeId) })).filter(x => x.r);
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDay(d); })();
  const tasteDue = bakery.bakeLogs.filter(l => l.date <= yesterday && !l.checks.some(c => c.when === 'Next day') && l.date >= localDay(new Date(Date.now() - 6 * 864e5)));
  const recent = prefs.recent.map(x => recipes.find(r => r.id === x.id)).filter(Boolean).slice(0, 4);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <aside className="kitchen-rail" aria-label="Kitchen at a glance">
      <p className="kr-day">{today}</p>

      <section className="kr-card">
        <button className="kr-head" onClick={() => go('orders')}><ShoppingBag size={16} /> Orders</button>
        <div className="kr-counts">
          <button className={count(['pending']) ? 'hot' : ''} onClick={() => go('orders/requests')}><b>{count(['pending'])}</b>Requests</button>
          <button onClick={() => go('orders/confirmed')}><b>{count(['confirmed', 'preparing'])}</b>Confirmed</button>
          <button onClick={() => go('orders/ready')}><b>{count(['ready'])}</b>Ready</button>
        </div>
        {upcoming.length > 0 ? <ul className="kr-list">{upcoming.map(o => (
          <li key={o.orderId}><button onClick={() => go('orders')}><span><b>{o.pickupDate ? niceDay(o.pickupDate) : 'No date'}</b> · {firstName(o.customer.name)} {orderLabel(o)}</span><small>{o.items.map(itemText).join(', ')}</small></button></li>
        ))}</ul> : <p className="kr-empty">No confirmed pickups.</p>}
      </section>

      <section className="kr-card">
        <button className="kr-head" onClick={() => go('freezer')}><Snowflake size={16} /> Freezer <span className="kr-total">{bakery.freezer.total}</span></button>
        {freezer.length ? <ul className="kr-chips">{freezer.slice(0, 6).map(i => <li key={i.recipeId} title={i.recipeTitle}>{short(i.recipeTitle)} <b>{i.total}</b></li>)}{freezer.length > 6 && <li>+{freezer.length - 6}</li>}</ul> : <p className="kr-empty">Empty.</p>}
        {low.length > 0 && <p className="kr-warn">Make more: {low.map(p => `${short(p.recipeTitle)} ${p.makeMore}`).join(', ')}</p>}
      </section>

      {baking.length > 0 && (
        <section className="kr-card baking">
          <span className="kr-head static"><ChefHat size={16} /> Baking now</span>
          {baking.map(({ s, r }) => {
            const t = s.timers.filter(x => x.endsAt && !x.finished).sort((a, b) => a.endsAt! - b.endsAt!)[0];
            return <button key={s.recipeId} className="kr-row" onClick={() => go('bake/' + s.recipeId)}><span>{r!.title}</span>{t && <small className={t.endsAt! - now < 60000 ? 'soon' : ''}><Timer size={13} /> {t.endsAt! > now ? mmss(t.endsAt! - now) : 'Done'} · {t.label}</small>}</button>;
          })}
        </section>
      )}

      {tasteDue.length > 0 && (
        <section className="kr-card">
          <span className="kr-head static"><NotebookPen size={16} /> Taste check due</span>
          {tasteDue.slice(0, 3).map(l => <button key={l.id} className="kr-row" onClick={() => go('recipe/' + l.recipeId)}><span>{l.recipeTitle}</span><small>Baked {niceDay(l.date)}: add next-day scores</small></button>)}
        </section>
      )}

      {recent.length > 0 && (
        <section className="kr-card">
          <button className="kr-head" onClick={() => go('recipes')}><BookOpen size={16} /> Recent recipes</button>
          {recent.map(r => <button key={r!.id} className="kr-row" onClick={() => go('recipe/' + r!.id)}><span>{r!.title}</span><small>{r!.category} · {r!.status}</small></button>)}
        </section>
      )}
    </aside>
  );
}

/** Right margin: a quiet illustration — a flame over a stack of treats, with drifting flour. */
export function SideArt() {
  return (
    <div className="side-art" aria-hidden="true">
      <svg viewBox="0 0 200 520" width="100%">
        <defs>
          <radialGradient id="saGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffb25c" stopOpacity=".35" /><stop offset="1" stopColor="#ffb25c" stopOpacity="0" /></radialGradient>
          <linearGradient id="saFlame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#c2410c" /><stop offset=".55" stopColor="#f59e0b" /><stop offset="1" stopColor="#fde68a" /></linearGradient>
          <linearGradient id="saCookie" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9a35f" /><stop offset="1" stopColor="#a8682f" /></linearGradient>
          <linearGradient id="saWrap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8a4b2a" /><stop offset=".5" stopColor="#b8693d" /><stop offset="1" stopColor="#8a4b2a" /></linearGradient>
        </defs>
        <circle cx="100" cy="118" r="90" fill="url(#saGlow)" className="sa-glow" />
        <g className="sa-flame">
          <path d="M100 40 C122 78 136 98 132 128 C129 152 114 166 100 166 C86 166 71 152 68 128 C64 98 80 82 100 40Z" fill="url(#saFlame)" />
          <path d="M100 92 C111 112 117 124 114 140 C112 152 106 158 100 158 C94 158 88 152 86 140 C83 124 90 112 100 92Z" fill="#fff4d6" opacity=".85" />
        </g>
        {/* cupcake */}
        <g transform="translate(100 214)">
          <path d="M-34 0 C-36 -26 -16 -38 0 -38 C16 -38 36 -26 34 0 Z" fill="#f3e2c7" />
          <path d="M-28 -8 C-22 -22 -8 -26 2 -24 C14 -22 24 -16 28 -8" fill="none" stroke="#e5ccab" strokeWidth="4" strokeLinecap="round" />
          <path d="M-20 -26 C-12 -40 10 -42 18 -28" fill="none" stroke="#c98a4b" strokeWidth="3" strokeLinecap="round" opacity=".8" />
          {[-14, -2, 10, 20].map((x, i) => <rect key={i} x={x} y={-34 + (i % 2) * 6} width="5" height="2.4" rx="1" fill="#fff" opacity=".9" transform={`rotate(${i * 35} ${x} -30)`} />)}
          <path d="M-32 0 H32 L24 40 H-24 Z" fill="url(#saWrap)" />
          {[-20, -10, 0, 10, 20].map(x => <line key={x} x1={x} y1="2" x2={x * 0.75} y2="38" stroke="#6e3a1f" strokeWidth="1.4" opacity=".6" />)}
        </g>
        {/* cookie stack */}
        {[0, 1, 2, 3].map(i => (
          <g key={i} transform={`translate(100 ${300 + i * 34})`}>
            <ellipse cx="0" cy="10" rx="62" ry="16" fill="#6b3a1c" />
            <ellipse cx="0" cy="4" rx="62" ry="17" fill="url(#saCookie)" />
            {[[-30, 0], [-6, -6], [20, 2], [36, -4], [-18, 8], [8, 9]].map(([x, y], k) => <ellipse key={k} cx={x + (i % 2) * 6} cy={y} rx="5" ry="3" fill="#3b1f10" opacity=".9" />)}
            <circle cx={-40 + i * 12} cy="-2" r="1.6" fill="#fff" opacity=".9" />
            <circle cx={26 - i * 8} cy="6" r="1.3" fill="#fff" opacity=".8" />
          </g>
        ))}
        <ellipse cx="100" cy="452" rx="78" ry="10" fill="#000" opacity=".35" />
        {Array.from({ length: 14 }, (_, i) => <circle key={i} className="sa-flour" cx={20 + (i * 37) % 160} cy={180 + (i * 53) % 300} r={0.8 + (i % 3) * 0.5} fill="#f5ead6" style={{ animationDelay: `${(i * 0.7) % 6}s`, animationDuration: `${6 + (i % 4)}s` }} />)}
        <text x="100" y="494" textAnchor="middle" className="sa-motto">sweet · salty · balanced</text>
      </svg>
    </div>
  );
}
