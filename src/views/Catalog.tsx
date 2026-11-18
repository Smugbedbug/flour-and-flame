import { AlertTriangle, ChevronLeft, GitMerge, Plus, Save, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { mergeCatalog, unmergeCatalog, writeCatalog } from '../db';
import { stableCatalogId } from '../logic';
import { canonicalName, findByName, money, possibleDuplicates, recipeCost, substitutionGroup, toBase } from '../costing';
import { isButter } from '../units';
import type { CatalogIngredient } from '../types';

const PKG_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl oz', 'tsp', 'tbsp', 'cup', 'each', 'dozen', 'stick'];

export function Catalog({ id }: { id?: string }) {
  const { catalog, recipes, run, refresh, notify } = useApp();
  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  const item = id ? catalog.find(c => c.id === id) : undefined;

  // ingredients blocking recipe costs, with the recipes they block
  const attention = useMemo(() => {
    const m = new Map<string, { c?: CatalogIngredient; name: string; message: string; recipes: string[] }>();
    for (const r of recipes) for (const i of recipeCost(r, catalog).issues) {
      const key = i.product?.id ?? 'n:' + canonicalName(i.name);
      const e = m.get(key) ?? { c: i.product, name: i.product?.name ?? i.name, message: i.message ?? '', recipes: [] };
      if (!e.recipes.includes(r.title)) e.recipes.push(r.title);
      m.set(key, e);
    }
    return [...m.values()];
  }, [recipes, catalog]);
  const dups = useMemo(() => possibleDuplicates(catalog), [catalog]);

  if (id && item) return <CatalogEdit key={item.id} item={item} />;

  const active = catalog.filter(c => !c.mergedInto);
  const cq = canonicalName(q);
  const list = active.filter(c => [c.name, ...(c.aliases ?? [])].some(n => n.toLowerCase().includes(q.toLowerCase()) || (cq.length > 2 && canonicalName(n).includes(cq))));
  async function add() {
    const name = newName.trim();
    if (!name) return;
    const existing = findByName(name, catalog);
    if (existing) { notify(`That's already in the list as “${existing.name}”.`, true); go('ingredients/' + existing.id); return; }
    await run(async () => { const c = { id: stableCatalogId(name), name }; await writeCatalog(c); await refresh(); setNewName(''); go('ingredients/' + c.id); });
  }
  async function merge(fromId: string, intoId: string) {
    const from = catalog.find(c => c.id === fromId)!, into = catalog.find(c => c.id === intoId)!;
    if (!window.confirm(`Treat “${from.name}” as the same ingredient as “${into.name}”?\n\nRecipes are not edited; costs will use “${into.name}” and its price. You can undo this later.`)) return;
    await run(async () => { await mergeCatalog(fromId, intoId); await refresh(); notify(`Merged “${from.name}” into “${into.name}”.`); });
  }
  const pricedFirst = (a: CatalogIngredient, b: CatalogIngredient): [CatalogIngredient, CatalogIngredient] => (a.price === undefined && b.price !== undefined ? [a, b] : [b, a]);

  return (
    <div className="page">
      <div className="page-head"><h2>Ingredients &amp; Prices</h2><span className="muted">{active.filter(c => c.price !== undefined).length} of {active.length} priced</span></div>
      <p className="muted">A simple price list of what you buy, with no stock counting. When a price or package size changes, overwrite it and every recipe estimate updates right away. Prices are optional.</p>

      {attention.length > 0 && (
        <section className="card">
          <h3><AlertTriangle size={18} /> Needs attention for complete costing</h3>
          <div className="list">
            {attention.map(a => (
              <button key={a.c?.id ?? a.name} className="row-btn" onClick={() => a.c ? go('ingredients/' + a.c.id) : setNewName(a.name)}>
                <strong>{a.name}</strong><span>{a.message} · {a.recipes.join(', ')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {dups.length > 0 && (
        <section className="card">
          <h3><GitMerge size={18} /> Possible duplicates</h3>
          <p className="muted small">These look like the same ingredient. Merging keeps one price and leaves recipes untouched.</p>
          {dups.map(([a, b]) => { const [from, into] = pricedFirst(a, b); return (
            <div key={a.id + b.id} className="history-row">
              <span>“{from.name}”{from.price === undefined ? ' (no price)' : ''} ↔ “{into.name}”{into.price !== undefined ? ` (${money(into.price)})` : ''}</span>
              <span className="btn-row"><button className="small-btn" onClick={() => void merge(from.id, into.id)}>Merge into “{into.name}”</button><button className="small-btn" onClick={() => void merge(into.id, from.id)}>Keep “{from.name}”</button></span>
            </div>
          ); })}
        </section>
      )}

      <label className="search"><Search size={18} /><input aria-label="Search ingredients" value={q} onChange={e => setQ(e.target.value)} placeholder="Search ingredients" /></label>
      <div className="recipe-grid">
        {list.map(c => (
          <button key={c.id} className="recipe-card" onClick={() => go('ingredients/' + c.id)}>
            <strong>{c.name}</strong>
            <span>{c.price === undefined ? 'No price' : `${money(c.price)} / ${c.packageAmount} ${c.packageUnit}`}{c.store ? ` · ${c.store}` : ''}{c.gramsPerTsp ? ` · ${c.gramsPerTsp} g/tsp` : ''}</span>
            {!!c.aliases?.length && <span className="tags">{c.aliases.map(a => <em key={a}>{a}</em>)}</span>}
          </button>
        ))}
      </div>
      <form className="inline add-ing" onSubmit={e => { e.preventDefault(); void add(); }}>
        <input aria-label="New ingredient name" placeholder="New ingredient name" value={newName} onChange={e => setNewName(e.target.value)} />
        <button type="submit"><Plus size={16} /> Add ingredient</button>
      </form>
    </div>
  );
}

function CatalogEdit({ item }: { item: CatalogIngredient }) {
  const { catalog, recipes, run, refresh, notify } = useApp();
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(item.packageAmount?.toString() ?? '');
  const [unit, setUnit] = useState(item.packageUnit ?? (/\begg/i.test(item.name) ? 'each' : 'lb'));
  const [price, setPrice] = useState(item.price?.toString() ?? '');
  const [store, setStore] = useState(item.store ?? '');
  const [brand, setBrand] = useState(item.brand ?? '');
  const [aliases, setAliases] = useState((item.aliases ?? []).join(', '));
  const [gpt, setGpt] = useState(item.gramsPerTsp?.toString() ?? '');
  const [ratio, setRatio] = useState(item.substituteRatio?.toString() ?? '');
  const butter = isButter(item.name);
  const group = substitutionGroup(item.name);
  const a = Number(amount), p = Number(price);
  const base = amount && a > 0 ? toBase(a, unit, butter) : null;
  const perUnit = base && price && p >= 0 ? p / base.value : null;
  const merged = catalog.filter(c => c.mergedInto === item.id);
  const usedIn = recipes.filter(r => r.ingredients.some(l => {
    const target = l.catalogIngredientId ? catalog.find(c => c.id === l.catalogIngredientId) : undefined;
    return target?.id === item.id || target?.mergedInto === item.id || (!target && findByName(l.name, catalog)?.id === item.id);
  }));
  const needsTsp = usedIn.some(r => recipeCost(r, catalog).issues.some(i => i.product?.id === item.id && /teaspoon weight/.test(i.message ?? '')));

  async function save(clear = false) {
    const pa = clear || !amount.trim() ? undefined : a, pp = clear || !price.trim() ? undefined : p;
    if ((pa !== undefined && !(pa > 0)) || (pp !== undefined && !(pp >= 0))) { notify('Enter a positive package size and a price of 0 or more.', true); return; }
    if ((pa === undefined) !== (pp === undefined)) { notify('Fill in both package size and price, or leave both blank.', true); return; }
    if (unit === 'stick' && !butter && pa !== undefined) { notify('“stick” is only for butter. Choose another package unit.', true); return; }
    const g = gpt.trim() ? Number(gpt) : undefined, rt = ratio.trim() ? Number(ratio) : undefined;
    if ((g !== undefined && !(g > 0 && g < 50)) || (rt !== undefined && !(rt > 0 && rt < 10))) { notify('Check the teaspoon weight / substitution ratio.', true); return; }
    if (!name.trim()) { notify('Name is required.', true); return; }
    const al = [...new Set(aliases.split(',').map(x => x.trim()).filter(Boolean))];
    await run(async () => {
      await writeCatalog({ ...item, name: name.trim(), packageAmount: pa, packageUnit: pa !== undefined ? unit : undefined, price: pp, store: store.trim() || undefined, brand: brand.trim() || undefined,
        aliases: al.length ? al : undefined, gramsPerTsp: g, substituteRatio: rt });
      await refresh();
      notify(clear ? 'Price cleared.' : 'Saved. Every recipe using this ingredient now uses this price.');
      if (clear) { setAmount(''); setPrice(''); }
    });
  }
  return (
    <div className="page">
      <button className="link" onClick={() => go('ingredients')}><ChevronLeft size={18} /> All ingredients</button>
      <h2>{item.name}</h2>
      {item.mergedInto && <p className="banner warn">Merged into another ingredient. <button className="link" onClick={() => void run(async () => { await unmergeCatalog(item.id); await refresh(); })}>Undo merge</button></p>}
      <p className="muted">Used in: {usedIn.length ? usedIn.map(r => r.title).join(', ') : 'no recipes yet'}</p>
      <div className="form-grid">
        <label className="field">Ingredient name<input value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field">Product / brand (optional)<input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Kirkland" /></label>
        <label className="field">Package quantity<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={/\begg/i.test(item.name) ? '18' : 'e.g. 10'} /></label>
        <label className="field">Package unit<select value={unit} onChange={e => setUnit(e.target.value)}>{PKG_UNITS.filter(u => u !== 'stick' || butter).map(u => <option key={u} value={u}>{u === 'each' ? 'each (count)' : u === 'stick' ? 'sticks (butter)' : u}</option>)}</select></label>
        <label className="field">Purchase price ($)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 15.00" /></label>
        <label className="field">Store (optional)<input value={store} onChange={e => setStore(e.target.value)} placeholder="Costco" /></label>
      </div>
      {perUnit !== null && base && <p className="muted">≈ {base.dim === 'c' ? `${money(perUnit)} each` : base.dim === 'w' ? `${money(perUnit * 100)} per 100 g` : `${money(perUnit * 4.92892159)} per tsp`}{butter && base.dim === 'w' ? ` · ${money(perUnit * 113.4)} per stick` : ''}</p>}

      <details className="card" open={needsTsp || !!item.gramsPerTsp}>
        <summary>Teaspoon weight {needsTsp && <span className="pill warn small">needed</span>}</summary>
        <p className="muted small">Needed when recipes measure this in tsp/tbsp/cups but you buy it by weight (or the other way round). Find it on the nutrition label: e.g. “Serving size ¼ tsp (1.2 g)” means 1.2 ÷ 0.25 = <b>4.8 g per tsp</b>. The app never guesses this.</p>
        <label className="inline">1 tsp weighs <input inputMode="decimal" aria-label="Grams per teaspoon" value={gpt} onChange={e => setGpt(e.target.value)} /> g</label>
      </details>
      {group && (
        <details className="card" open={!!item.substituteRatio}>
          <summary>Substitution ratio ({group.names.join(' ↔ ')})</summary>
          <p className="muted small">{group.note} If this product's label recommends a different amount, enter how much of it replaces 1 unit of {group.names[0].toLowerCase()} (e.g. 0.5 means half as much).</p>
          <label className="inline">Use <input inputMode="decimal" aria-label="Substitution ratio" value={ratio} onChange={e => setRatio(e.target.value)} placeholder="1" /> per 1 of {group.names[0].toLowerCase()}</label>
        </details>
      )}
      <label className="field wide">Other names for this ingredient (comma separated)<input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="AP flour, plain flour" /></label>
      {merged.length > 0 && <p className="muted small">Merged duplicates: {merged.map(m => <span key={m.id}>{m.name} <button className="link small" onClick={() => void run(async () => { await unmergeCatalog(m.id); await refresh(); })}>undo</button> </span>)}</p>}
      <p className="muted small">Butter: grams, tablespoons and sticks all convert to grams (1 stick = 113.4 g). Eggs: price a carton as e.g. 18 “each” at $6.30, which works out to $0.35 per egg.</p>
      <div className="btn-row">
        <button className="primary" onClick={() => void save()}><Save size={16} /> Save</button>
        {item.price !== undefined && <button onClick={() => void save(true)}>Clear price</button>}
      </div>
    </div>
  );
}
