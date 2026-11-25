import { describe, expect, test } from 'vitest';
import { computeBakery } from '../src/bakery';
import { prepareShared, type RecipeShare } from '../src/recipeShare';
import type { Recipe } from '../src/types';

const r: Recipe = { schemaVersion: 1, id: 'ff-blondie', version: 3, title: 'Brown Butter Blondie', category: 'Brownies', status: 'Testing', yieldAmount: 1, yieldUnit: 'pan', updatedAt: '2026-11-25T10:00:00Z',
  ingredients: [{ id: 'flour', name: 'All-purpose flour', amount: 200, unit: 'g', catalogIngredientId: 'ing-flour' }, { id: 'miso', name: 'White miso', amount: 20, unit: 'g', catalogIngredientId: 'phone-only' }, { id: 'sugar', name: 'Dark brown sugar', amount: 150, unit: 'g' }],
  steps: ['Mix.', 'Bake 25 minutes.'], allergens: ['wheat', 'Milk'] };
let n = 0; const ev = (e: any) => ({ eventId: 'e' + ++n, at: new Date(2026, 10, 25, 12, 0, n).toISOString(), device: 'phone', ...e });

describe('recipes from the phone', () => {
  test('a shared recipe waits in the inbox until it is added or skipped (on every device)', () => {
    const a: RecipeShare = { shareId: 's1', recipe: r, sentAt: '2026-11-25T10:00:00Z' }, b: RecipeShare = { shareId: 's2', recipe: { ...r, id: 'ff-other', title: 'Other' }, sentAt: '2026-11-25T11:00:00Z' };
    let s = computeBakery([ev({ type: 'recipe.share', share: a }), ev({ type: 'recipe.share', share: b })] as any);
    expect(s.recipeShares.map(x => x.shareId)).toEqual(['s1', 's2']);
    s = computeBakery([ev({ type: 'recipe.share', share: a }), ev({ type: 'recipe.share', share: b }), ev({ type: 'recipe.shareDone', shareId: 's1', action: 'added' })] as any);
    expect(s.recipeShares.map(x => x.shareId)).toEqual(['s2']);
    expect(computeBakery([ev({ type: 'recipe.share', share: { shareId: 'bad' } })] as any).recipeShares).toEqual([]);
  });
  test('ingredients are matched to this device by id, then by name; unknown ones are added without prices', () => {
    const catalog = [{ id: 'ing-flour', name: 'All-purpose flour' }, { id: 'ing-dbs', name: 'Dark brown sugar' }];
    const { recipe, newCatalog } = prepareShared({ shareId: 's', recipe: r, sentAt: 'x' }, catalog as any);
    expect(recipe.ingredients.map(i => i.catalogIngredientId)).toEqual(['ing-flour', newCatalog[0].id, 'ing-dbs']);
    expect(newCatalog).toEqual([{ id: newCatalog[0].id, name: 'White miso' }]);
    expect(recipe.allergens).toEqual(['Milk', 'Wheat']); // tidied like an import
  });
});
