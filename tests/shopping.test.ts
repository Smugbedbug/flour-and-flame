import { describe, expect, test } from 'vitest';
import { batchesForOrders, lineAmountText, shoppingList } from '../src/shopping';
import { artFor } from '../src/components/CookieArt';

const ing = (name: string, amount: number, unit: string, extra: any = {}) => ({ id: name + unit, name, amount, unit, ...extra });
const recipe = (id: string, title: string, category: string, ingredients: any[], extra: any = {}) => ({ id, schemaVersion: 1, version: 1, title, category, status: 'Approved', yieldAmount: 24, yieldUnit: 'cookies', ingredients, steps: [], updatedAt: 'x', ...extra }) as any;
const cocoa = recipe('cocoa', 'Cocoa Cookies', 'Cookies', [ing('all-purpose flour', 250, 'g'), ing('butter', 2, 'sticks'), ing('large egg', 2, 'each'), ing('salt', 1, 'pinch'), ing('water', 2, 'tbsp'), ing('homemade caramel', 120, 'g'), ing('chocolate chips', 1, 'cup')]);
const van = recipe('van', 'Vanilla Cookies', 'Cookies', [ing('all-purpose flour', 2, 'cups'), ing('butter', 113, 'g'), ing('large egg', 1, 'each')]);
const brownies = recipe('b', 'Fudge Brownies', 'Brownies', [ing('all-purpose flour', 100, 'g'), ing('sugar', 300, 'g')], { yieldAmount: 1, yieldUnit: 'pan', piecesPerPan: 16 });
const caramel = recipe('car', 'Homemade Caramel', 'Other', [ing('sugar', 200, 'g'), ing('heavy cream', 120, 'ml')], { yieldAmount: 1, yieldUnit: 'batch', yieldWeightG: 300 });
const catalog = [
  { id: 'flour', name: 'All-purpose flour', packageAmount: 5, packageUnit: 'lb', price: 4.99, gramsPerTsp: 2.6, store: 'Aldi' },
  { id: 'butter', name: 'Butter', packageAmount: 4, packageUnit: 'stick', price: 4.49, store: 'Aldi' },
  { id: 'egg', name: 'Large egg', packageAmount: 12, packageUnit: 'each', price: 3.2 },
  { id: 'sugar', name: 'Sugar', packageAmount: 4, packageUnit: 'lb', price: 3.5 },
  { id: 'car', name: 'Homemade caramel', fromRecipeId: 'car' },
] as any;
const recipes = [cocoa, van, brownies, caramel];

describe('shopping list', () => {
  test('bakes only what the freezer is short; brownies fully for orders; requests optional', () => {
    const b = { plan: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa Cookies', inFreezer: 10, reserved: 30, available: -20, pending: 12, makeMore: 32 }],
      orders: [{ status: 'confirmed', items: [{ productId: 'b4', name: 'Box of 4', recipeId: 'b', recipeTitle: 'Fudge Brownies', pieces: 4, qty: 5, unitPrice: 10, dough: false }] }] } as any;
    const conf = batchesForOrders(b, recipes, [], false);
    expect(conf.batches.map(x => [x.recipeId, x.need, x.factor])).toEqual([['cocoa', 20, 1], ['b', 20, 1.5]]);
    const all = batchesForOrders(b, recipes, [], true);
    expect(all.batches.find(x => x.recipeId === 'cocoa')).toMatchObject({ need: 32, factor: 1.5 });
  });
  test('combines ingredients across recipes; converts cups to grams only with a teaspoon weight; homemade caramel becomes its own batch; water and pinches are not bought', () => {
    const list = shoppingList([{ recipeId: 'cocoa', title: 'Cocoa Cookies', need: 24, factor: 1, expected: 24, reason: '', basis: 'recipe' }, { recipeId: 'van', title: 'Vanilla Cookies', need: 24, factor: 2, expected: 48, reason: '', basis: 'recipe' }], recipes, catalog);
    const by = Object.fromEntries(list.lines.map(l => [l.name, l]));
    // flour: 250 g + 2 × 2 cups (2 cups = 96 tsp × 2.6 g) → all grams
    expect(by['All-purpose flour'].amounts).toHaveLength(1);
    expect(Math.round(by['All-purpose flour'].amounts[0].value)).toBe(250 + Math.round(4 * 48 * 2.6));
    expect(by['All-purpose flour'].buy).toMatchObject({ packages: 1, cost: 4.99 });
    // butter: 2 sticks + 2 × 113 g ≈ 4 sticks → one 4-stick box... just over → 2 boxes
    expect(lineAmountText(by['Butter'])).toMatch(/sticks \(453 g\)/);
    expect(by['Large egg'].amounts[0].value).toBe(4);
    expect(by['salt'].pinchOnly).toBe(true);
    expect(list.lines.some(l => /water/i.test(l.name))).toBe(false);
    // caramel: 120 g of a 300 g batch → 0.4× caramel recipe → its sugar & cream
    expect(list.batches.find(x => x.recipeId === 'car')).toMatchObject({ factor: 0.4 });
    expect(Math.round(by['Sugar'].amounts[0].value)).toBe(80);
    expect(by['heavy cream'].amounts[0]).toMatchObject({ dim: 'v' });
    // chocolate chips have no price → total is not claimed
    expect(list.total).toBeNull(); expect(list.unpriced).toBeGreaterThan(0);
    expect(list.lines.find(l => l.name === 'All-purpose flour')!.store).toBe('Aldi');
  });
  test('illustrations follow the recipe', () => {
    expect(artFor('Fudge Brownies', 'Brownies')).toMatchObject({ shape: 'bar', dough: '#5a3622' });
    expect(artFor('Oatmeal Cranberry', 'Cookies', ['white chocolate chips', 'dried cranberries']).toppings).toEqual(expect.arrayContaining(['white', 'berries', 'oats']));
    expect(artFor('Oatmeal Cranberry', 'Cookies', ['white chocolate chips']).toppings).not.toContain('chips');
    expect(artFor('Rice Krispie Treats').shape).toBe('crispy');
  });
});
