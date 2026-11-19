// Bake-day planner screen.
import { CalendarDays, CheckCircle2, Flame, Package, Settings2, Snowflake, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp, useRoute } from '../app-context';
import { useLedger } from '../ledgerState';
import { useAllProduction } from '../sharedProduction';
import { addEvents } from '../ledger';
import { prepareSession } from '../db';
import { clock, DEFAULT_SETTINGS, planBakeDay, type BakeSettings, type DayItem } from '../bakeDay';
import { factorLabel } from '../bakePlan';
import { itemText, orderLabel, RESERVES } from '../bakery';
import { todayLocal } from '../freezer';
import { artFor } from '../components/CookieArt';
import { Picture } from '../components/MenuPicture';

const KEY = 'ff-bakeday';
const loadS = (): BakeSettings => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT_SETTINGS; } };
const fmtLong = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
/** dark or light label text on a coloured bar */
const ink = (hex: string) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#1c1512' : '#fff8ef'; };

export function BakeDayView() {
  const [, arg] = useRoute();
  const { recipes, run, notify } = useApp();
  const { bakery } = useLedger();
  const records = useAllProduction(recipes);
  const [s, setS] = useState<BakeSettings>(loadS);
  const save = (n: BakeSettings) => { setS(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  const today = todayLocal();
  const days = [...new Set(bakery.orders.filter(o => RESERVES.includes(o.status) && o.pickupDate && o.pickupDate >= today).map(o => o.pickupDate!))].sort();
  const date = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : days[0] ?? today;
  const plan = useMemo(() => planBakeDay(bakery, recipes, records, date, s), [bakery, recipes, records, date, s]);
  const cookies = plan.items.filter(i => i.kind === 'cookie');
  const pans = plan.items.filter(i => i.kind === 'pan');
  const pull = cookies.filter(i => i.fromFreezer > 0);
  const mix = plan.items.filter(i => i.kind === 'pan' || i.mixMore > 0);
  const trays = cookies.reduce((t, i) => t + i.trays, 0);
  const groups = new Map<string, typeof plan.orders>();
  for (const o of plan.orders) { const k = o.pickupGroup || 'No pickup place'; groups.set(k, [...(groups.get(k) ?? []), o]); }

  const startBatch = (it: DayItem) => it.recipe && void run(async () => { await prepareSession(it.recipe!, it.mixFactor ?? 1); go('bake/' + it.recipeId); });
  const markReady = () => {
    if (!window.confirm(`Mark ${plan.orders.length} order${plan.orders.length > 1 ? 's' : ''} for ${fmtShort(date)} as Baked & ready?\n\nThis takes their dough balls out of The Freezer${bakery.shop.emailCustomers ? ' and emails customers who gave an email address that their order is ready' : ''}.`)) return;
    void run(async () => { await addEvents(plan.orders.map(o => ({ type: 'order.status', orderId: o.orderId, status: 'ready' } as any))); notify(`${plan.orders.length} order${plan.orders.length > 1 ? 's' : ''} marked ready. 🎉`); });
  };

  return (
    <div className="page bakeday">
      <div className="page-head"><h2><CalendarDays size={24} /> Bake day</h2></div>
      <div className="chip-row" role="tablist" aria-label="Pickup day">
        {days.map(d => <button key={d} role="tab" aria-selected={d === date} className={'chip' + (d === date ? ' on' : '')} onClick={() => go('bakeday/' + d)}>{d === today ? 'Today' : fmtShort(d)}</button>)}
        <label className="inline chip-date">Other day <input type="date" aria-label="Choose a day" value={date} onChange={e => e.target.value && go('bakeday/' + e.target.value)} /></label>
      </div>
      <h3 className="bd-date">{fmtLong(date)}</h3>
      {plan.overdue.length > 0 && <p className="banner warn small">{plan.overdue.length} confirmed order{plan.overdue.length > 1 ? 's are' : ' is'} past {plan.overdue.length > 1 ? 'their' : 'its'} pickup date and not baked yet: {plan.overdue.map(o => `${orderLabel(o)} ${o.customer.name}`).join(', ')}. <button className="link" onClick={() => go('orders')}>Orders</button></p>}
      {!plan.orders.length ? <p className="muted">No confirmed orders are picked up on this day. Pick another day above.</p> : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile"><span className="st-label">Orders</span><strong className="st-value">{plan.orders.length}</strong><span className="st-sub">{[...groups.keys()].join(' · ')}</span></div>
            {cookies.length > 0 && <div className="stat-tile"><span className="st-label">Cookies</span><strong className="st-value">{cookies.reduce((t, i) => t + i.pieces, 0)}</strong><span className="st-sub">{trays} tray{trays !== 1 ? 's' : ''} at {s.perTray} per tray</span></div>}
            {pans.length > 0 && <div className="stat-tile"><span className="st-label">Pans</span><strong className="st-value">{pans.reduce((t, i) => t + i.pans, 0)}</strong><span className="st-sub">{pans.map(p => p.title).join(', ')}</span></div>}
            <div className="stat-tile"><span className="st-label">Oven done by</span><strong className="st-value">{plan.finish !== null && !plan.unknownTimes.length ? clock(plan.finish) : '—'}</strong><span className="st-sub">{plan.unknownTimes.length ? 'add the missing bake times below' : `starting ${clock(plan.blocks[0]?.start ?? 540)}, plus loading time`}</span></div>
          </div>

          <details className="card bd-settings">
            <summary><Settings2 size={16} /> Oven settings: start {s.start}, {s.perTray} per tray, {s.traysAtOnce} tray{s.traysAtOnce > 1 ? 's' : ''} or pan{s.traysAtOnce > 1 ? 's' : ''} at a time</summary>
            <div className="form-grid">
              <label className="field">Start baking at<input type="time" value={s.start} onChange={e => save({ ...s, start: e.target.value || '09:00' })} /></label>
              <label className="field">Cookies per tray<input inputMode="numeric" value={s.perTray} onChange={e => save({ ...s, perTray: Math.max(1, Math.min(60, Math.round(Number(e.target.value)) || 1)) })} /></label>
              <label className="field">Trays or pans in the oven at once<input inputMode="numeric" value={s.traysAtOnce} onChange={e => save({ ...s, traysAtOnce: Math.max(1, Math.min(6, Math.round(Number(e.target.value)) || 1)) })} /></label>
            </div>
          </details>

          <ol className="bd-steps">
            {pull.length > 0 && (
              <li className="card bd-step">
                <h4><Snowflake size={18} /> Take out of the freezer</h4>
                <div className="bd-items">{pull.map(it => <div key={it.recipeId} className="bd-item">{it.recipe ? <Picture look={bakery.looks[it.recipeId]} title={it.title} seed={it.recipeId} size={48} /> : null}<span><b>{it.fromFreezer}</b> {it.title} dough balls</span></div>)}</div>
                <p className="muted small">Follow your recipe for baking from frozen or letting them sit first.</p>
              </li>
            )}
            {mix.length > 0 && (
              <li className="card bd-step">
                <h4><Flame size={18} /> Mix</h4>
                {mix.map(it => (
                  <div key={it.recipeId} className="bd-item row">
                    {it.recipe ? <Picture look={bakery.looks[it.recipeId]} title={it.title} seed={it.recipeId} size={48} /> : null}
                    <span className="grow">{it.kind === 'cookie' ? <><b>{it.mixMore}</b> more {it.title} dough balls (the freezer is short)</> : <><b>{it.pans || '?'}</b> pan{it.pans !== 1 ? 's' : ''} of {it.title} for {it.pieces} pieces</>}{it.mixFactor ? <span className="muted small"> · {factorLabel(it.mixFactor)} batch</span> : null}</span>
                    {it.recipe && <button className="small-btn primary" onClick={() => startBatch(it)}>Start {it.mixFactor ? factorLabel(it.mixFactor) : ''} batch</button>}
                  </div>
                ))}
              </li>
            )}
            <li className="card bd-step">
              <h4><Timer size={18} /> Bake</h4>
              <OvenTimeline plan={plan} />
              <ul className="bd-oven-list">
                {plan.blocks.map(bk => {
                  const it = plan.items.find(i => i.recipeId === bk.recipeId)!;
                  return (
                    <li key={bk.recipeId}>
                      <b>{bk.end !== null ? `${clock(bk.start)} – ${clock(bk.end)}` : 'Time?'}</b> · {bk.title}: {bk.label}{bk.temp ? ` at ${bk.temp}` : ''}
                      {it.time ? <span className="muted small"> · {it.time.minutes === it.time.max ? it.time.minutes : `${it.time.minutes}–${it.time.max}`} min per round{it.time.from === 'recipe' ? ' (from the recipe)' : ' (your time)'}</span> : null}
                      {(!it.time || it.time.from === 'you') && <label className="inline small bd-min">Bake minutes <input inputMode="numeric" aria-label={`Bake minutes for ${bk.title}`} defaultValue={s.minutes[bk.recipeId] ?? ''} onBlur={e => { const n = Math.round(Number(e.target.value)); const m = { ...s.minutes }; if (n > 0) m[bk.recipeId] = n; else delete m[bk.recipeId]; save({ ...s, minutes: m }); }} /></label>}
                    </li>
                  );
                })}
              </ul>
              <p className="muted small">Times use the longer end of each recipe’s bake time and don’t include loading, cooling or preheating.{pans.length ? ' Pans go first so they can cool before cutting.' : ''}</p>
            </li>
            <li className="card bd-step">
              <h4><Package size={18} /> Cool &amp; pack</h4>
              {[...groups.entries()].map(([g, list]) => (
                <div key={g} className="bd-pack">
                  <strong>{g}</strong>
                  <ul className="small">{list.map(o => <li key={o.orderId}>{orderLabel(o)} {o.customer.name}: {o.items.map(itemText).join(', ')}{o.paid ? '' : ' · collect payment'}</li>)}</ul>
                </div>
              ))}
              <div className="btn-row"><button onClick={() => go('orders/pack')}>Open packing list</button></div>
            </li>
            <li className="card bd-step done-step">
              <h4><CheckCircle2 size={18} /> All baked?</h4>
              <button className="primary big" onClick={markReady}><CheckCircle2 size={18} /> Mark {plan.orders.length} order{plan.orders.length > 1 ? 's' : ''} Baked &amp; ready</button>
            </li>
          </ol>
        </>
      )}
    </div>
  );
}

function OvenTimeline({ plan }: { plan: ReturnType<typeof planBakeDay> }) {
  const known = plan.blocks.filter(b => b.end !== null);
  if (!plan.blocks.length) return null;
  const start = plan.blocks[0].start;
  const unknownW = 25; // minutes of width shown for a block with no time yet
  const spans = plan.blocks.map(b => (b.end !== null ? b.end - b.start : unknownW));
  const total = Math.max(30, spans.reduce((a, c) => a + c, 0));
  let x = 0;
  const ticks: number[] = []; for (let m = 0; m <= total; m += total > 180 ? 60 : 30) ticks.push(m);
  return (
    <div className="oven-timeline" role="img" aria-label={'Oven timeline: ' + plan.blocks.map(b => `${b.title} ${b.label}${b.end !== null ? ` ${clock(b.start)} to ${clock(b.end)}` : ' time unknown'}`).join('; ')}>
      <div className="ot-track">
        {plan.blocks.map((b, i) => {
          const it = plan.items.find(q => q.recipeId === b.recipeId)!;
          const art = artFor(b.title, it.recipe?.category, it.recipe?.ingredients.map(g => g.name));
          const left = (x / total) * 100, width = (spans[i] / total) * 100; x += spans[i];
          return (
            <div key={b.recipeId} className={'ot-block' + (b.end === null ? ' unknown' : '')} style={{ left: `${left}%`, width: `calc(${width}% - 3px)`, background: b.end === null ? undefined : `linear-gradient(180deg, ${art.dough}, ${art.edge})`, color: b.end === null ? undefined : ink(art.dough) }} title={`${b.title}: ${b.label}`}>
              <span className="ot-title">{b.title}</span>
              <span className="ot-sub">{b.label}{b.end === null ? ' · time?' : ''}</span>
              {b.rounds > 1 && b.end !== null && <span className="ot-rounds">{Array.from({ length: Math.min(b.rounds, 12) }, (_, k) => <i key={k} />)}</span>}
            </div>
          );
        })}
      </div>
      <div className="ot-axis">{ticks.map(m => <span key={m} style={{ left: `${(m / total) * 100}%` }}>{clock(start + m)}</span>)}</div>
      {known.length < plan.blocks.length && <p className="muted small">Striped blocks have no bake time yet. Type the minutes below and the times fill in.</p>}
    </div>
  );
}
