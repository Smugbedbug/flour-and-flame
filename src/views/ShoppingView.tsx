// Shopping list: what to bake → combined ingredients → what to buy.
import { Check, Copy, Minus, Plus, Printer, RotateCcw, ShoppingCart, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { useLedger } from '../ledgerState';
import { useAllProduction } from '../sharedProduction';
import { batchesForOrders, lineAmountText, listAsText, shoppingList, type Batch } from '../shopping';
import { factorLabel } from '../bakePlan';
import { money } from '../costing';
import { RecipeArt } from '../components/CookieArt';
import { loadShopping, saveShopping, type ShoppingSaved } from '../shoppingState';
import { ShoppingIntro } from '../components/ShoppingIntro';

type Saved = ShoppingSaved;
const load = loadShopping;

export function ShoppingView() {
  const { recipes, catalog, notify } = useApp();
  const { bakery } = useLedger();
  const records = useAllProduction(recipes);
  const [st, setSt] = useState<Saved>(load);
  const save = (s: Saved) => { setSt(s); saveShopping(s); };
  const [adding, setAdding] = useState('');
  const [extra, setExtra] = useState('');

  const auto = useMemo(() => batchesForOrders(bakery, recipes, records, st.includeRequests), [bakery, recipes, records, st.includeRequests]);
  const batches: Batch[] = useMemo(() => [
    ...auto.batches.map(b => ({ ...b, factor: st.overrides[b.recipeId] ?? b.factor })),
    ...st.manual.map(m => { const r = recipes.find(x => x.id === m.recipeId); return r ? { recipeId: r.id, title: r.title, need: 0, factor: m.factor, expected: 0, reason: 'added by you', basis: 'manual' as const } : null; }).filter(Boolean) as Batch[],
  ].filter(b => b.factor > 0), [auto, st.overrides, st.manual, recipes]);
  const list = useMemo(() => shoppingList(batches, recipes, catalog, auto.cannotSize), [batches, recipes, catalog, auto.cannotSize]);
  const stores = [...new Set(list.lines.map(l => l.store))];
  const left = list.lines.filter(l => !st.have[l.key]).length + st.extras.filter(e => !st.have['x:' + e.id]).length;
  const toBuyCost = list.lines.filter(l => !st.have[l.key] && !l.optional && l.buy?.cost != null).reduce((s, l) => s + l.buy!.cost!, 0);

  const setFactor = (b: Batch, f: number) => {
    const v = Math.max(0, Math.round(f * 2) / 2);
    if (b.basis === 'manual' && !b.subFor) save({ ...st, manual: st.manual.map(m => (m.recipeId === b.recipeId ? { ...m, factor: v } : m)).filter(m => m.factor > 0) });
    else save({ ...st, overrides: { ...st.overrides, [b.recipeId]: v } });
  };

  return (
    <div className="page shopping">
      <ShoppingIntro />
      <div className="page-head"><h2><ShoppingCart size={24} /> Shopping list</h2></div>

      <section className="card">
        <h3>What you’re baking</h3>
        <label className="agree"><input type="checkbox" checked={st.includeRequests} onChange={e => save({ ...st, includeRequests: e.target.checked })} /> Include order requests you haven’t confirmed yet</label>
        {!batches.length && !auto.cannotSize.length && <p className="muted">Nothing to bake for orders right now: the freezer covers everything. Add a batch below to shop for it anyway.</p>}
        <div className="batch-list">
          {list.batches.map(b => {
            const r = recipes.find(x => x.id === b.recipeId);
            return (
              <div key={b.recipeId + (b.subFor ?? '')} className="batch-row">
                {r && <RecipeArt recipe={r} size={52} />}
                <div className="batch-info">
                  <strong>{b.title}</strong>
                  <span className="muted small">{b.subFor ? `Homemade, for ${b.reason.replace(/^homemade, for /, '')}` : b.reason}{b.expected ? ` · makes about ${b.expected}` : ''}{b.basis === 'history' ? ' (from your bakes)' : ''}</span>
                </div>
                {b.subFor ? <span className="pill small">{Math.round(b.factor * 100) / 100}× batch</span> : (
                  <span className="stepper small">
                    <button aria-label={`Smaller batch of ${b.title}`} onClick={() => setFactor(b, b.factor - 0.5)}><Minus size={16} /></button>
                    <output aria-label={`Batch size ${b.title}`}>{factorLabel(b.factor)}</output>
                    <button aria-label={`Bigger batch of ${b.title}`} onClick={() => setFactor(b, b.factor + 0.5)}><Plus size={16} /></button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {auto.cannotSize.length > 0 && <p className="small warn-text">Can’t size a batch for {auto.cannotSize.map(c => `${c.title} (${c.need} needed)`).join(', ')}: the recipe has no yield yet. Record a bake or set the yield on the recipe.</p>}
        <div className="btn-row add-batch">
          <select aria-label="Add a batch of" value={adding} onChange={e => setAdding(e.target.value)}>
            <option value="">Add a batch of…</option>
            {recipes.filter(r => !r.deletedAt).sort((a, b) => a.title.localeCompare(b.title)).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <button disabled={!adding} onClick={() => { save({ ...st, manual: [...st.manual.filter(m => m.recipeId !== adding), { recipeId: adding, factor: 1 }] }); setAdding(''); }}><Plus size={16} /> Add</button>
          {Object.keys(st.overrides).length > 0 && <button className="small-btn" onClick={() => save({ ...st, overrides: {} })}><RotateCcw size={14} /> Reset batch sizes</button>}
        </div>
      </section>

      {(list.lines.length > 0 || st.extras.length > 0) && (
        <section className="card shop-card">
          <div className="order-top">
            <h3>To buy <span className="pill small">{left} left</span></h3>
            <strong className="shop-total">{toBuyCost > 0 ? (list.unpriced ? `at least ${money(toBuyCost)}` : money(toBuyCost)) : list.unpriced ? '—' : money(0)}</strong>
          </div>
          <p className="muted small">Tap an item when it’s in your cart, or if you already have enough at home. {list.unpriced ? (toBuyCost > 0 ? `${list.unpriced} item${list.unpriced > 1 ? 's have' : ' has'} no package price yet, so the total is a minimum.` : 'Add package prices on the Prices page to see what this will cost.') : 'Estimated from your price list.'}</p>
          {stores.map(store => (
            <div key={store} className="shop-store">
              {stores.length > 1 && <h4>{store}</h4>}
              <ul className="shop-list">
                {list.lines.filter(l => l.store === store).map(l => {
                  const done = !!st.have[l.key];
                  return (
                    <li key={l.key} className={done ? 'done' : ''}>
                      <button className="shop-check" aria-pressed={done} aria-label={`${done ? 'Unmark' : 'Got'} ${l.name}`} onClick={() => save({ ...st, have: { ...st.have, [l.key]: !done } })}>{done && <Check size={20} strokeWidth={3} />}</button>
                      <div className="shop-body">
                        <strong>{l.name}</strong>{l.optional && <span className="pill small">optional</span>}
                        <span className="shop-amt">{lineAmountText(l)}</span>
                        <span className="muted small">{l.buy ? `Buy ${l.buy.text} · ${money(l.buy.cost!)}` : l.product ? (l.pinchOnly ? 'Check you have some' : 'No package price yet') : <>Not in your price list · <button className="link" onClick={() => go('ingredients')}>add it</button></>}{' · '}for {l.usedIn.join(', ')}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {st.extras.length > 0 && <div className="shop-store"><h4>Also</h4><ul className="shop-list">
            {st.extras.map(e => { const k = 'x:' + e.id, done = !!st.have[k]; return (
              <li key={e.id} className={done ? 'done' : ''}>
                <button className="shop-check" aria-pressed={done} aria-label={`${done ? 'Unmark' : 'Got'} ${e.text}`} onClick={() => save({ ...st, have: { ...st.have, [k]: !done } })}>{done && <Check size={20} strokeWidth={3} />}</button>
                <div className="shop-body"><strong>{e.text}</strong></div>
                <button className="small-btn" aria-label={`Remove ${e.text}`} onClick={() => save({ ...st, extras: st.extras.filter(x => x.id !== e.id) })}><Trash2 size={14} /></button>
              </li>); })}
          </ul></div>}
          <form className="btn-row add-extra" onSubmit={e => { e.preventDefault(); if (extra.trim()) { save({ ...st, extras: [...st.extras, { id: crypto.randomUUID(), text: extra.trim() }] }); setExtra(''); } }}>
            <input aria-label="Add something else" value={extra} onChange={e => setExtra(e.target.value)} placeholder="Add something else (boxes, parchment…)" />
            <button type="submit" disabled={!extra.trim()}><Plus size={16} /> Add</button>
          </form>
          <div className="btn-row no-print">
            <button onClick={() => void navigator.clipboard?.writeText(listAsText(list, st.have, st.extras)).then(() => notify('List copied. Paste it into a text or note.')).catch(() => notify('Copy failed.', true))}><Copy size={16} /> Copy list</button>
            <button onClick={() => window.print()}><Printer size={16} /> Print</button>
            <button className="small-btn" onClick={() => save({ ...st, have: {} })}><X size={14} /> Untick all</button>
            {st.manual.length > 0 && <button className="small-btn" onClick={() => save({ ...st, manual: [] })}><Trash2 size={14} /> Remove added batches</button>}
          </div>
        </section>
      )}
      <p className="muted small">Amounts come from your recipes. Volume and weight are only combined when the price list has the teaspoon weight. Nothing is guessed, so the same item can appear as e.g. “2 cups + 150 g”.</p>
    </div>
  );
}
