import { BookOpen, ChefHat, Database, HardDriveDownload, Heart, Package, ShoppingBag, Timer, TrendingUp, Upload, Users } from 'lucide-react';
import { FullLogo } from '../components/Logo';
import { go, useApp } from '../app-context';
import { backupIsDue } from '../backup';
import { recipeCost } from '../logic';

function when(iso?: string) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function Home() {
  const { recipes, prefs, sessions, lastBackupAt, mode, catalog } = useApp();
  const byId = new Map(recipes.map(r => [r.id, r]));
  const recent = prefs.recent.map(r => byId.get(r.id)).filter(Boolean).slice(0, 4);
  const favorites = prefs.favorites.map(id => byId.get(id)).filter(Boolean);
  const due = backupIsDue(lastBackupAt);
  const priced = catalog.filter(c => c.price !== undefined).length;

  return (
    <div className="page home">
      <div className="hero"><FullLogo /><p className="hero-sub">{mode === 'personal' ? 'Your baking workspace' : 'Bakery business'}</p></div>

      {due && (
        <div className="banner warn">
          <HardDriveDownload size={20} />
          <div><strong>{lastBackupAt ? 'Weekly backup reminder' : 'No backup yet'}</strong><p>Your recipes live only in this browser on this device. Last backup: {when(lastBackupAt)}.</p></div>
          <button className="primary" onClick={() => go('backup')}>Back up now</button>
        </div>
      )}

      {sessions.length > 0 && (
        <section className="card">
          <h3><ChefHat size={18} /> Continue baking</h3>
          <div className="list">
            {sessions.map(s => {
              const r = byId.get(s.recipeId);
              if (!r) return null;
              const running = s.timers.filter(t => t.endsAt && !t.finished).length;
              return (
                <button key={s.recipeId} className="row-btn" onClick={() => go('bake/' + r.id)}>
                  <strong>{r.title}</strong>
                  <span>{s.factor}× · {s.checked.length}/{r.ingredients.length} measured · step {Math.min(s.currentStep + 1, r.steps.length)} of {r.steps.length}{running ? ` · ${running} timer${running > 1 ? 's' : ''} running` : ''}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {mode === 'personal' ? (
        <div className="grid-2">
          <section className="card">
            <h3><BookOpen size={18} /> Recently used</h3>
            {recent.length ? <div className="list">{recent.map(r => <button key={r!.id} className="row-btn" onClick={() => go('recipe/' + r!.id)}><strong>{r!.title}</strong><span>{r!.category} · {r!.status}</span></button>)}</div>
              : <p className="muted">Recipes you bake will appear here.</p>}
          </section>
          <section className="card">
            <h3><Heart size={18} /> Favorites</h3>
            {favorites.length ? <div className="list">{favorites.map(r => <button key={r!.id} className="row-btn" onClick={() => go('recipe/' + r!.id)}><strong>{r!.title}</strong><span>{r!.category} · {r!.status}</span></button>)}</div>
              : <p className="muted">Tap the heart on a recipe to keep it here.</p>}
          </section>
          <section className="card">
            <h3><BookOpen size={18} /> Library</h3>
            <p className="stat-line">{recipes.length} recipes · {recipes.filter(r => r.status === 'Approved').length} approved · {recipes.filter(r => r.status === 'Testing').length} testing · {recipes.filter(r => r.status === 'Experimental').length} experimental</p>
            <div className="btn-row"><button onClick={() => go('recipes')}><BookOpen size={16} /> Open library</button><button onClick={() => go('import')}><Upload size={16} /> Import recipe</button></div>
          </section>
          <section className="card">
            <h3><HardDriveDownload size={18} /> Data &amp; sync</h3>
            <p className="stat-line">Last backup: <strong>{when(lastBackupAt)}</strong></p>
            <p className="muted">Saved on this device only. Automatic sync between phone and PC is not built yet; use backup files to move data.</p>
            <button onClick={() => go('backup')}>Backup &amp; restore</button>
          </section>
        </div>
      ) : (
        <div className="grid-2">
          <section className="card">
            <h3><Database size={18} /> Ingredients &amp; prices</h3>
            <p className="stat-line">{priced} of {catalog.length} ingredients priced</p>
            <p className="muted">Prices are optional. Recipes with missing prices show “incomplete”, never $0.00.</p>
            <button onClick={() => go('ingredients')}>Open price list</button>
          </section>
          <section className="card">
            <h3><TrendingUp size={18} /> Recipe cost estimates</h3>
            <div className="list">{recipes.map(r => { const c = recipeCost(r, catalog); return <button key={r.id} className="row-btn" onClick={() => go('recipe/' + r.id)}><strong>{r.title}</strong><span>{c.total === null ? `Incomplete: ${c.priced}/${c.required} priced` : `$${c.total.toFixed(2)} per batch (ingredients only)`}</span></button>; })}</div>
          </section>
          <section className="card planned">
            <h3>Coming in later milestones</h3>
            <ul className="planned-list">
              <li><Package size={16} /> Frozen dough inventory &amp; production batches</li>
              <li><ShoppingBag size={16} /> Products, boxes &amp; mixed boxes</li>
              <li><Users size={16} /> Customers, orders &amp; pickup groups</li>
              <li><Timer size={16} /> Sales days &amp; payments</li>
              <li><TrendingUp size={16} /> Sales reports</li>
            </ul>
            <p className="muted">These are planned, not built yet. Only recipes marked Approved will be sellable.</p>
          </section>
        </div>
      )}
    </div>
  );
}
