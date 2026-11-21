// Bake day → "Everything to make": all the batches your orders and freezer need (the same list as Shopping),
// plus anything you add, with an approximate time to make it all.
import { ChefHat, Clock, Flame, Hourglass, Minus, Plus, ShoppingCart, Snowflake, Trash2, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { useLedger } from '../ledgerState';
import { useAllProduction } from '../sharedProduction';
import { batchesForOrders, type Batch } from '../shopping';
import { factorLabel } from '../bakePlan';
import { clock, estimateMake, hm, totalMake, type BakeSettings, type Finish } from '../bakeDay';
import { prepareSession } from '../db';
import { loadShopping, saveShopping, type ShoppingSaved } from '../shoppingState';
import { Picture } from './MenuPicture';

const FIN_KEY = 'ff-makelist-finish';
const loadFin = (): Record<string, Finish> => { try { return JSON.parse(localStorage.getItem(FIN_KEY) ?? '{}'); } catch { return {}; } };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export type MakeSettings = BakeSettings & { handsOn?: Record<string, number> };

export function MakeList({ s, saveS }: { s: MakeSettings; saveS: (n: MakeSettings) => void }) {
  const { recipes, run } = useApp();
  const { bakery } = useLedger();
  const records = useAllProduction(recipes);
  const [st, setSt] = useState<ShoppingSaved>(loadShopping);
  const save = (n: ShoppingSaved) => { setSt(n); saveShopping(n); };
  const [fin, setFin] = useState(loadFin);
  const setFinish = (id: string, f: Finish) => { const n = { ...fin, [id]: f }; setFin(n); try { localStorage.setItem(FIN_KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  const [adding, setAdding] = useState('');

  const auto = useMemo(() => batchesForOrders(bakery, recipes, records, st.includeRequests), [bakery, recipes, records, st.includeRequests]);
  const batches: Batch[] = useMemo(() => [
    ...auto.batches.map(b => ({ ...b, factor: st.overrides[b.recipeId] ?? b.factor })),
    ...st.manual.map(m => { const r = recipes.find(x => x.id === m.recipeId); return r ? { recipeId: r.id, title: r.title, need: 0, factor: m.factor, expected: 0, reason: 'added by you', basis: 'manual' as const } : null; }).filter(Boolean) as Batch[],
  ].filter(b => b.factor > 0), [auto, st.overrides, st.manual, recipes]);
  const rows = batches.map(b => {
    const r = recipes.find(x => x.id === b.recipeId)!;
    const finish: Finish = fin[b.recipeId] ?? (r.category === 'Cookies' ? 'freeze' : 'bake');
    return { b, r, est: estimateMake(r, b.factor, finish, s, bakery.bakeLogs) };
  }).filter(x => x.r);
  const total = totalMake(rows.map(x => x.est));

  const setFactor = (b: Batch, f: number) => {
    const v = Math.max(0, Math.round(f * 2) / 2);
    if (b.basis === 'manual') save({ ...st, manual: st.manual.map(m => (m.recipeId === b.recipeId ? { ...m, factor: v } : m)).filter(m => m.factor > 0) });
    else save({ ...st, overrides: { ...st.overrides, [b.recipeId]: v } });
  };
  const setHandsOn = (id: string, v: number | undefined) => { const h = { ...(s.handsOn ?? {}) }; if (v && v > 0) h[id] = v; else delete h[id]; saveS({ ...s, handsOn: h }); };
  const start = (r: (typeof rows)[number]) => void run(async () => { await prepareSession(r.r, r.b.factor); go('bake/' + r.r.id); });

  return (
    <div className="make-list">
      <p className="muted">Everything your orders and freezer need right now, plus anything you add. Same list as Shopping, so changes show up in both.</p>
      <label className="check"><input type="checkbox" checked={st.includeRequests} onChange={e => save({ ...st, includeRequests: e.target.checked })} /> Include order requests you haven't confirmed yet</label>

      {rows.length > 0 && (
        <div className="stat-tiles make-tiles">
          <div className="stat-tile"><span className="st-label"><Utensils size={14} /> Hands-on</span><strong className="st-value">{hm(total.handsOn)}</strong><span className="st-sub">{total.missingHandsOn ? `${total.missingHandsOn} not set yet` : 'mixing, scooping, frosting'}</span></div>
          <div className="stat-tile"><span className="st-label"><Flame size={14} /> Oven</span><strong className="st-value">{hm(total.oven)}</strong><span className="st-sub">{total.missingOven ? `${total.missingOven} without a bake time` : `${s.traysAtOnce} at a time`}</span></div>
          <div className="stat-tile"><span className="st-label"><Hourglass size={14} /> Longest wait</span><strong className="st-value">{hm(total.longestWait)}</strong><span className="st-sub">chill / cool (overlaps other work)</span></div>
          <div className="stat-tile hero"><span className="st-label"><Clock size={14} /> About</span><strong className="st-value">{hm(total.total)}</strong><span className="st-sub">{total.missingHandsOn || total.missingOven ? 'plus the times not set yet' : `done around ${clock(toMin(s.start) + total.total)} if you start at ${clock(toMin(s.start))}`}</span></div>
        </div>
      )}

      {rows.length === 0 && <p className="banner info">Nothing needed for your orders right now. Add a batch below to plan a bake day anyway.</p>}
      <ul className="make-rows">
        {rows.map(x => {
          const { b, r, est } = x;
          const cookie = r.category === 'Cookies';
          const bt = est.times.bake;
          return (
            <li key={b.recipeId} className="card make-row">
              <div className="make-top">
                <Picture look={bakery.looks[r.id]} title={r.title} seed={r.id} size={52} />
                <div className="grow">
                  <strong>{r.title}</strong>
                  <span className="muted small">{b.reason}{est.items ? ` · makes about ${est.items}` : ''}</span>
                </div>
                <div className="stepper" role="group" aria-label={`Batch size for ${r.title}`}>
                  <button aria-label="Smaller batch" onClick={() => setFactor(b, b.factor - 0.5)}>{b.factor <= 0.5 ? <Trash2 size={15} /> : <Minus size={15} />}</button>
                  <b>{factorLabel(b.factor)}</b>
                  <button aria-label="Bigger batch" onClick={() => setFactor(b, b.factor + 0.5)}><Plus size={15} /></button>
                </div>
              </div>
              {cookie && (
                <div className="seg small-seg" role="group" aria-label="What happens to the dough">
                  <button className={est.finish === 'freeze' ? 'on' : ''} onClick={() => setFinish(r.id, 'freeze')}><Snowflake size={14} /> Dough to the freezer</button>
                  <button className={est.finish === 'bake' ? 'on' : ''} onClick={() => setFinish(r.id, 'bake')}><Flame size={14} /> Bake them</button>
                </div>
              )}
              <div className="make-times">
                <span><Utensils size={14} /> {est.handsOn ? <>{est.handsOn.minutes} min hands-on <i className="muted">({est.handsOn.from === 'you' ? 'your estimate' : 'from your test bakes'})</i></> : 'Hands-on: not set'}
                  <label className="inline small">min <input inputMode="numeric" aria-label={`Hands-on minutes for ${r.title}`} defaultValue={s.handsOn?.[r.id] ?? ''} placeholder={est.handsOn ? String(est.handsOn.minutes) : '?'} onBlur={e => setHandsOn(r.id, Number(e.target.value) || undefined)} /></label>
                </span>
                {est.wait > 0 && <span><Hourglass size={14} /> {hm(est.wait)} waiting <i className="muted">({est.times.waitLabels.join(', ')})</i></span>}
                {est.finish === 'bake' && <span><Flame size={14} /> {est.ovenMin !== null ? <>{hm(est.ovenMin)} in the oven <i className="muted">({est.rounds} round{est.rounds !== 1 ? 's' : ''} × {bt!.max} min{r.ovenTemp ? ` at ${r.ovenTemp}` : ''})</i></> : <>Bake time unknown <label className="inline small">min per round <input inputMode="numeric" aria-label={`Bake minutes for ${r.title}`} defaultValue={s.minutes[r.id] ?? ''} onBlur={e => { const n = Math.round(Number(e.target.value)); const m = { ...s.minutes }; if (n > 0) m[r.id] = n; else delete m[r.id]; saveS({ ...s, minutes: m }); }} /></label></>}</span>}
              </div>
              <div className="btn-row"><button className="small-btn primary" onClick={() => start(x)}><ChefHat size={15} /> Start {factorLabel(b.factor)} batch</button></div>
            </li>
          );
        })}
      </ul>
      {auto.cannotSize.length > 0 && <p className="muted small">Can't size a batch yet for: {auto.cannotSize.map(c => `${c.title} (${c.need} needed)`).join(', ')}. Add a yield to the recipe.</p>}

      <div className="btn-row add-row">
        <select aria-label="Add a batch of" value={adding} onChange={e => setAdding(e.target.value)}>
          <option value="">Add a batch of…</option>
          {recipes.filter(r => !r.deletedAt).sort((a, b) => a.title.localeCompare(b.title)).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <button disabled={!adding} onClick={() => { save({ ...st, manual: [...st.manual.filter(m => m.recipeId !== adding), { recipeId: adding, factor: 1 }] }); setAdding(''); }}><Plus size={16} /> Add</button>
        <button onClick={() => go('shopping')}><ShoppingCart size={16} /> Shopping list for all of this</button>
      </div>
      <p className="muted small">Approximate. Oven time uses the longer end of each recipe's bake time with your tray settings; waiting times come from the recipe steps and overlap other work, so only the longest counts. Hands-on time comes from your estimate or your test bakes. Preheating and cleanup aren't included.</p>
    </div>
  );
}
