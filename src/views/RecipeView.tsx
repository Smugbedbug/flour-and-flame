import { ChefHat, ChevronLeft, Download, Heart, History, Lightbulb, Pencil } from 'lucide-react';
import { useState } from 'react';
import { back, go, useApp } from '../app-context';
import { IngredientTiles } from '../components/IngredientTiles';
import { revisionsFor, toggleFavorite, writeRecipe } from '../db';
import { downloadText } from '../backup';
import { recipeCost } from '../logic';
import type { Revision } from '../types';

export function RecipeView({ id }: { id: string }) {
  const { recipes, catalog, prefs, setPrefs, run, refresh, notify } = useApp();
  const r = recipes.find(x => x.id === id);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [viewing, setViewing] = useState<Revision | null>(null);
  const [openTip, setOpenTip] = useState<string | null>(null);
  if (!r) return <div className="page"><p>Recipe not found.</p><button onClick={() => go('recipes')}>Library</button></div>;
  const cost = recipeCost(r, catalog);
  const fav = prefs.favorites.includes(r.id);
  const shown = viewing?.snapshot ?? r;

  async function restore(rev: Revision) {
    if (!r || !window.confirm(`Restore version ${rev.version} as a NEW version ${r.version + 1}? The current version stays in history.`)) return;
    await run(async () => { await writeRecipe({ ...rev.snapshot, id: r.id }, r.version); await refresh(); setHistory(await revisionsFor(r.id)); setViewing(null); notify(`Version ${rev.version} restored as version ${r.version + 1}.`); });
  }

  return (
    <div className="page recipe-page">
      <button className="link" onClick={() => back('recipes')}><ChevronLeft size={18} /> Back</button>
      <div className="recipe-top">
        <div>
          <span className="eyebrow">{r.category} · {r.status} · Version {r.version}</span>
          <h2>{r.title}</h2>
          {r.description && <p>{r.description}</p>}
          {r.source && <p className="muted small">Source: {r.source}</p>}
        </div>
        <button className={'icon-btn' + (fav ? ' on' : '')} aria-pressed={fav} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} onClick={() => run(async () => setPrefs(await toggleFavorite(r.id)))}><Heart size={20} fill={fav ? 'currentColor' : 'none'} /></button>
      </div>

      <div className="btn-row main-actions">
        <button className="primary big" onClick={() => go('bake/' + r.id)}><ChefHat size={20} /> Start baking</button>
        <button onClick={() => go('edit/' + r.id)}><Pencil size={16} /> Edit master</button>
        <button onClick={() => run(async () => setHistory(history ? null : await revisionsFor(r.id)))}><History size={16} /> History</button>
        <button onClick={() => downloadText(`${r.id}-v${r.version}.json`, JSON.stringify(r, null, 2))}><Download size={16} /> Export recipe</button>
      </div>

      {history && (
        <div className="card">
          <h3>Recipe history</h3>
          {history.map(h => (
            <div className="history-row" key={h.version}>
              <span>Version {h.version}{h.version === r.version ? ' (current)' : ''} · {new Date(h.recordedAt).toLocaleString()}</span>
              <span className="btn-row">
                {h.version !== r.version && <button onClick={() => setViewing(viewing?.version === h.version ? null : h)}>{viewing?.version === h.version ? 'Hide' : 'View'}</button>}
                {h.version !== r.version && <button onClick={() => void restore(h)}>Restore as new version</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {viewing && <p className="banner info">Viewing old version {viewing.version} (read-only). The current recipe is version {r.version}.</p>}

      <div className="facts">
        <span><b>Yield</b> {shown.yieldAmount} {shown.yieldUnit}</span>
        {shown.portionWeightG && <span><b>Portion</b> {shown.portionWeightG} g</span>}
        {shown.panSize && <span><b>Pan</b> {shown.panSize.shape === 'rect' ? `${shown.panSize.widthIn}×${shown.panSize.lengthIn} in` : `${shown.panSize.diameterIn} in round`}</span>}
        {shown.ovenTemp && <span><b>Oven</b> {shown.ovenTemp}</span>}
      </div>

      <h3>Ingredients</h3>
      <IngredientTiles ingredients={shown.ingredients} factor={1} />

      <h3>Method</h3>
      <ol className="steps">
        {shown.steps.map((s, i) => {
          const tips = (shown.tips ?? []).filter(t => t.step === i);
          return <li key={i}>{s}{tips.map(t => (
            <span key={t.id} className="tip">
              <button className="tip-btn" aria-expanded={openTip === t.id} onClick={() => setOpenTip(openTip === t.id ? null : t.id)}><Lightbulb size={14} /> {t.title || 'Tip'}</button>
              {openTip === t.id && <span className="tip-text">{t.text}</span>}
            </span>))}</li>;
        })}
      </ol>
      {(shown.tips ?? []).filter(t => t.step === undefined).length > 0 && (
        <details className="card"><summary><Lightbulb size={15} /> Baking tips</summary>{shown.tips!.filter(t => t.step === undefined).map(t => <p key={t.id}><strong>{t.title}</strong> {t.text}</p>)}</details>
      )}
      {shown.notes && <div className="card"><h3>Recipe notes</h3><p className="pre">{shown.notes}</p></div>}
      {shown.storage && <div className="card"><h3>Storage</h3><p className="pre">{shown.storage}</p></div>}

      <div className="card cost">
        <h3>Estimated ingredient cost</h3>
        <p className="cost-value">{cost.total === null ? 'Incomplete' : `$${cost.total.toFixed(2)} per batch`}</p>
        <p className="muted">{cost.total === null ? `${cost.priced} of ${cost.required} required ingredients priced. Add prices on the Ingredients & Prices screen (optional).` : 'Current prices; ingredients only, no packaging or labor.'}</p>
        {cost.missing.length > 0 && <details><summary>Missing prices / unit mismatches ({cost.missing.length})</summary><p>{cost.missing.join(' · ')}</p></details>}
      </div>
    </div>
  );
}
