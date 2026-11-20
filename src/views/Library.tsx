import { RecipeArt } from '../components/CookieArt';
import { Download, Heart, Plus, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import { downloadText } from '../backup';
import { useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { purgeRecipe, setRecipeDeleted } from '../db';
import { CATEGORIES, STATUSES } from '../types';
import { BookIntro } from '../components/Cookbook';

export function Library() {
  const { recipes, deletedRecipes, prefs, thumbs, run, refresh, notify } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [favOnly, setFavOnly] = useState(false);

  const list = useMemo(() => recipes.filter(r => {
    const text = [r.title, r.category, r.description ?? '', ...(r.tags ?? []), ...r.ingredients.map(i => i.name)].join(' ').toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!cat || r.category === cat) && (!status || r.status === status) && (!favOnly || prefs.favorites.includes(r.id));
  }), [recipes, q, cat, status, favOnly, prefs.favorites]);

  return (
    <div className="page library-page">
      <BookIntro />
      <div className="page-head">
        <h2>Recipe Library</h2>
        <div className="btn-row">
          <button onClick={() => go('new')}><Plus size={16} /> New recipe</button>
          <button onClick={() => go('import')}><Upload size={16} /> Import</button>
          {recipes.length > 0 && <button onClick={() => {
            const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
            downloadText(`flour-and-flame-recipes-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`, JSON.stringify(recipes.map(({ deletedAt: _d, ...r }) => r), null, 2));
            notify(`Exported ${recipes.length} recipes. Import this file on your other device (Recipes → Import).`);
          }}><Download size={16} /> Export all</button>}
        </div>
      </div>
      <label className="search"><Search size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search recipes, tags or ingredients" aria-label="Search recipes" /></label>
      <div className="filters">
        <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        <button className={'chip' + (favOnly ? ' on' : '')} aria-pressed={favOnly} onClick={() => setFavOnly(!favOnly)}><Heart size={15} /> Favorites</button>
      </div>
      <div className="recipe-grid">
        {list.map(r => (
          <button key={r.id} className="recipe-card has-thumb" onClick={() => go('recipe/' + r.id)}>
            {thumbs[r.id] ? <img className="card-thumb" src={thumbs[r.id]} alt="" loading="lazy" /> : <span className="card-thumb art"><RecipeArt recipe={r} size={64} /></span>}
            <span className={'status-dot s-' + r.status.toLowerCase()} />
            <strong>{r.title}</strong>
            <span>{r.category} · {r.status} · v{r.version}</span>
            {prefs.favorites.includes(r.id) && <Heart className="fav" size={16} fill="currentColor" />}
            {!!r.tags?.length && <span className="tags">{r.tags.map(t => <em key={t}>{t}</em>)}</span>}
          </button>
        ))}
        {!list.length && (recipes.length ? <p className="muted">No recipes match.</p> : <div className="card"><h3>No recipes yet</h3><p className="muted">Import your recipe file (for example your private starter-recipes file) or create a new recipe.</p><button className="primary" onClick={() => go('import')}><Upload size={16} /> Import recipes</button></div>)}
      </div>
      {deletedRecipes.length > 0 && (
        <details className="card deleted-list">
          <summary><Trash2 size={16} /> Recently deleted ({deletedRecipes.length})</summary>
          <p className="muted small">Deleted recipes are hidden everywhere but keep their versions, photos and production history until you delete them permanently.</p>
          {deletedRecipes.map(d => (
            <div key={d.id} className="history-row">
              <span><strong>{d.title}</strong> <span className="muted small">· deleted {new Date(d.deletedAt!).toLocaleDateString()}</span></span>
              <span className="btn-row">
                <button className="small-btn" onClick={() => void run(async () => { await setRecipeDeleted(d.id, false); await refresh(); notify(`“${d.title}” restored.`); })}><RotateCcw size={14} /> Restore</button>
                <button className="small-btn danger-outline" onClick={() => {
                  if (!window.confirm(`Permanently delete “${d.title}”?\n\nThis removes the recipe, all its versions and its photos from this device. Production history records are kept. This can't be undone, except from a backup file.`)) return;
                  void run(async () => { await purgeRecipe(d.id); await refresh(); notify(`“${d.title}” permanently deleted.`); });
                }}><Trash2 size={14} /> Delete permanently</button>
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
