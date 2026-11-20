import { describe, expect, test } from 'vitest';
import { allergenSummary, cleanAllergens, normalizeAllergen, withCleanAllergens } from '../src/allergens';
import { recipeProblems, type Recipe } from '../src/types';
import { lookFor, staleAllergenEvents } from '../src/components/MenuPicture';
import type { MenuLook } from '../src/freezer';

const base: Recipe = { schemaVersion: 1, id: 'ff-x', version: 1, title: 'Salted Caramel Cupcake', category: 'Cupcakes', status: 'Experimental', yieldAmount: 12, yieldUnit: 'cupcakes', updatedAt: '2026-11-20T00:00:00.000Z', ingredients: [{ id: 'flour', name: 'All-purpose flour', amount: 180, unit: 'g' }], steps: ['Mix.'] };

describe('allergens', () => {
  test('names are normalised and ordered like a label', () => {
    expect(normalizeAllergen('eggs')).toBe('Eggs');
    expect(normalizeAllergen('Soybeans')).toBe('Soy');
    expect(normalizeAllergen('tree nuts')).toBe('Tree nuts');
    expect(normalizeAllergen('gluten')).toBeNull();
    expect(cleanAllergens(['eggs', 'Milk', 'wheat', 'milk'])).toEqual(['Milk', 'Eggs', 'Wheat']);
  });
  test('validation accepts the nine (any case) and explains anything else', () => {
    expect(recipeProblems({ ...base, allergens: ['wheat', 'Milk'], mayContain: ['peanuts'], allergenNote: 'pecans' })).toEqual([]);
    expect(recipeProblems({ ...base, allergens: [] })).toEqual([]);
    expect(recipeProblems({ ...base, allergens: ['Gluten'] })[0]).toMatch(/"Gluten".*use only/);
    expect(recipeProblems({ ...base, allergens: 'Milk' })[0]).toMatch(/must be a list/);
  });
  test('summary line: contains, details and may-contain; not shown until checked', () => {
    expect(allergenSummary(base)).toBe('');
    expect(allergenSummary({ allergens: [] })).toBe('No major allergens');
    const r = withCleanAllergens({ ...base, allergens: ['wheat', 'milk', 'eggs', 'tree nuts'], mayContain: ['Peanuts', 'Milk'], allergenNote: 'pecans' });
    expect(r.mayContain).toEqual(['Peanuts']); // already "contains" milk
    expect(allergenSummary(r)).toBe('Contains: milk, eggs, wheat, tree nuts (pecans) · May contain: peanuts');
  });
  test('menu looks pick up the line, and stale looks are refreshed with picture and description kept', () => {
    const r = { ...base, allergens: ['Wheat', 'Milk'] };
    expect(lookFor(r).contains).toBe('Contains: milk, wheat');
    const looks: Record<string, MenuLook> = { 'ff-x': { recipeId: 'ff-x', recipeTitle: r.title, art: { shape: 'cookie' } as any, photo: 'data:x', blurb: 'Sweet and salty' } };
    const evs = staleAllergenEvents(['ff-x', 'missing'], [r], looks);
    expect(evs).toHaveLength(1);
    expect(evs[0].look).toMatchObject({ photo: 'data:x', blurb: 'Sweet and salty', contains: 'Contains: milk, wheat' });
    looks['ff-x'] = evs[0].look;
    expect(staleAllergenEvents(['ff-x'], [r], looks)).toEqual([]);
  });
});
