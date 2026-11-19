// Turns "how many dough balls are we short" into "how big a batch to make", using real results.
import type { ProductionRecord, Recipe } from './types';

export type YieldBasis = { perBatch: number; source: 'history' | 'recipe'; bakes: number };

/** Dough balls per 1× batch: average of your last 5 recorded batches, else the recipe's stated yield. */
export function yieldPerBatch(recipe: Recipe, records: ProductionRecord[]): YieldBasis | null {
  const mine = records.filter(r => r.recipeId === recipe.id && r.factor > 0 && r.actualQuantity > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  if (mine.length) return { perBatch: mine.reduce((s, r) => s + r.actualQuantity / r.factor, 0) / mine.length, source: 'history', bakes: mine.length };
  if (recipe.yieldAmount > 0 && !/\b(batch|pan|pans|loaf|cake)\b/i.test(recipe.yieldUnit)) return { perBatch: recipe.yieldAmount, source: 'recipe', bakes: 0 };
  return null;
}

/** Smallest practical batch size (in ½ steps) that covers what's needed. */
export function suggestBatch(needed: number, basis: YieldBasis): { factor: number; expected: number; extra: number } {
  const factor = Math.max(0.5, Math.ceil((needed / basis.perBatch) * 2) / 2);
  const expected = Math.floor(factor * basis.perBatch + 1e-9);
  // if rounding down leaves us short (e.g. yield exactly on the edge), step up once
  const f = expected < needed ? factor + 0.5 : factor;
  const e = Math.floor(f * basis.perBatch + 1e-9);
  return { factor: f, expected: e, extra: e - needed };
}

export const factorLabel = (f: number) => (Number.isInteger(f) ? `${f}×` : `${Math.floor(f) || ''}½×`.replace(/^½/, '½'));
