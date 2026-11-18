import { ChevronLeft, Plus, Save, Search } from 'lucide-react';
import { useState } from 'react';
import { go, useApp } from '../app-context';
import { writeCatalog } from '../db';
import { convert, normalizeIngredientName, stableCatalogId } from '../logic';
import type { CatalogIngredient } from '../types';

const PKG_UNITS = ['g', 'kg', 'lb', 'oz', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'each'];

export function Catalog({ id }: { id?: string }) {
  const { catalog, recipes, run, refresh, notify } = useApp();
  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  const item = id ? catalog.find(c => c.id === id) : undefined;

  if (id && item) return <CatalogEdit key={item.id} item={item} usedIn={recipes.filter(r => r.ingredients.some(i => i.catalogIngredientId === item.id)).map(r => r.title)} />;

  const list = catalog.filter(c => normalizeIngredientName(c.name).includes(normalizeIngredientName(q)));
  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (catalog.some(c => normalizeIngredientName(c.name) === normalizeIngredientName(name))) { notify('That ingredient already exists.', true); return; }
    await run(async () => { const c = { id: stableCatalogId(name), name }; await writeCatalog(c); await refresh(); setNewName(''); go('ingredients/' + c.id); });
  }
  return (
    <div className="page">
      <div className="page-head"><h2>Ingredients &amp; Prices</h2><span className="muted">{catalog.filter(c => c.price !== undefined).length} of {catalog.length} priced</span></div>
      <p className="muted">A simple price list of what you buy. Prices are optional; there is no stock counting. When a price changes, overwrite it and every recipe estimate updates.</p>
      <label className="search"><Search size={18} /><input aria-label="Search ingredients" value={q} onChange={e => setQ(e.target.value)} placeholder="Search ingredients" /></label>
      <div className="recipe-grid">
        {list.map(c => (
          <button key={c.id} className="recipe-card" onClick={() => go('ingredients/' + c.id)}>
            <strong>{c.name}</strong>
            <span>{c.price === undefined ? 'No price' : `$${c.price.toFixed(2)} / ${c.packageAmount} ${c.packageUnit}`}{c.store ? ` · ${c.store}` : ''}</span>
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

function CatalogEdit({ item, usedIn }: { item: CatalogIngredient; usedIn: string[] }) {
  const { run, refresh, notify } = useApp();
  const [amount, setAmount] = useState(item.packageAmount?.toString() ?? '');
  const [unit, setUnit] = useState(item.packageUnit ?? 'lb');
  const [price, setPrice] = useState(item.price?.toString() ?? '');
  const [store, setStore] = useState(item.store ?? '');
  const [brand, setBrand] = useState(item.brand ?? '');
  const a = Number(amount), p = Number(price);
  const perG = amount && price && a > 0 ? convert(a, unit, 'g') : null;

  async function save(clear = false) {
    const pa = clear || !amount.trim() ? undefined : a, pp = clear || !price.trim() ? undefined : p;
    if ((pa !== undefined && !(pa > 0)) || (pp !== undefined && !(pp >= 0))) { notify('Enter a positive package size and a price of 0 or more.', true); return; }
    if ((pa === undefined) !== (pp === undefined)) { notify('Fill in both package size and price, or leave both blank.', true); return; }
    await run(async () => {
      await writeCatalog({ ...item, packageAmount: pa, packageUnit: pa !== undefined ? unit : undefined, price: pp, store: store.trim() || undefined, brand: brand.trim() || undefined });
      await refresh();
      notify(clear ? 'Price cleared.' : 'Saved. Recipe cost estimates now use this price.');
      if (clear) { setAmount(''); setPrice(''); }
    });
  }
  return (
    <div className="page">
      <button className="link" onClick={() => go('ingredients')}><ChevronLeft size={18} /> All ingredients</button>
      <h2>{item.name}</h2>
      <p className="muted">Used in: {usedIn.length ? usedIn.join(', ') : 'no recipes yet'}</p>
      <div className="form-grid">
        <label className="field">Package size<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 10" /></label>
        <label className="field">Unit<select value={unit} onChange={e => setUnit(e.target.value)}>{PKG_UNITS.map(u => <option key={u}>{u}</option>)}</select></label>
        <label className="field">Package price ($)<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 15.00" /></label>
        <label className="field">Store (optional)<input value={store} onChange={e => setStore(e.target.value)} placeholder="Costco" /></label>
        <label className="field">Brand (optional)<input value={brand} onChange={e => setBrand(e.target.value)} /></label>
      </div>
      {perG && p >= 0 && <p className="muted">≈ ${(p / perG).toFixed(4)} per gram · ${((p / perG) * 100).toFixed(2)} per 100 g</p>}
      <p className="muted small">Recipe amounts in grams can only be costed from a weight package, and teaspoons from a volume package; the app never guesses densities. Unmatched units show as “incomplete”.</p>
      <div className="btn-row">
        <button className="primary" onClick={() => void save()}><Save size={16} /> Save current price</button>
        {item.price !== undefined && <button onClick={() => void save(true)}>Clear price</button>}
      </div>
    </div>
  );
}
