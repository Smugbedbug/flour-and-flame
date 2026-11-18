import { describe, expect, test } from 'vitest';
import { convert, scaleAmount, normalizeIngredientName, eggGuidance, findDurations, panFactor, usesBrownButter } from '../src/logic';
import { recipeCost } from '../src/costing';
import { butterDisplay, formatAmount, ingredientDisplay, isButter, quarter, secondaryAmounts } from '../src/units';
import { testRecipes as seeds } from './fixtures';
import type { Recipe } from '../src/types';

const r = (ingredients: any[]): Recipe => ({ ingredients } as unknown as Recipe);

describe('scaling & conversions (carried over from v0.2)', () => {
  test('temporary scaling does not mutate formula', () => {
    const original = { amount: 205 }; expect(scaleAmount(original.amount, 2)).toBe(410); expect(original.amount).toBe(205);
  });
  test('weight and volume are never converted through invented density', () => {
    expect(convert(1, 'lb', 'g')!).toBeGreaterThan(453);
    expect(Math.abs(convert(1, 'tbsp', 'tsp')! - 3)).toBeLessThan(1e-6);
    expect(convert(1, 'cup', 'g')).toBeNull();
  });
  test('missing costs are not treated as zero', () => {
    const x = recipeCost(r([{ id: '1', name: 'Flour', amount: 300, unit: 'g', catalogIngredientId: 'f' }]), [{ id: 'f', name: 'Flour' }]);
    expect(x.total).toBeNull(); expect(x.priced).toBe(0);
  });
  test('cost estimate converts a priced package with compatible units', () => {
    const x = recipeCost(r([{ id: '1', name: 'Flour', amount: 300, unit: 'g', catalogIngredientId: 'f' }]), [{ id: 'f', name: 'Flour', packageAmount: 10, packageUnit: 'lb', price: 15 }]);
    expect(x.total!).toBeCloseTo(0.99208, 3);
  });
  test('changing a price recalculates the current cost', () => {
    const recipe = r([{ id: '1', name: 'Flour', amount: 1000, unit: 'g', catalogIngredientId: 'f' }]);
    const a = recipeCost(recipe, [{ id: 'f', name: 'Flour', packageAmount: 1000, packageUnit: 'g', price: 15 }]).total;
    const b = recipeCost(recipe, [{ id: 'f', name: 'Flour', packageAmount: 1000, packageUnit: 'g', price: 17 }]).total;
    expect(a).toBe(15); expect(b).toBe(17);
  });
  test('optional items do not block basic costing', () => {
    const x = recipeCost(r([{ id: '1', name: 'Flour', amount: 200, unit: 'g', catalogIngredientId: 'f' }, { id: '2', name: 'Espresso', amount: 1, unit: 'tsp', optional: true }]), [{ id: 'f', name: 'Flour', packageAmount: 1000, packageUnit: 'g', price: 3 }]);
    expect(x.total!).toBeCloseTo(0.6, 9);
  });
  test('normalization matches whitespace and case', () => { expect(normalizeIngredientName('  ALL-purpose   FLOUR  ')).toBe('all-purpose flour'); });
});

describe('butter display (US standard: 113.4 g / stick, 8 tbsp / stick)', () => {
  test('170 g ≈ 12 tbsp ≈ 1½ sticks', () => {
    expect(butterDisplay(170, 'g')).toEqual({ grams: '170 g', tbsp: '12 tbsp', sticks: '1½ sticks' });
  });
  test('at 2× all three scale together: 340 g ≈ 24 tbsp ≈ 3 sticks', () => {
    const butter = seeds[0].ingredients.find(i => i.name === 'Unsalted butter')!;
    const d = ingredientDisplay(butter, 2, null);
    expect(d.primary).toBe('340 g'); expect(d.secondary).toEqual(['24 tbsp', '3 sticks']);
    expect(butter.amount).toBe(170); // master untouched
  });
  test('226 g ≈ 16 tbsp ≈ 2 sticks; 1 stick singular', () => {
    expect(butterDisplay(226, 'g')).toEqual({ grams: '226 g', tbsp: '16 tbsp', sticks: '2 sticks' });
    expect(butterDisplay(1, 'stick')!.sticks).toBe('1 stick');
  });
  test('only real butter gets butter display', () => {
    expect(isButter('Unsalted butter')).toBe(true);
    expect(isButter('Salted Butter')).toBe(true);
    for (const n of ['Peanut butter', 'Cocoa butter', 'Buttermilk', 'Browned butter', 'Butterscotch chips']) expect(isButter(n)).toBe(false);
  });
});

describe('measurement formatting', () => {
  test('quarter-teaspoon increments with fraction glyphs', () => {
    expect(quarter(0.25)).toBe('¼'); expect(quarter(1.5)).toBe('1½'); expect(quarter(0.75)).toBe('¾'); expect(quarter(2)).toBe('2');
    expect(formatAmount(0.375, 'tsp')).toBe('≈ ½ tsp');
    expect(formatAmount(0.05, 'tsp')).toBe('< ¼ tsp');
  });
  test('grams for major ingredients', () => { expect(formatAmount(205, 'g')).toBe('205 g'); expect(formatAmount(2.46, 'g')).toBe('2.5 g'); });
  test('secondary amounts stay in the same dimension', () => {
    expect(secondaryAmounts(6, 'tsp')).toEqual(['2 tbsp']);
    expect(secondaryAmounts(1, 'lb')).toEqual(['454 g']);
    expect(secondaryAmounts(200, 'g')).toEqual([]);
  });
});

describe('eggs', () => {
  test('fractional egg suggests weighing beaten whole egg, not separating', () => {
    const g = eggGuidance({ id: 'e', name: 'Large egg', amount: 1, unit: 'each' }, 0.5)!;
    expect(g).toMatch(/25 g/); expect(g).toMatch(/whole eggs/); expect(g).not.toMatch(/white/i);
    expect(eggGuidance({ id: 'e', name: 'Large egg', amount: 1, unit: 'each' }, 2)).toBeNull();
  });
});

describe('timers, pans, brown butter detection', () => {
  test('finds durations in method text', () => {
    expect(findDurations('Bake at 350°F for 10–12 minutes, spaced 2–3 inches apart.')).toEqual([{ label: '10–12 minutes', minutes: 10, maxMinutes: 12 }]);
    expect(findDurations('Refrigerate portions for 60 minutes.')[0].minutes).toBe(60);
    expect(findDurations('Chill 2 hours')[0].minutes).toBe(120);
  });
  test('9×9 to 6×6 pan is ≈44.4% of the area', () => {
    expect(panFactor({ shape: 'rect', widthIn: 9, lengthIn: 9 }, { shape: 'rect', widthIn: 6, lengthIn: 6 })).toBeCloseTo(0.4444, 3);
  });
  test('brown butter only when the recipe itself says so', () => {
    expect(usesBrownButter(seeds[0])).toBe(true);
    expect(usesBrownButter(seeds[1])).toBe(false);
  });
});

import sample from '../examples/sample-recipe.json';
import { recipeProblems } from '../src/types';
test('documented example recipe file is valid', () => { expect(recipeProblems(sample)).toEqual([]); });
