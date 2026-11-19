import { ChevronLeft, FileUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { back, go, useApp } from '../app-context';
import { importRecipes } from '../db';
import { stableCatalogId } from '../logic';
import { canonicalName, findByName, matchCatalog } from '../costing';
import { isBlondie } from '../db';
import { sameRecipeContent } from '../recipeCompare';
import { recipeProblems, type CatalogIngredient, type Recipe } from '../types';

type Plan = { recipes: Recipe[]; names: { key: string; display: string }[] };

/** Exact (name/alias, e.g. "AP flour" = "All-purpose flour") → that id; close name → "suggest:id"; otherwise "create". */
export function suggestMatch(name: string, catalog: CatalogIngredient[]): string {
  const m = matchCatalog(name, catalog);
  return !m ? 'create' : m.exact ? m.id : 'suggest:' + m.id;
}

export { sameRecipeContent };

export function ImportView() {
  const { recipes: active, deletedRecipes, catalog, run, refresh, notify } = useApp();
  const recipes = [...active, ...deletedRecipes]; // ids in Recently deleted still count as taken
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [clash, setClash] = useState<Record<string, 'copy' | 'version' | 'skip'>>({});
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
    for (const r of list) for (const i of r.ingredients) { const k = canonicalName(i.name); if (!seen.has(k)) seen.set(k, i.name); }
    const names = [...seen].map(([key, display]) => ({ key, display }));
    const m: Record<string, string> = {};
    for (const n of names) { const s = suggestMatch(n.display, catalog); m[n.key] = s.startsWith('suggest:') ? 'create' : s; } // only exact matches are pre-selected; suggestions need your OK
    // If the recipe already carries a valid catalog id, prefer it.
    for (const r of list) for (const i of r.ingredients) if (i.catalogIngredientId && catalog.some(c => c.id === i.catalogIngredientId)) m[canonicalName(i.name)] = i.catalogIngredientId;
    setMatches(m);
    // Existing ids: identical content → skip (already up to date); otherwise import as a copy unless you choose "new version".
    setClash(Object.fromEntries(list.flatMap(r => { const e = recipes.find(x => x.id === r.id); return e ? [[r.id, sameRecipeContent(e, r) && !e.deletedAt ? 'skip' : 'copy']] : []; })));
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
          const existing = findByName(n.display, catalog);
          const c = existing ?? { id: stableCatalogId(n.display), name: n.display };
          if (!existing && !created.some(x => x.id === c.id)) created.push(c);
          idFor[n.key] = c.id;
        } else {
          if (!catalog.some(c => c.id === choice)) throw Error(`Choose a match for ${n.display}.`);
          idFor[n.key] = choice;
        }
      }
      const items = plan.recipes.filter(src => clash[src.id] !== 'skip').map(src => {
        const existing = recipes.find(r => r.id === src.id);
        const asCopy = existing && clash[src.id] === 'copy';
        const recipe: Recipe = {
          ...structuredClone(src),
          id: asCopy ? `${src.id}-copy-${Date.now().toString(36)}` : src.id,
          title: asCopy ? `${src.title} (imported copy)` : src.title,
          category: isBlondie(src) ? 'Brownies' : src.category,
          ingredients: src.ingredients.map(i => ({ ...i, catalogIngredientId: idFor[canonicalName(i.name)] })),
        };
        return { recipe, expectedVersion: existing && !asCopy ? existing.version : null };
      });
      const saved = await importRecipes(created, items); // one transaction: all or nothing
      await refresh();
      const skipped = plan.recipes.length - items.length;
      notify(`${saved.length} recipe(s) imported${skipped ? `, ${skipped} already up to date` : ''}.`);
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
          {Object.keys(clash).length > 1 && (() => {
            const changed = Object.entries(clash).filter(([id]) => !sameRecipeContent(recipes.find(e => e.id === id)!, plan.recipes.find(r => r.id === id)!)).map(([id]) => id);
            const same = Object.keys(clash).length - changed.length;
            return (
              <div className="card">
                <strong>{Object.keys(clash).length} of these recipes are already on this device</strong>
                <p className="muted small">{same} identical (skipped) · {changed.length} different</p>
                {changed.length > 0 && <div className="btn-row">
                  <button className="small-btn" onClick={() => setClash({ ...clash, ...Object.fromEntries(changed.map(id => [id, 'version'])) })}>Update all {changed.length} as new versions</button>
                  <button className="small-btn" onClick={() => setClash({ ...clash, ...Object.fromEntries(changed.map(id => [id, 'copy'])) })}>Import all {changed.length} as copies</button>
                </div>}
              </div>
            );
          })()}
          {plan.recipes.map(r => (
            <div key={r.id} className="card">
              <h3>{r.title}</h3>
              <p className="muted">{r.category} · {r.status} · {r.ingredients.length} ingredients · {r.steps.length} steps · yield {r.yieldAmount} {r.yieldUnit}</p>
              {isBlondie(r) && r.category !== 'Brownies' && <p className="small">Blondies are grouped with Brownies, so this will be imported as Brownies.</p>}
              {r.status === 'Approved' && <p className="small">Marked Approved in the file. Change it after import if it still needs testing.</p>}
              {clash[r.id] && (
                <div className="clash">
                  <strong>A recipe with this id already exists{deletedRecipes.some(d => d.id === r.id) ? ' (in Recently deleted)' : ''}.</strong>
                  {sameRecipeContent(recipes.find(e => e.id === r.id)!, r) && <label><input type="radio" checked={clash[r.id] === 'skip'} onChange={() => setClash({ ...clash, [r.id]: 'skip' })} /> Skip; it's identical to the recipe already here</label>}
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
                  <span>{n.display}{matches[n.key] !== 'create' && <em className="muted"> → {catalog.find(c => c.id === matches[n.key])?.name}</em>}
                    {sug.startsWith('suggest:') && matches[n.key] === 'create' && <button type="button" className="small-btn" onClick={() => setMatches({ ...matches, [n.key]: sug.slice(8) })}>Use “{catalog.find(c => c.id === sug.slice(8))?.name}”?</button>}</span>
                  <select value={matches[n.key]} onChange={e => setMatches({ ...matches, [n.key]: e.target.value })}>
                    <option value="create">Create new ingredient (no price needed)</option>
                    {catalog.filter(c => !c.mergedInto).map(c => <option value={c.id} key={c.id}>Match: {c.name}{c.price !== undefined ? ' (priced)' : ''}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <div className="btn-row">
            <button className="primary big" disabled={!plan.recipes.some(r => clash[r.id] !== 'skip')} onClick={() => void confirm()}><Upload size={18} /> {plan.recipes.some(r => clash[r.id] !== 'skip') ? `Import ${plan.recipes.filter(r => clash[r.id] !== 'skip').length} recipe(s)` : 'Everything is already up to date'}</button>
            <button onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
