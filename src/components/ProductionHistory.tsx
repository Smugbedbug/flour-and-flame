import { ClipboardList, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { deleteProduction, productionFor, writeRecipe } from '../db';
import { isPanRecipe, itemNoun, money } from '../costing';
import type { ProductionRecord, Recipe } from '../types';

const STORAGE_LABEL: Record<string, string> = { baked: 'baked', 'frozen-dough': 'frozen dough', 'refrigerated-dough': 'refrigerated dough', other: 'other' };

export function formatProduction(p: ProductionRecord): string {
  const parts = [`${p.actualQuantity} ${p.unitLabel}`];
  if (p.factor !== 1) parts.push(`${p.factor}× batch`);
  if (p.piecesPerPan) parts.push(`${p.panCount ?? 1} pan${(p.panCount ?? 1) !== 1 ? 's' : ''} × ${p.piecesPerPan}`);
  if (p.portionWeightG) parts.push(`${p.portionWeightG} g target`);
  parts.push(STORAGE_LABEL[p.storage] ?? p.storage);
  return parts.join(' · ');
}

/** Master change derived from a record, or null if nothing sensible to change. */
export function masterYieldFromRecord(r: Recipe, p: ProductionRecord): Partial<Recipe> | null {
  if (isPanRecipe(r)) {
    if (!p.piecesPerPan && !(p.actualQuantity > 0)) return null;
    const pans = p.panCount ?? r.yieldAmount * p.factor;
    const per = Math.round(p.actualQuantity / (pans || 1));
    return per > 0 && per !== r.piecesPerPan ? { piecesPerPan: per } : null;
  }
  const y = Math.round((p.actualQuantity / p.factor) * 100) / 100;
  return y > 0 && y !== r.yieldAmount ? { yieldAmount: y } : null;
}

export function ProductionHistory({ recipe }: { recipe: Recipe }) {
  const { run, refresh, notify, recipes } = useApp();
  const [rows, setRows] = useState<ProductionRecord[]>([]);
  const load = async () => setRows(await productionFor(recipe.id));
  useEffect(() => { void load(); }, [recipe.id, recipe.version]); // eslint-disable-line react-hooks/exhaustive-deps

  async function useAsDefault(p: ProductionRecord) {
    const change = masterYieldFromRecord(recipe, p);
    if (!change) { notify('The master recipe already uses this yield.'); return; }
    const what = change.piecesPerPan ? `${change.piecesPerPan} pieces per pan` : `${change.yieldAmount} ${recipe.yieldUnit}`;
    if (!window.confirm(`Update the master recipe's default yield to ${what}? This saves version ${recipe.version + 1}; version ${recipe.version} stays in history.`)) return;
    await run(async () => {
      const current = recipes.find(r => r.id === recipe.id)!;
      await writeRecipe({ ...current, ...change }, current.version);
      await refresh(); notify(`Master recipe updated to ${what}.`);
    });
  }

  const avg = rows.length ? rows.reduce((s, p) => s + p.actualQuantity / p.factor, 0) / rows.length : null;
  return (
    <section className="card">
      <h3><ClipboardList size={18} /> Production history</h3>
      {!rows.length && <p className="muted">Finish a baking session to record how many {itemNoun(recipe)} it made.</p>}
      {avg !== null && rows.length > 1 && !isPanRecipe(recipe) && <p className="muted small">Average: {Math.round(avg * 10) / 10} {recipe.yieldUnit} per 1× batch (master expects {recipe.yieldAmount}).</p>}
      <div className="list">
        {rows.map(p => (
          <div key={p.id} className="history-row prod">
            <div>
              <strong>{new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
              <span>{formatProduction(p)}{p.recipeVersion !== recipe.version ? ` · v${p.recipeVersion}` : ''}</span>
              {p.costSnapshot?.complete && p.costSnapshot.perItem !== null && <span className="muted small">Cost then: {money(p.costSnapshot.perItem)} each</span>}
              {p.notes && <em>{p.notes}</em>}
            </div>
            <span className="btn-row">
              <button className="small-btn" onClick={() => void useAsDefault(p)}>Use as default yield</button>
              <button className="small-btn" aria-label="Delete record" onClick={() => { if (window.confirm('Delete this production record?')) void run(async () => { await deleteProduction(p.id); await load(); }); }}><Trash2 size={14} /></button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
