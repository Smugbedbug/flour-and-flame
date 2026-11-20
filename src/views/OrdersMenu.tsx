// Menu tab: what you sell. Half dozens / dozens for cookies, any size for other recipes, and mixed boxes.
import { Boxes, CalendarClock, Pencil, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { go, useApp } from '../app-context';
import { addEvents, getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';
import { costPerItem, expectedItems, money, recipeCost } from '../costing';
import { writeRecipe } from '../db';
import type { Product } from '../freezer';
import { CATEGORIES, type Recipe, type RecipeCategory } from '../types';
import { missingLookEvents, Picture, PictureDialog } from '../components/MenuPicture';
import { ImagePlus } from 'lucide-react';

const SIZES = [{ pieces: 6, label: 'Half dozen' }, { pieces: 12, label: 'Dozen' }];
const CUP_SIZES = [{ pieces: 1, label: 'Single' }, { pieces: 4, label: 'Box of 4' }, { pieces: 6, label: 'Half dozen' }, { pieces: 12, label: 'Dozen' }];
const sizesFor = (r: Recipe) => r.category === 'Cookies' ? SIZES : r.category === 'Cupcakes' ? CUP_SIZES : [];
/** Copy a recipe's season (if its other sizes have one) onto a new size. */
const seasonOf = (products: Product[], recipeId: string) => { const p = products.find(x => x.recipeId === recipeId && x.kind !== 'mixed' && (x.from || x.to)); return p ? { from: p.from, to: p.to, feature: p.feature } : {}; };

function perPiece(r: Recipe | undefined, catalog: Parameters<typeof recipeCost>[1]): number | null {
  if (!r) return null;
  return costPerItem(recipeCost(r, catalog), expectedItems(r));
}
const scriptVersion = () => Number((getSheetConfig() as any).scriptVersion ?? 0);

export function MenuTab() {
  const { recipes, catalog, packaging, run, refresh, notify } = useApp();
  const { bakery } = useLedger();
  const [cat, setCat] = useState<RecipeCategory>('Cookies');
  const [picFor, setPicFor] = useState<Recipe | null>(null);
  const shown = recipes.filter(r => r.category === cat);
  const counts = Object.fromEntries(CATEGORIES.map(c => [c, bakery.products.filter(p => p.active && p.kind !== 'mixed' && recipes.find(r => r.id === p.recipeId)?.category === c).length]));
  return (
    <>
      <p className="muted">Choose what you sell. Prices are per box; costs are estimates from your price list (ingredients{' '}+ packaging if set). Only <b>Approved</b> recipes can be sold. Cookies use dough balls from The Freezer; other treats (like cupcakes) don’t. Any flavour can be set to show only for a week, a month or certain dates.</p>
      {(() => {
        const onMenu = [...new Set(bakery.products.filter(p => p.active).flatMap(p => p.kind === 'mixed' ? (p.options ?? []).map(o => o.recipeId) : [p.recipeId]))]
          .map(id => recipes.find(r => r.id === id)).filter(Boolean) as Recipe[];
        const drawn = onMenu.filter(r => !bakery.looks[r.id]?.photo);
        if (!onMenu.length) return null;
        return (
          <section className="card pic-todo">
            <h3><ImagePlus size={18} /> Pictures customers see</h3>
            {drawn.length ? <p className="small">{drawn.length} of {onMenu.length} menu recipe{onMenu.length > 1 ? 's' : ''} still use the drawn illustration. Tap one to make a realistic AI picture (or upload a photo once you’ve baked it).</p> : <p className="small ok-text">✓ Every recipe on the menu has a picture.</p>}
            <div className="pic-todo-row">
              {onMenu.map(r => <button key={r.id} className={'pic-todo-item' + (bakery.looks[r.id]?.photo ? ' done' : '')} onClick={() => setPicFor(r)}><Picture look={bakery.looks[r.id]} title={r.title} seed={r.id} size={64} /><span>{r.title}</span><em>{bakery.looks[r.id]?.photo ? 'Picture ✓' : 'Make picture'}</em></button>)}
            </div>
          </section>
        );
      })()}
      <MixedBoxes />
      <div className="chip-row" role="tablist" aria-label="Recipe category">
        {CATEGORIES.map(c => <button key={c} role="tab" aria-selected={cat === c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}{counts[c] ? ` · ${counts[c]} on menu` : ''}</button>)}
      </div>
      {!shown.length && <p className="muted">No {cat.toLowerCase()} recipes yet.</p>}
      <div className="menu-grid">
        {shown.map(r => {
          const pp = perPiece(r, catalog);
          const cost = (pieces: number) => (pp !== null ? pp * pieces + (packaging[r.id] ?? 0) : null);
          const mine = bakery.products.filter(p => p.recipeId === r.id && p.kind !== 'mixed');
          const custom = mine.filter(p => !(sizesFor(r).some(s => s.pieces === p.pieces && (!p.sizeLabel || r.category === 'Cupcakes'))));
          return (
            <section key={r.id} className="card menu-card">
              <div className="menu-head">
                <button className="pic-btn" aria-label={`Change the order-form picture for ${r.title}`} onClick={() => setPicFor(r)} disabled={r.status !== 'Approved'}>
                  <Picture look={bakery.looks[r.id]} title={r.title} seed={r.id} size={76} />
                  {r.status === 'Approved' && <span className="pic-edit"><ImagePlus size={13} /> Picture &amp; text</span>}
                </button>
                <div className="order-top"><span><strong>{r.title}</strong>{bakery.looks[r.id]?.blurb && <span className="muted small menu-blurb">{bakery.looks[r.id]!.blurb}</span>}</span><span className={'pill small ' + (r.status === 'Approved' ? 'ok' : '')}>{r.status}</span></div>
              </div>
              {r.status !== 'Approved' ? (
                <div>
                  <p className="muted small">Not approved for sale yet.</p>
                  <button className="small-btn" onClick={() => { if (window.confirm(`Mark “${r.title}” as Approved for sale? This saves a new version of the recipe.`)) void run(async () => { await writeRecipe({ ...r, status: 'Approved' }, r.version); await refresh(); notify(`${r.title} approved for sale.`); }); }}>Mark approved</button>
                </div>
              ) : (
                <>
                  <SeasonPicker recipe={r} products={mine} />
                  {sizesFor(r).map(s => <ProductRow key={s.pieces} recipe={r} pieces={s.pieces} label={s.label} existing={bakery.products.find(p => p.productId === `${r.id}-${s.pieces}`)} cost={cost(s.pieces)} />)}
                  {custom.map(p => <ProductRow key={p.productId} recipe={r} pieces={p.pieces} label={p.sizeLabel ?? `${p.pieces} pieces`} existing={p} cost={cost(p.pieces)} custom />)}
                  <AddSize recipe={r} taken={mine.map(p => p.pieces)} />
                </>
              )}
            </section>
          );
        })}
      </div>
      {picFor && <PictureDialog recipe={picFor} look={bakery.looks[picFor.id]} onClose={() => setPicFor(null)} />}
    </>
  );
}

function ProductRow({ recipe, pieces, label, existing, cost, custom }: { recipe: Recipe; pieces: number; label: string; existing?: Product; cost: number | null; custom?: boolean }) {
  const { run, notify, recipes } = useApp();
  const { bakery } = useLedger();
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const p = Number(price);
  const save = (active: boolean) => {
    if (!(p > 0)) { notify('Enter a price.', true); return; }
    const product: Product = { productId: `${recipe.id}-${pieces}`, name: `${label}: ${recipe.title}`, recipeId: recipe.id, recipeTitle: recipe.title, pieces, price: Math.round(p * 100) / 100, active,
      kind: 'single', dough: recipe.category === 'Cookies', category: recipe.category, ...((custom || recipe.category === 'Cupcakes') ? { sizeLabel: label } : {}), ...seasonOf(bakery.products, recipe.id) };
    void run(async () => { await addEvents([{ type: 'product.upsert', product } as any, ...(active ? missingLookEvents([recipe.id], recipes, bakery.looks) : [])]); notify(active ? `${product.name} is on the menu at ${money(product.price)}.` : `${product.name} hidden from the menu.`); });
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

function AddSize({ recipe, taken }: { recipe: Recipe; taken: number[] }) {
  const { run, notify, recipes } = useApp();
  const { bakery } = useLedger();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Box of 4');
  const [pieces, setPieces] = useState('4');
  const [price, setPrice] = useState('');
  const n = Math.round(Number(pieces)), pr = Number(price);
  const ok = label.trim() && n >= 1 && n <= 200 && pr > 0 && !taken.includes(n);
  if (!open) return <button className="small-btn" onClick={() => setOpen(true)}><Plus size={14} /> Add a size</button>;
  return (
    <div className="add-size">
      <div className="form-grid">
        <label className="field">Size name<input value={label} onChange={e => setLabel(e.target.value)} placeholder="Box of 4, Pan, Single…" /></label>
        <label className="field">Pieces<input inputMode="numeric" value={pieces} onChange={e => setPieces(e.target.value)} /></label>
        <label className="field">Price ($)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label>
      </div>
      {taken.includes(n) && <p className="muted small">There’s already a {n}-piece size for this recipe; change its price above.</p>}
      <div className="btn-row">
        <button className="small-btn primary" disabled={!ok} onClick={() => void run(async () => {
          const product: Product = { productId: `${recipe.id}-${n}`, name: `${label.trim()}: ${recipe.title}`, recipeId: recipe.id, recipeTitle: recipe.title, pieces: n, price: Math.round(pr * 100) / 100, active: true, kind: 'single', sizeLabel: label.trim(), dough: recipe.category === 'Cookies', category: recipe.category, ...seasonOf(bakery.products, recipe.id) };
          await addEvents([{ type: 'product.upsert', product } as any, ...missingLookEvents([recipe.id], recipes, bakery.looks)]); notify(`${product.name} is on the menu at ${money(product.price)}.`); setOpen(false);
        })}>Add to menu</button>
        <button className="small-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------- Seasons: flavour of the week / month ----------------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weekRange(offset: number) { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); const e = new Date(d); e.setDate(d.getDate() + 6); return { from: iso(d), to: iso(e) }; }
function monthRange(offset: number) { const d = new Date(); const a = new Date(d.getFullYear(), d.getMonth() + offset, 1, 12); const b = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 12); return { from: iso(a), to: iso(b) }; }
export const niceDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export function seasonText(p: { from?: string; to?: string; feature?: string }): string {
  if (!p.from && !p.to) return 'Always on the menu';
  const label = p.feature === 'week' ? 'Flavor of the week' : p.feature === 'month' ? 'Flavor of the month' : 'Limited time';
  return `${label} · ${p.from ? niceDay(p.from) : 'now'} – ${p.to ? niceDay(p.to) : 'open-ended'}`;
}

/** When this flavour shows on the order form: always, this/next week, this/next month, or dates. Applies to all its sizes. */
function SeasonPicker({ recipe, products }: { recipe: Recipe; products: Product[] }) {
  const { run, notify } = useApp();
  const [custom, setCustom] = useState(false);
  const cur = products.find(p => p.from || p.to) ?? products[0];
  const [from, setFrom] = useState(cur?.from ?? ''); const [to, setTo] = useState(cur?.to ?? '');
  if (!products.length) return null;
  const today = iso(new Date());
  const apply = (s: { from?: string; to?: string; feature?: Product['feature'] }) => void run(async () => {
    await addEvents(products.map(p => { const { from: _f, to: _t, feature: _x, ...rest } = p; return { type: 'product.upsert', product: { ...rest, ...(s.from || s.to ? s : {}) } } as any; }));
    notify(s.from || s.to ? `${recipe.title}: ${seasonText(s)}.` : `${recipe.title} is on the menu all the time again.`);
    setCustom(false);
  });
  const status = !cur?.from && !cur?.to ? '' : cur.to && cur.to < today ? ' (ended: not on the form)' : cur.from && cur.from > today ? ' (coming soon: shows as a teaser)' : ' (on the form now)';
  return (
    <div className="season-picker">
      <span className="small"><CalendarClock size={14} /> <b>{seasonText(cur ?? {})}</b><span className="muted">{status}</span></span>
      <div className="chip-row">
        <button className="chip" onClick={() => apply({})}>Always</button>
        <button className="chip" onClick={() => apply({ ...weekRange(0), feature: 'week' })}>This week</button>
        <button className="chip" onClick={() => apply({ ...weekRange(1), feature: 'week' })}>Next week</button>
        <button className="chip" onClick={() => apply({ ...monthRange(0), feature: 'month' })}>This month</button>
        <button className="chip" onClick={() => apply({ ...monthRange(1), feature: 'month' })}>Next month</button>
        <button className="chip" onClick={() => setCustom(!custom)}>Dates…</button>
      </div>
      {custom && <div className="form-grid">
        <label className="field">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="field">Until<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
        <div className="btn-row"><button className="small-btn primary" disabled={!from || !to || to < from} onClick={() => apply({ from, to, feature: 'dates' })}>Set dates</button></div>
      </div>}
    </div>
  );
}

// ---------------- Mixed boxes ----------------
function MixedBoxes() {
  const { bakery } = useLedger();
  const [editing, setEditing] = useState<Product | null>(null);
  const mixed = bakery.products.filter(p => p.kind === 'mixed');
  const v = scriptVersion();
  const blocked = !!getSheetConfig().url && v < 4; // mixed boxes need v4 or later
  return (
    <section className="card">
      <h3><Boxes size={18} /> Mixed boxes</h3>
      <p className="muted small">Let customers pick their own flavours, e.g. a dozen in groups of 3 (four flavours) or 6 (two flavours).</p>
      {blocked && <p className="banner warn small">Mixed boxes need bakery-sheet script version 4 so the order form can take flavour choices. Open <button className="link" onClick={() => go('sheet')}>bakery sheet settings</button> → “Update the script” first.</p>}
      <div className="list">
        {mixed.map(p => (
          <div key={p.productId} className={'history-row' + (p.active ? '' : ' inactive')}>
            <span><strong>{p.name}</strong> <span className="muted small">· {p.pieces} pieces · {money(p.price)} · groups of {p.step ?? 1} · {(p.options ?? []).map(o => o.recipeTitle).join(', ')}</span>{!p.active && <span className="pill small">hidden</span>}</span>
            <button className="small-btn" onClick={() => setEditing(p)}><Pencil size={14} /> Edit</button>
          </div>
        ))}
      </div>
      <button disabled={blocked} onClick={() => setEditing({ productId: 'mix-' + crypto.randomUUID().slice(0, 8), name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed boxes', pieces: 12, price: 0, active: true, kind: 'mixed', step: 3, options: [] })}><Plus size={16} /> New mixed box</button>
      {editing && <MixedEditor value={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function MixedEditor({ value, onClose }: { value: Product; onClose: () => void }) {
  const { recipes, run, notify } = useApp();
  const { bakery } = useLedger();
  const approved = recipes.filter(r => r.status === 'Approved');
  const [p, setP] = useState(value);
  const [price, setPrice] = useState(value.price ? String(value.price) : '');
  const opts = p.options ?? [];
  const step = p.step ?? 1;
  const problems = [
    !p.name.trim() && 'Give it a name.',
    !(Number(price) > 0) && 'Enter a price.',
    opts.length < 2 && 'Choose at least two flavours.',
    p.pieces % step !== 0 && `${p.pieces} pieces can’t be split into groups of ${step}.`,
  ].filter(Boolean) as string[];
  const toggle = (r: Recipe) => setP({ ...p, options: opts.some(o => o.recipeId === r.id) ? opts.filter(o => o.recipeId !== r.id) : [...opts, { recipeId: r.id, recipeTitle: r.title, ...(r.category === 'Cookies' ? {} : { dough: false }) }] });
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mix-title">
      <div className="modal wide">
        <h3 id="mix-title"><Boxes size={18} /> Mixed box</h3>
        <div className="form-grid">
          <label className="field">Name<input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} placeholder="Mixed dozen" /></label>
          <label className="field">Pieces per box<input inputMode="numeric" value={p.pieces} onChange={e => setP({ ...p, pieces: Math.max(1, Math.min(60, Math.round(Number(e.target.value)) || 1)) })} /></label>
          <label className="field">Price ($)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></label>
          <label className="field">Flavours chosen in groups of<select value={step} onChange={e => setP({ ...p, step: Number(e.target.value) })}>{[1, 2, 3, 4, 6].map(n => <option key={n} value={n}>{n}{p.pieces % n === 0 ? ` (up to ${Math.min(p.pieces / n, opts.length || p.pieces / n)} flavours)` : ' (doesn’t divide evenly)'}</option>)}</select></label>
        </div>
        <fieldset className="field mix-options">
          <legend>Flavours customers can choose</legend>
          {approved.map(r => <label key={r.id} className="agree"><input type="checkbox" checked={opts.some(o => o.recipeId === r.id)} onChange={() => toggle(r)} /> {r.title} <span className="muted small">({r.category})</span></label>)}
          {!approved.length && <p className="muted small">Approve some recipes first.</p>}
        </fieldset>
        <label className="agree"><input type="checkbox" checked={p.active} onChange={e => setP({ ...p, active: e.target.checked })} /> Show on the menu</label>
        {problems.length > 0 && <p className="muted small">{problems.join(' ')}</p>}
        <div className="btn-row">
          <button className="primary" disabled={problems.length > 0} onClick={() => void run(async () => {
            const product: Product = { ...p, name: p.name.trim(), price: Math.round(Number(price) * 100) / 100, recipeTitle: 'Mixed boxes', recipeId: 'mixed', kind: 'mixed', options: opts };
            await addEvents([{ type: 'product.upsert', product } as any, ...missingLookEvents(opts.map(o => o.recipeId), recipes, bakery.looks)]); notify(`${product.name} saved.`); onClose();
          })}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
