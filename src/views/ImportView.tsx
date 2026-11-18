import { ChevronLeft, FileUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { back, go, useApp } from '../app-context';
import { importRecipes } from '../db';
import { normalizeIngredientName, stableCatalogId } from '../logic';
import { recipeProblems, type CatalogIngredient, type Recipe } from '../types';

type Plan = { recipes: Recipe[]; names: { key: string; display: string }[] };

/** Suggest a catalog match: exact normalized name first, then a name that contains / is contained in the other. */
export function suggestMatch(name: string, catalog: CatalogIngredient[]): string {
  const n = normalizeIngredientName(name);
  const exact = catalog.find(c => normalizeIngredientName(c.name) === n);
  if (exact) return exact.id;
  const partial = catalog.find(c => { const m = normalizeIngredientName(c.name); return m.length > 3 && (n.includes(m) || m.includes(n)); });
  return partial ? 'suggest:' + partial.id : 'create';
}

export function ImportView() {
  const { recipes, catalog, run, refresh, notify } = useApp();
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [clash, setClash] = useState<Record<string, 'copy' | 'version'>>({});
  const file = useRef<HTMLInputElement>(null);

  function parse(src: string) {
    setProblems([]); setPlan(null);
    let data: unknown;
    try { data = JSON.parse(src); } catch { setProblems(['That is not valid JSON. Paste the full recipe export, starting with { or [.']); return; }
    const arr = (Array.isArray(data) ? data : [data]) as unknown[];
    const found: string[] = [];
    arr.forEach((r, i) => recipeProblems(r).forEach(p => found.push(`${arr.length > 1 ? `Recipe ${i + 1}: ` : ''}${p}`)));
    if (!arr.length) found.push('No recipes found.');
    if (found.length) { setProblems(found.slice(0, 15)); return; }
    const list = arr as Recipe[];
    const seen = new Map<string, string>();
    for (const r of list) for (const i of r.ingredients) { const k = normalizeIngredientName(i.name); if (!seen.has(k)) seen.set(k, i.name); }
    const names = [...seen].map(([key, display]) => ({ key, display }));
    const m: Record<string, string> = {};
    for (const n of names) { const s = suggestMatch(n.display, catalog); m[n.key] = s.startsWith('suggest:') ? s.slice(8) : s; }
    // If the recipe already carries a valid catalog id, prefer it.
    for (const r of list) for (const i of r.ingredients) if (i.catalogIngredientId && catalog.some(c => c.id === i.catalogIngredientId)) m[normalizeIngredientName(i.name)] = i.catalogIngredientId;
    setMatches(m);
    setClash(Object.fromEntries(list.filter(r => recipes.some(e => e.id === r.id)).map(r => [r.id, 'copy'])));
    setPlan({ recipes: list, names });
  }

  async function confirm() {
    if (!plan) return;
    await run(async () => {
      const created: CatalogIngredient[] = [];
      const idFor: Record<string, string> = {};
      for (const n of plan.names) {
        const choice = matches[n.key];
        if (choice === 'create') {
          const existing = catalog.find(c => normalizeIngredientName(c.name) === n.key);
          const c = existing ?? { id: stableCatalogId(n.display), name: n.display };
          if (!existing && !created.some(x => x.id === c.id)) created.push(c);
          idFor[n.key] = c.id;
        } else {
          if (!catalog.some(c => c.id === choice)) throw Error(`Choose a match for ${n.display}.`);
          idFor[n.key] = choice;
        }
      }
      const items = plan.recipes.map(src => {
        const existing = recipes.find(r => r.id === src.id);
        const asCopy = existing && clash[src.id] === 'copy';
        const recipe: Recipe = {
          ...structuredClone(src),
          id: asCopy ? `${src.id}-copy-${Date.now().toString(36)}` : src.id,
          title: asCopy ? `${src.title} (imported copy)` : src.title,
          ingredients: src.ingredients.map(i => ({ ...i, catalogIngredientId: idFor[normalizeIngredientName(i.name)] })),
        };
        return { recipe, expectedVersion: existing && !asCopy ? existing.version : null };
      });
      const saved = await importRecipes(created, items); // one transaction: all or nothing
      await refresh();
      notify(`${saved.length} recipe(s) imported. No prices were needed.`);
      go(saved.length === 1 ? 'recipe/' + saved[0].id : 'recipes');
    });
  }

  return (
    <div className="page">
      <button className="link" onClick={() => back('recipes')}><ChevronLeft size={18} /> Back</button>
      <h2>Import recipes</h2>
      {!plan ? (
        <>
          <p className="muted">Import a structured recipe file (schema version 1), for example one exported by your recipe GPT. See <code>docs/RECIPE-IMPORT-SCHEMA.md</code> in the project folder. Nothing is saved until you review and confirm.</p>
          <div className="btn-row"><button className="primary" onClick={() => file.current?.click()}><FileUp size={16} /> Choose JSON file</button></div>
          <input hidden ref={file} type="file" accept=".json,application/json,text/plain" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) parse(await f.text()); }} />
          <label className="field wide">…or paste recipe JSON<textarea className="code" rows={10} value={text} onChange={e => setText(e.target.value)} placeholder='{"schemaVersion": 1, "id": "...", "title": "...", ...}' /></label>
          <button onClick={() => parse(text)} disabled={!text.trim()}>Check pasted recipe</button>
          {problems.length > 0 && <div className="banner error" role="alert"><strong>Not imported:</strong><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></div>}
        </>
      ) : (
        <>
          <p className="banner info">Preview: nothing has been saved yet. Prices are never required.</p>
          {plan.recipes.map(r => (
            <div key={r.id} className="card">
              <h3>{r.title}</h3>
              <p className="muted">{r.category} · {r.status} · {r.ingredients.length} ingredients · {r.steps.length} steps · yield {r.yieldAmount} {r.yieldUnit}</p>
              {r.status === 'Approved' && <p className="small">Marked Approved in the file. Change it after import if it still needs testing.</p>}
              {clash[r.id] && (
                <div className="clash">
                  <strong>A recipe with this id already exists.</strong>
                  <label><input type="radio" checked={clash[r.id] === 'copy'} onChange={() => setClash({ ...clash, [r.id]: 'copy' })} /> Import as a separate copy (existing recipe untouched)</label>
                  <label><input type="radio" checked={clash[r.id] === 'version'} onChange={() => setClash({ ...clash, [r.id]: 'version' })} /> Save as a new version of the existing recipe (old version kept in history)</label>
                </div>
              )}
            </div>
          ))}
          <h3>Ingredient matching</h3>
          <div className="match-list">
            {plan.names.map(n => {
              const sug = suggestMatch(n.display, catalog);
              return (
                <label key={n.key}>
                  <span>{n.display}{sug.startsWith('suggest:') && <em className="muted"> (suggested match)</em>}</span>
                  <select value={matches[n.key]} onChange={e => setMatches({ ...matches, [n.key]: e.target.value })}>
                    <option value="create">Create new ingredient (no price needed)</option>
                    {catalog.map(c => <option value={c.id} key={c.id}>Match: {c.name}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <div className="btn-row">
            <button className="primary big" onClick={() => void confirm()}><Upload size={18} /> Import {plan.recipes.length} recipe(s)</button>
            <button onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
