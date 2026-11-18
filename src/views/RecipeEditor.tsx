import { ArrowDown, ArrowUp, ChevronLeft, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { back, go, useApp } from '../app-context';
import { importRecipes } from '../db';
import { normalizeIngredientName, stableCatalogId } from '../logic';
import { CATEGORIES, STATUSES, recipeProblems, type CatalogIngredient, type Ingredient, type Recipe } from '../types';

const UNITS = ['g', 'kg', 'oz', 'lb', 'tsp', 'tbsp', 'cup', 'ml', 'each', 'stick', 'pinch'];
const nonEmpty = <T,>(a: T[]) => (a.length ? a : undefined);
const uid = () => Math.random().toString(36).slice(2, 9);

function blank(): Recipe {
  return { id: 'ff-' + uid(), schemaVersion: 1, version: 1, title: '', category: 'Cookies', status: 'Experimental', yieldAmount: 12, yieldUnit: 'cookies',
    ingredients: [{ id: 'i-' + uid(), name: '', amount: NaN, unit: 'g' }], steps: [''], updatedAt: new Date().toISOString() };
}

export function RecipeEditor({ id }: { id?: string }) {
  const { recipes, catalog, run, refresh, notify } = useApp();
  const original = id ? recipes.find(r => r.id === id) : undefined;
  const [d, setD] = useState<Recipe>(() => original ? structuredClone(original) : blank());
  const [problems, setProblems] = useState<string[]>([]);
  if (id && !original) return <div className="page"><p>Recipe not found.</p></div>;

  const setIng = (idx: number, patch: Partial<Ingredient>) => setD({ ...d, ingredients: d.ingredients.map((x, j) => j === idx ? { ...x, ...patch } : x) });
  const move = <T,>(arr: T[], from: number, to: number) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

  async function save() {
    const cleaned: Recipe = {
      ...d,
      title: d.title.trim(),
      steps: d.steps.map(s => s.trim()).filter(Boolean),
      tags: nonEmpty((d.tags ?? []).map(t => t.trim()).filter(Boolean)),
      tips: nonEmpty((d.tips ?? []).filter(t => t.text.trim())),
      ingredients: d.ingredients.filter(i => i.name.trim()).map(i => ({ ...i, name: i.name.trim(), section: i.section?.trim() || undefined })),
    };
    const p = recipeProblems(cleaned);
    if (!cleaned.title) p.unshift('Give the recipe a title.');
    setProblems(p);
    if (p.length) return;
    // Link each ingredient to the catalog by stable id, creating unpriced entries for new names.
    const byName = new Map(catalog.map(c => [normalizeIngredientName(c.name), c]));
    const created: CatalogIngredient[] = [];
    cleaned.ingredients = cleaned.ingredients.map(i => {
      if (i.catalogIngredientId && catalog.some(c => c.id === i.catalogIngredientId)) return i;
      const n = normalizeIngredientName(i.name);
      let c = byName.get(n);
      if (!c) { c = { id: stableCatalogId(i.name), name: i.name }; created.push(c); byName.set(n, c); }
      return { ...i, catalogIngredientId: c.id };
    });
    if (original && JSON.stringify({ ...cleaned, updatedAt: '' }) === JSON.stringify({ ...original, updatedAt: '' })) { notify('No changes to save.'); return; }
    await run(async () => {
      const [saved] = await importRecipes(created, [{ recipe: cleaned, expectedVersion: original ? original.version : null }]);
      await refresh();
      notify(original ? `Saved as version ${saved.version}. Version ${original.version} is kept in history.` : 'Recipe created.');
      go('recipe/' + saved.id);
    });
  }

  return (
    <div className="page editor">
      <button className="link" onClick={() => back('recipes')}><ChevronLeft size={18} /> Cancel</button>
      <h2>{original ? 'Edit master recipe' : 'New recipe'}</h2>
      {original && <p className="banner info">Only “Save new version” changes the master recipe. Version {original.version} stays in history and can be restored.</p>}

      <div className="form-grid">
        <label className="field wide">Title<input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></label>
        <label className="field">Category<select value={d.category} onChange={e => setD({ ...d, category: e.target.value as Recipe['category'] })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Status<select value={d.status} onChange={e => setD({ ...d, status: e.target.value as Recipe['status'] })}>{STATUSES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Yield amount<input type="number" step="any" min="0" value={Number.isNaN(d.yieldAmount) ? '' : d.yieldAmount} onChange={e => setD({ ...d, yieldAmount: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        <label className="field">Yield unit<input value={d.yieldUnit} onChange={e => setD({ ...d, yieldUnit: e.target.value })} placeholder="cookies, bars, pan…" /></label>
        <label className="field">Portion weight (g, optional)<input type="number" step="any" min="0" value={d.portionWeightG ?? ''} onChange={e => setD({ ...d, portionWeightG: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
        <label className="field">Oven (optional)<input value={d.ovenTemp ?? ''} onChange={e => setD({ ...d, ovenTemp: e.target.value || undefined })} placeholder="e.g. 350°F" /></label>
        <label className="field wide">Description (optional)<input value={d.description ?? ''} onChange={e => setD({ ...d, description: e.target.value || undefined })} /></label>
        <label className="field wide">Tags (comma separated)<input value={(d.tags ?? []).join(', ')} onChange={e => setD({ ...d, tags: e.target.value.split(',') })} placeholder="brown butter, espresso" /></label>
      </div>

      <fieldset className="pan">
        <legend>Reference pan (only if the recipe states one)</legend>
        <select aria-label="Pan shape" value={d.panSize?.shape ?? ''} onChange={e => setD({ ...d, panSize: e.target.value === 'rect' ? { shape: 'rect', widthIn: 9, lengthIn: 9 } : e.target.value === 'round' ? { shape: 'round', diameterIn: 9 } : undefined })}>
          <option value="">Not recorded</option><option value="rect">Rectangle / square</option><option value="round">Round</option>
        </select>
        {d.panSize?.shape === 'rect' && <><input aria-label="Pan width (in)" type="number" step="any" value={d.panSize.widthIn} onChange={e => setD({ ...d, panSize: { ...d.panSize as any, widthIn: Number(e.target.value) } })} /> × <input aria-label="Pan length (in)" type="number" step="any" value={d.panSize.lengthIn} onChange={e => setD({ ...d, panSize: { ...d.panSize as any, lengthIn: Number(e.target.value) } })} /> in</>}
        {d.panSize?.shape === 'round' && <><input aria-label="Pan diameter (in)" type="number" step="any" value={d.panSize.diameterIn} onChange={e => setD({ ...d, panSize: { ...d.panSize as any, diameterIn: Number(e.target.value) } })} /> in diameter</>}
      </fieldset>

      <h3>Ingredients</h3>
      <datalist id="units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
      <div className="edit-ings">
        <div className="edit-ing head" aria-hidden><span>Ingredient</span><span>Amount</span><span>Unit</span><span>Group</span><span /></div>
        {d.ingredients.map((i, idx) => (
          <div className="edit-ing" key={i.id}>
            <input aria-label="Ingredient name" value={i.name} placeholder="Ingredient" onChange={e => setIng(idx, { name: e.target.value, catalogIngredientId: normalizeIngredientName(e.target.value) === normalizeIngredientName(i.name) ? i.catalogIngredientId : null })} />
            <input aria-label="Amount" type="number" step="any" min="0" value={Number.isNaN(i.amount) ? '' : i.amount} onChange={e => setIng(idx, { amount: e.target.value === '' ? NaN : Number(e.target.value) })} />
            <input aria-label="Unit" list="units" value={i.unit} onChange={e => setIng(idx, { unit: e.target.value })} />
            <input aria-label="Group" value={i.section ?? ''} placeholder="Dough…" onChange={e => setIng(idx, { section: e.target.value })} />
            <span className="ing-tools">
              <label className="mini"><input type="checkbox" checked={!!i.optional} onChange={e => setIng(idx, { optional: e.target.checked })} /> opt.</label>
              <button aria-label="Move up" disabled={idx === 0} onClick={() => setD({ ...d, ingredients: move(d.ingredients, idx, idx - 1) })}><ArrowUp size={14} /></button>
              <button aria-label="Move down" disabled={idx === d.ingredients.length - 1} onClick={() => setD({ ...d, ingredients: move(d.ingredients, idx, idx + 1) })}><ArrowDown size={14} /></button>
              <button aria-label="Remove ingredient" onClick={() => setD({ ...d, ingredients: d.ingredients.filter((_, j) => j !== idx) })}><Trash2 size={14} /></button>
            </span>
          </div>
        ))}
      </div>
      <button onClick={() => setD({ ...d, ingredients: [...d.ingredients, { id: 'i-' + uid(), name: '', amount: NaN, unit: 'g', section: d.ingredients.at(-1)?.section }] })}><Plus size={16} /> Add ingredient</button>

      <h3>Method</h3>
      {d.steps.map((s, i) => (
        <div key={i} className="edit-step">
          <span className="step-no">{i + 1}</span>
          <textarea aria-label={`Step ${i + 1}`} value={s} onChange={e => setD({ ...d, steps: d.steps.map((v, j) => i === j ? e.target.value : v) })} />
          <button aria-label={`Remove step ${i + 1}`} onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i), tips: d.tips?.map(t => t.step === undefined || t.step < i ? t : t.step === i ? { ...t, step: undefined } : { ...t, step: t.step - 1 }) })}><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={() => setD({ ...d, steps: [...d.steps, ''] })}><Plus size={16} /> Add step</button>

      <h3>Baking tips <span className="muted small">(hidden until opened while baking)</span></h3>
      {(d.tips ?? []).map((t, idx) => (
        <div key={t.id} className="edit-tip">
          <input aria-label="Tip title" placeholder="Title" value={t.title} onChange={e => setD({ ...d, tips: d.tips!.map((x, j) => j === idx ? { ...x, title: e.target.value } : x) })} />
          <select aria-label="Tip step" value={t.step ?? ''} onChange={e => setD({ ...d, tips: d.tips!.map((x, j) => j === idx ? { ...x, step: e.target.value === '' ? undefined : Number(e.target.value) } : x) })}>
            <option value="">General</option>{d.steps.map((_, i) => <option key={i} value={i}>Step {i + 1}</option>)}
          </select>
          <textarea aria-label="Tip text" value={t.text} onChange={e => setD({ ...d, tips: d.tips!.map((x, j) => j === idx ? { ...x, text: e.target.value } : x) })} />
          <button aria-label="Remove tip" onClick={() => setD({ ...d, tips: d.tips!.filter((_, j) => j !== idx) })}><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={() => setD({ ...d, tips: [...(d.tips ?? []), { id: 't-' + uid(), title: '', text: '' }] })}><Plus size={16} /> Add tip</button>

      <label className="field wide"><h3>Notes</h3><textarea value={d.notes ?? ''} onChange={e => setD({ ...d, notes: e.target.value || undefined })} /></label>
      <label className="field wide"><h3>Storage</h3><textarea value={d.storage ?? ''} onChange={e => setD({ ...d, storage: e.target.value || undefined })} /></label>

      {problems.length > 0 && <div className="banner error" role="alert"><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></div>}
      <div className="sticky-save"><button className="primary big" onClick={() => void save()}><Save size={18} /> {original ? 'Save new version' : 'Create recipe'}</button></div>
    </div>
  );
}
