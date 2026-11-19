import { DoughNudges } from '../components/DoughNudges';
import { LaunchChecklist } from '../components/LaunchChecklist';
import { BookOpen, ChefHat, Database, HardDriveDownload, Heart, ShoppingBag, TrendingUp, Upload } from 'lucide-react';
import { FullLogo } from '../components/Logo';
import { go, useApp } from '../app-context';
import { backupIsDue } from '../backup';
import { CostingSummary } from '../components/CostingSummary';
import { BakeList } from '../components/BakeList';
import { useLedger } from '../ledgerState';
import { CalendarClock, ClipboardList, Package, Printer, Snowflake, Tag } from 'lucide-react';
import { LoyaltyCard } from '../components/LoyaltyCard';
import { orderLabel } from '../bakery';
import { PhoenixSmolder } from '../components/Logo';

function when(iso?: string) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function Home() {
  const { recipes, prefs, sessions, lastBackupAt, catalog } = useApp();
  const byId = new Map(recipes.map(r => [r.id, r]));
  const recent = prefs.recent.map(r => byId.get(r.id)).filter(Boolean).slice(0, 4);
  const favorites = prefs.favorites.map(id => byId.get(id)).filter(Boolean);
  const due = backupIsDue(lastBackupAt);
  const { freezer, connected, bakery } = useLedger();
  const active = catalog.filter(c => !c.mergedInto);
  const priced = active.filter(c => c.price !== undefined).length;

  const tile = (name: string, i: number) => ({ 'data-tile': name, style: { '--i': i } as React.CSSProperties });

  return (
    <div className="page home">
      <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder><p className="hero-sub">Baking &amp; bakery</p></div>

      {due && (
        <div className="banner warn">
          <HardDriveDownload size={20} />
          <div><strong>{lastBackupAt ? 'Weekly backup reminder' : 'No backup yet'}</strong><p>Your recipes live only in this browser on this device. Last backup: {when(lastBackupAt)}.</p></div>
          <button className="primary" onClick={() => go('backup')}>Back up now</button>
        </div>
      )}

      <div className="quick-row"><button className="quick-btn" onClick={() => go('cards/print')} title="Print a sheet of 10 tuck-in cards"><Printer size={15} /> Print cards</button></div>
      <LaunchChecklist />

      <BakeList />

      {sessions.length > 0 && (
        <section className="card" {...tile('continue', 0)}>
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

      <div className="grid-2 dash-grid">
        <section className="card" {...tile('orders', 1)}>
          <h3><ShoppingBag size={18} /> Orders</h3>
          <p className="stat-line"><strong>{bakery.orders.filter(o => o.status === 'pending').length}</strong> requests · <strong>{bakery.orders.filter(o => o.status === 'confirmed' || o.status === 'preparing').length}</strong> confirmed · <strong>{bakery.orders.filter(o => o.status === 'ready').length}</strong> ready for pickup</p>
          {bakery.newFormOrders.slice(0, 3).map(o => <p key={o.orderId} className="small">New: {o.test ? '🧪 ' : ''}{orderLabel(o)} {o.customer.name}</p>)}
          {bakery.plan.some(r => r.makeMore) && <p className="small warn-text">Make more: {bakery.plan.filter(r => r.makeMore).map(r => `${r.makeMore} ${r.recipeTitle}`).join(', ')}</p>}
          <div className="btn-row"><button onClick={() => go('orders')}>Open orders</button><button onClick={() => go('orders/plan')}>Planning</button><button className="cards-btn" onClick={() => go('cards')}><Printer size={16} /> Order cards</button></div>
        </section>
        <LoyaltyCard style={{ '--i': 2 } as React.CSSProperties} />
        <section className="card" {...tile('freezer', 3)}>
          <h3><Snowflake size={18} /> The Freezer</h3>
          <p className="stat-line"><strong>{freezer.total}</strong> dough balls{freezer.items.filter(i => i.total > 0).length ? ` · ${freezer.items.filter(i => i.total > 0).map(i => `${i.recipeTitle} ${i.total}`).slice(0, 3).join(' · ')}` : ''}</p>
          {bakery.plan.some(r => r.makeMore) && <p className="small warn-text">Make more for orders: {bakery.plan.filter(r => r.makeMore).map(r => `${r.makeMore} ${r.recipeTitle}`).join(', ')}</p>}
          <DoughNudges compact />
          <p className="muted small">{connected ? 'Shared between your PC and phone.' : 'On this device only. Set up the shared bakery sheet to see it on both.'}</p>
          <button onClick={() => go('freezer')}>Open The Freezer</button>
        </section>
        <section className="card" {...tile('recent', 4)}>
          <h3><BookOpen size={18} /> Recently used</h3>
          {recent.length ? <div className="list">{recent.map(r => <button key={r!.id} className="row-btn" onClick={() => go('recipe/' + r!.id)}><strong>{r!.title}</strong><span>{r!.category} · {r!.status}</span></button>)}</div>
            : <p className="muted">Recipes you bake will appear here.</p>}
        </section>
        <section className="card" {...tile('favorites', 5)}>
          <h3><Heart size={18} /> Favorites</h3>
          {favorites.length ? <div className="list">{favorites.map(r => <button key={r!.id} className="row-btn" onClick={() => go('recipe/' + r!.id)}><strong>{r!.title}</strong><span>{r!.category} · {r!.status}</span></button>)}</div>
            : <p className="muted">Tap the heart on a recipe to keep it here.</p>}
        </section>
        <section className="card" {...tile('library', 6)}>
          <h3><BookOpen size={18} /> Library</h3>
          <p className="stat-line">{recipes.length} recipes · {recipes.filter(r => r.status === 'Approved').length} approved · {recipes.filter(r => r.status === 'Testing').length} testing · {recipes.filter(r => r.status === 'Experimental').length} experimental</p>
          <div className="btn-row"><button onClick={() => go('recipes')}><BookOpen size={16} /> Open library</button><button onClick={() => go('import')}><Upload size={16} /> Import recipe</button></div>
        </section>
        <section className="card" {...tile('prices', 7)}>
          <h3><Database size={18} /> Ingredients &amp; prices</h3>
          <p className="stat-line">{priced} of {active.length} ingredients priced</p>
          <p className="muted">Prices are optional. Recipes with missing prices show “incomplete”, never $0.00.</p>
          <button onClick={() => go('ingredients')}>Open price list</button>
        </section>
        <CostingSummary />
        <section className="card" {...tile('data', 9)}>
          <h3><HardDriveDownload size={18} /> Data &amp; sync</h3>
          <p className="stat-line">Last backup: <strong>{when(lastBackupAt)}</strong></p>
          <p className="muted">Saved on this device. Recipes and prices you change on the PC go to your phone by themselves once <b>PC → phone updates</b> is set up; backups keep everything else safe.</p>
          <div className="btn-row"><button onClick={() => go('sync')}>PC → phone updates</button><button onClick={() => go('backup')}>Backup &amp; restore</button></div>
        </section>
        <section className="card planned" {...tile('agenda', 10)}>
          <h3><CalendarClock size={18} /> On the agenda</h3>
          <p className="small"><b>Up next</b></p>
          <ul className="planned-list">
            <li><CalendarClock size={16} /> Order windows that open and close on their own (“Orders close Wednesday 8 PM”), with a countdown on the form and a “Notify me” box when closed</li>
            <li><TrendingUp size={16} /> Expenses and real profit, with a year-end summary for taxes</li>
            <li><Package size={16} /> Supplies tracker: boxes, bags, stickers and order cards used up by each order, with low-stock warnings on the shopping list</li>
          </ul>
          <p className="small"><b>January 2027, with the cottage food license</b></p>
          <ul className="planned-list">
            <li><Tag size={16} /> Box labels: product name, ingredients by weight and allergens, from your recipes (matched to your state’s cottage food rules)</li>
            <li><Printer size={16} /> Print labels on sticker sheets with your regular printer (no label machine needed): pick a sticker sheet that matches your printer type, and the app lays the labels out to fit</li>
            <li><ClipboardList size={16} /> Printable packing slips</li>
          </ul>
          <p className="muted small">Planned, not built yet.</p>
          <button onClick={() => go('backup')}>Backup &amp; settings</button>
        </section>
      </div>
    </div>
  );
}
