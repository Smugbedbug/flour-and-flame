import { PageFlip } from '../components/Cookbook';
import { Camera, ChefHat, ChevronLeft, Download, Heart, History, Lightbulb, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { back, go, useApp } from '../app-context';
import { IngredientTiles } from '../components/IngredientTiles';
import { getSession, revisionsFor, setRecipeDeleted, toggleFavorite, writeRecipe } from '../db';
import { downloadText } from '../backup';
import { effectiveRecipe, expectedItems, isPanRecipe, itemNoun } from '../costing';
import { CostCard, useSwaps } from '../components/CostCard';
import { PhotoSection } from '../components/PhotoSection';
import { ProductionHistory } from '../components/ProductionHistory';
import type { Revision } from '../types';

export function RecipeView({ id }: { id: string }) {
  const { recipes, deletedRecipes, catalog, prefs, setPrefs, run, refresh, notify, thumbs } = useApp();
  const r = recipes.find(x => x.id === id);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [viewing, setViewing] = useState<Revision | null>(null);
  const [openTip, setOpenTip] = useState<string | null>(null);
  // Viewing-only swaps (e.g. vanilla paste instead of extract). Never saved to the master recipe.
  const [subs, setSubs] = useState<Record<string, string>>({});
  const { swaps, onSwap } = useSwaps(r, subs, setSubs);
  if (!r) {
    const gone = deletedRecipes.find(x => x.id === id);
    return <div className="page"><p>{gone ? `“${gone.title}” is in Recently deleted.` : 'Recipe not found.'}</p><div className="btn-row">
      {gone && <button className="primary" onClick={() => void run(async () => { await setRecipeDeleted(gone.id, false); await refresh(); notify(`“${gone.title}” restored.`); })}>Restore recipe</button>}
      <button onClick={() => go('recipes')}>Library</button></div></div>;
  }

  async function remove() {
    if (!r) return;
    const baking = await getSession(r.id);
    const msg = `Delete “${r.title}”?\n\nIt moves to Recently deleted (bottom of the Recipe Library), where you can restore it or delete it permanently.${baking ? '\n\nAn unfinished baking session for it will be hidden too.' : ''}`;
    if (!window.confirm(msg)) return;
    await run(async () => { await setRecipeDeleted(r.id, true); await refresh(); notify(`“${r.title}” moved to Recently deleted.`); go('recipes'); });
  }
  const fav = prefs.favorites.includes(r.id);
  const shown = viewing?.snapshot ?? r;

  async function restore(rev: Revision) {
    if (!r || !window.confirm(`Restore version ${rev.version} as a NEW version ${r.version + 1}? The current version stays in history.`)) return;
    await run(async () => { await writeRecipe({ ...rev.snapshot, id: r.id }, r.version); await refresh(); setHistory(await revisionsFor(r.id)); setViewing(null); notify(`Version ${rev.version} restored as version ${r.version + 1}.`); });
  }

  return (
    <div className="page recipe-page" key={id}>
      <PageFlip id={id} />
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

      {thumbs[r.id] && <button className="photo-banner" onClick={() => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth' })} aria-label="View photos"><img src={thumbs[r.id]} alt="" /></button>}
      <div className="btn-row main-actions">
        <button className="primary big" onClick={() => go('bake/' + r.id)}><ChefHat size={20} /> Start baking</button>
        <button onClick={() => go('edit/' + r.id)}><Pencil size={16} /> Edit master</button>
        <button onClick={() => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth' })}><Camera size={16} /> Photos</button>
        <button onClick={() => run(async () => setHistory(history ? null : await revisionsFor(r.id)))}><History size={16} /> History</button>
        <button onClick={() => downloadText(`${r.id}-v${r.version}.json`, JSON.stringify(r, null, 2))}><Download size={16} /> Export recipe</button>
        <button className="danger-outline" onClick={() => void remove()}><Trash2 size={16} /> Delete recipe</button>
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
        <span><b>Yield</b> {shown.yieldAmount} {shown.yieldUnit}{isPanRecipe(shown) && shown.piecesPerPan ? ` · ${expectedItems(shown)} ${itemNoun(shown)}` : ''}</span>
        {isPanRecipe(shown) && <span><b>Cut</b> {shown.piecesPerPan ? `${shown.piecesPerPan} pieces per pan` : 'pieces per pan not set'}</span>}
        {shown.portionWeightG && <span><b>Portion</b> {shown.portionWeightG} g</span>}
        {shown.panSize && <span><b>Pan</b> {shown.panSize.shape === 'rect' ? `${shown.panSize.widthIn}×${shown.panSize.lengthIn} in` : `${shown.panSize.diameterIn} in round`}</span>}
        {shown.ovenTemp && <span><b>Oven</b> {shown.ovenTemp}</span>}
        {shown.yieldWeightG && <span><b>Batch weight</b> {shown.yieldWeightG} g</span>}
      </div>

      <h3>Ingredients</h3>
      {Object.keys(subs).length > 0 && !viewing && <p className="banner info small">Showing your swap{Object.keys(subs).length > 1 ? 's' : ''} for this view only; the saved recipe is unchanged. <button className="link" onClick={() => setSubs({})}>Reset</button></p>}
      <IngredientTiles ingredients={viewing ? shown.ingredients : effectiveRecipe(shown, subs, catalog).ingredients} factor={1} swaps={viewing ? undefined : swaps} onSwap={onSwap} />

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

      <CostCard recipe={r} substitutions={subs} editablePackaging />
      <ProductionHistory recipe={r} />
      <PhotoSection recipeId={r.id} title={r.title} />
    </div>
  );
}
