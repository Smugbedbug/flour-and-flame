import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { go, useApp } from '../app-context';
import { costPerItem, expectedItems, isPanRecipe, itemNoun, money, recipeCost, substitutionGroup, findByName } from '../costing';
import { getMeta, setMeta, writeCatalog } from '../db';
import { stableCatalogId } from '../logic';
import type { Recipe } from '../types';

/** Session-only swap support (vanilla extract ↔ paste). Creates an unpriced catalog entry for a chosen product if missing. */
export function useSwaps(recipe: Recipe | undefined, subs: Record<string, string> | undefined, setSubs: (s: Record<string, string>) => void) {
  const { catalog, refresh, run } = useApp();
  const swaps: Record<string, string[]> = {};
  for (const l of recipe?.ingredients ?? []) { const g = substitutionGroup(l.name); if (g) swaps[l.id] = g.names; }
  const onSwap = (lineId: string, name: string) => void run(async () => {
    const original = recipe?.ingredients.find(l => l.id === lineId);
    const back = original && name.toLowerCase() === original.name.toLowerCase();
    const next = { ...(subs ?? {}) };
    if (back) delete next[lineId]; else next[lineId] = name;
    if (!back && !findByName(name, catalog)) { await writeCatalog({ id: stableCatalogId(name), name }); await refresh(); }
    setSubs(next);
  });
  // tiles show the effective (swapped) name; offer the other names, including the original
  const tileSwaps: Record<string, string[]> = {};
  for (const [id, names] of Object.entries(swaps)) tileSwaps[id] = names;
  return { swaps: tileSwaps, onSwap };
}

type Props = { recipe: Recipe; factor?: number; substitutions?: Record<string, string>; piecesPerPan?: number; editablePackaging?: boolean; title?: string };

export function CostCard({ recipe, factor = 1, substitutions, piecesPerPan, editablePackaging, title = 'Estimated production cost' }: Props) {
  const { catalog, packaging, refresh, run } = useApp();
  const cost = recipeCost(recipe, catalog, { factor, substitutions });
  const batch1 = factor === 1 ? cost : recipeCost(recipe, catalog, { substitutions });
  const items = expectedItems(recipe, factor, piecesPerPan);
  const per = costPerItem(cost, items);
  const pack = packaging[recipe.id];
  const [packText, setPackText] = useState(pack !== undefined ? String(pack) : '');
  useEffect(() => setPackText(pack !== undefined ? String(pack) : ''), [pack]);
  const noun = itemNoun(recipe, false);

  async function savePackaging() {
    const v = packText.trim() === '' ? undefined : Number(packText);
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) return;
    await run(async () => {
      const all = { ...((await getMeta<Record<string, number>>('packagingCosts')) ?? {}) };
      if (v === undefined) delete all[recipe.id]; else all[recipe.id] = v;
      await setMeta('packagingCosts', all); await refresh();
    });
  }

  return (
    <div className="card cost">
      <h3>{title}</h3>
      {cost.complete ? (
        <dl className="cost-grid">
          <div><dt>Ingredient cost{factor !== 1 ? ` (${factor}×)` : ''}</dt><dd>{money(cost.total!)}</dd></div>
          {factor !== 1 && <div><dt>Per standard batch (1×)</dt><dd>{batch1.total !== null ? money(batch1.total) : '—'}</dd></div>}
          {factor === 1 && <div><dt>Per batch</dt><dd>{money(cost.total!)}</dd></div>}
          <div><dt>Per {noun}{items ? ` (${items} ${itemNoun(recipe)})` : ''}</dt><dd>{per !== null ? money(per) : <span className="muted small">{isPanRecipe(recipe) ? 'set pieces per pan' : 'yield not countable'}</span>}</dd></div>
          {(pack !== undefined || editablePackaging) && <div><dt>Packaging per {noun}</dt><dd>{pack !== undefined ? money(pack) : '—'}</dd></div>}
          {per !== null && pack !== undefined && <div className="strong"><dt>Direct cost per sellable {noun}</dt><dd>{money(per + pack)}</dd></div>}
        </dl>
      ) : (
        <>
          <p className="cost-incomplete"><AlertTriangle size={16} /> Costing incomplete: {cost.issues.length} ingredient{cost.issues.length > 1 ? 's' : ''} need{cost.issues.length > 1 ? '' : 's'} {cost.issues.every(i => i.status === 'no-price') ? 'prices' : 'attention'}.</p>
          <div className="list">
            {cost.issues.map(i => (
              <button key={i.lineId} className="row-btn issue" onClick={() => go(i.product ? 'ingredients/' + i.product.id : 'ingredients')}>
                <strong>{i.name}</strong>
                <span>{i.message}{i.duplicateOf ? `; a priced “${i.duplicateOf.name}” exists, so merge them in the price list` : ''} <ChevronRight size={13} /></span>
              </button>
            ))}
          </div>
        </>
      )}
      {cost.lines.some(l => l.status === 'priced') && (
        <details className="cost-breakdown" open={!cost.complete ? undefined : false}>
          <summary className="small">See cost of each ingredient</summary>
          <table>
            <tbody>
              {[...cost.lines].filter(l => l.status === 'priced').sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)).map(l => {
                const line = recipe.ingredients.find(i => i.id === l.lineId);
                const share = cost.pricedSubtotal > 0 ? (l.cost! / cost.pricedSubtotal) * 100 : 0;
                return (
                  <tr key={l.lineId} className={share >= 35 ? 'big' : ''}>
                    <td><button className="link" onClick={() => go(l.product ? 'ingredients/' + l.product.id : 'ingredients')}>{l.name}</button>
                      <span className="muted small"> {line ? `${Math.round(line.amount * factor * 100) / 100} ${line.unit}` : ''}{l.product?.price !== undefined ? ` · bought ${l.product.packageAmount} ${l.product.packageUnit} for ${money(l.product.price)}` : ''}</span></td>
                    <td className="num">{money(l.cost!)}</td>
                    <td className="num muted small">{Math.round(share)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">Tap an ingredient to check its package size and price. A line that looks too big usually means the package size or unit is off, or the teaspoon/grams-per-item value is too high.</p>
        </details>
      )}
      {cost.lines.some(l => l.status === 'negligible' || l.status === 'optional' || l.status === 'free') && (
        <p className="muted small">Not included: {cost.lines.filter(l => l.status === 'negligible' || l.status === 'optional' || l.status === 'free').map(l => `${l.name} (${l.status === 'optional' ? 'optional' : l.status === 'free' ? 'free' : 'pinch'})`).join(', ')}.</p>
      )}
      {editablePackaging && (
        <form className="inline" onSubmit={e => { e.preventDefault(); void savePackaging(); }}>
          <label>Packaging per {noun} (optional) $<input aria-label="Packaging cost per item" inputMode="decimal" value={packText} onChange={e => setPackText(e.target.value)} onBlur={() => void savePackaging()} placeholder="0.25" /></label>
        </form>
      )}
      <p className="muted small">Uses today’s prices; ingredients{pack !== undefined ? ' and packaging' : ''} only (no labor or overhead).</p>
    </div>
  );
}
