import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { go, useApp } from '../app-context';
import { costPerItem, expectedItems, itemNoun, money, recipeCost, type LineCost } from '../costing';

/** Dashboard costing overview, computed live from current recipes + prices (nothing cached). */
export function CostingSummary({ compact = false }: { compact?: boolean }) {
  const { recipes, catalog } = useApp();
  const rows = useMemo(() => recipes.filter(r => r.status !== 'Retired').map(r => ({ r, c: recipeCost(r, catalog) })), [recipes, catalog]);
  const complete = rows.filter(x => x.c.complete), incomplete = rows.filter(x => !x.c.complete);

  // Group missing information by ingredient, listing the recipes it blocks.
  const blockers = useMemo(() => {
    const m = new Map<string, { issue: LineCost; recipes: string[] }>();
    for (const { r, c } of incomplete) for (const i of c.issues) {
      const key = i.product?.id ?? 'name:' + i.name.toLowerCase();
      const e = m.get(key) ?? { issue: i, recipes: [] };
      if (!e.recipes.includes(r.title)) e.recipes.push(r.title);
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.recipes.length - a.recipes.length);
  }, [incomplete]);

  if (compact) return (
    <section className="card" data-tile="costs">
      <h3><TrendingUp size={18} /> Costing</h3>
      <p className="stat-line"><strong>{complete.length}</strong> complete · <strong>{incomplete.length}</strong> incomplete{blockers.length ? ` · ${blockers.length} ingredient${blockers.length > 1 ? 's' : ''} need attention` : ''}</p>
      <p className="muted">Prices are optional; recipes work without them.</p>
      <button onClick={() => go('ingredients')}>Open price list</button>
    </section>
  );

  return (
    <>
      <section className="card" data-tile="costs">
        <h3><TrendingUp size={18} /> Recipe costing</h3>
        <div className="stat-pills">
          <span className="pill ok"><CheckCircle2 size={15} /> {complete.length} complete</span>
          <span className={'pill' + (incomplete.length ? ' warn' : '')}><AlertTriangle size={15} /> {incomplete.length} incomplete</span>
        </div>
        <div className="list">
          {rows.map(({ r, c }) => {
            const items = expectedItems(r);
            const per = costPerItem(c, items);
            return (
              <button key={r.id} className="row-btn" onClick={() => go('recipe/' + r.id)}>
                <strong>{r.title}</strong>
                <span>{c.complete
                  ? `${money(c.total!)} per batch${per !== null ? ` · ${money(per)} per ${itemNoun(r, false)}` : ''}`
                  : `Costing incomplete: ${c.issues.length} ingredient${c.issues.length > 1 ? 's' : ''} need${c.issues.length > 1 ? '' : 's'} ${c.issues.every(i => i.status === 'no-price') ? 'prices' : 'attention'}`}</span>
              </button>
            );
          })}
          {!rows.length && <p className="muted">No recipes yet.</p>}
        </div>
      </section>
      {blockers.length > 0 && (
        <section className="card">
          <h3><AlertTriangle size={18} /> What’s missing</h3>
          <div className="list">
            {blockers.map(({ issue, recipes: rs }) => (
              <button key={issue.product?.id ?? issue.name} className="row-btn" onClick={() => go(issue.product ? 'ingredients/' + issue.product.id : 'ingredients')}>
                <strong>{issue.product?.name ?? issue.name}</strong>
                <span>{issue.message}{issue.duplicateOf ? `; a priced “${issue.duplicateOf.name}” exists (merge them)` : ''} · used in {rs.join(', ')}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
