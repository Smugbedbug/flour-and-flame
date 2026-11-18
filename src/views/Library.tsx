import { Heart, Plus, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { CATEGORIES, STATUSES } from '../types';

export function Library() {
  const { recipes, prefs, thumbs } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [favOnly, setFavOnly] = useState(false);

  const list = useMemo(() => recipes.filter(r => {
    const text = [r.title, r.category, r.description ?? '', ...(r.tags ?? []), ...r.ingredients.map(i => i.name)].join(' ').toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!cat || r.category === cat) && (!status || r.status === status) && (!favOnly || prefs.favorites.includes(r.id));
  }), [recipes, q, cat, status, favOnly, prefs.favorites]);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Recipe Library</h2>
        <div className="btn-row">
          <button onClick={() => go('new')}><Plus size={16} /> New recipe</button>
          <button onClick={() => go('import')}><Upload size={16} /> Import</button>
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
          <button key={r.id} className={'recipe-card' + (thumbs[r.id] ? ' has-thumb' : '')} onClick={() => go('recipe/' + r.id)}>
            {thumbs[r.id] && <img className="card-thumb" src={thumbs[r.id]} alt="" loading="lazy" />}
            <span className={'status-dot s-' + r.status.toLowerCase()} />
            <strong>{r.title}</strong>
            <span>{r.category} · {r.status} · v{r.version}</span>
            {prefs.favorites.includes(r.id) && <Heart className="fav" size={16} fill="currentColor" />}
            {!!r.tags?.length && <span className="tags">{r.tags.map(t => <em key={t}>{t}</em>)}</span>}
          </button>
        ))}
        {!list.length && (recipes.length ? <p className="muted">No recipes match.</p> : <div className="card"><h3>No recipes yet</h3><p className="muted">Import your recipe file (for example your private starter-recipes file) or create a new recipe.</p><button className="primary" onClick={() => go('import')}><Upload size={16} /> Import recipes</button></div>)}
      </div>
    </div>
  );
}
