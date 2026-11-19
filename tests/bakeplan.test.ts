import { describe, expect, test } from 'vitest';
import { suggestBatch, yieldPerBatch, factorLabel } from '../src/bakePlan';
import type { ProductionRecord, Recipe } from '../src/types';

const recipe = { id: 'r', yieldAmount: 12, yieldUnit: 'cookies' } as Recipe;
const rec = (date: string, actual: number, factor = 1): ProductionRecord => ({ id: date, recipeId: 'r', recipeVersion: 1, recipeTitle: 'R', category: 'Cookies', date, factor, expectedQuantity: 12, actualQuantity: actual, unitLabel: 'dough balls', storage: 'frozen-dough', createdAt: date });

describe('how much to make', () => {
  test('uses the recipe yield until there is history', () => {
    expect(yieldPerBatch(recipe, [])).toEqual({ perBatch: 12, source: 'recipe', bakes: 0 });
  });
  test('uses the average of your recent batches (normalised to 1×)', () => {
    const b = yieldPerBatch(recipe, [rec('2026-11-01', 11), rec('2026-11-05', 24, 2), rec('2026-11-09', 11)])!;
    expect(b.source).toBe('history'); expect(b.bakes).toBe(3); expect(b.perBatch).toBeCloseTo(34 / 3);
  });
  test('only the last 5 batches count', () => {
    const many = [1, 2, 3, 4, 5, 6].map(i => rec(`2026-11-0${i}`, i === 1 ? 2 : 12));
    expect(yieldPerBatch(recipe, many)!.perBatch).toBe(12);
  });
  test('suggests the smallest ½-step batch that covers the need', () => {
    expect(suggestBatch(14, { perBatch: 11.5, source: 'history', bakes: 3 })).toEqual({ factor: 1.5, expected: 17, extra: 3 });
    expect(suggestBatch(12, { perBatch: 12, source: 'recipe', bakes: 0 })).toEqual({ factor: 1, expected: 12, extra: 0 });
    expect(suggestBatch(3, { perBatch: 12, source: 'recipe', bakes: 0 })).toEqual({ factor: 0.5, expected: 6, extra: 3 });
    expect(suggestBatch(23, { perBatch: 11.5, source: 'history', bakes: 2 })).toEqual({ factor: 2, expected: 23, extra: 0 });
    expect(factorLabel(1.5)).toBe('1½×'); expect(factorLabel(0.5)).toBe('½×'); expect(factorLabel(2)).toBe('2×');
  });
  test('pan recipes without a countable yield return nothing rather than guessing', () => {
    expect(yieldPerBatch({ id: 'b', yieldAmount: 1, yieldUnit: 'pan' } as Recipe, [])).toBeNull();
  });
});
