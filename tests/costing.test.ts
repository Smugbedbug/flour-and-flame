import { describe, expect, test } from 'vitest';
import { recipeCost, canonicalName, matchCatalog, possibleDuplicates, effectiveRecipe, expectedItems, costPerItem, isPanRecipe } from '../src/costing';
import type { CatalogIngredient, Recipe } from '../src/types';

const recipe = (ingredients: any[], extra: Partial<Recipe> = {}): Recipe => ({
  id: 'r', schemaVersion: 1, version: 1, title: 'R', category: 'Cookies', status: 'Testing', yieldAmount: 12, yieldUnit: 'cookies',
  updatedAt: 'x', steps: [], ingredients, ...extra,
});

describe('eggs (required test 2)', () => {
  test('18-count carton at $6.30 → $0.35 per egg; 2 eggs = $0.70', () => {
    const cat: CatalogIngredient[] = [{ id: 'egg', name: 'Large eggs', packageAmount: 18, packageUnit: 'each', price: 6.3 }];
    const c = recipeCost(recipe([{ id: 'e', name: 'Large egg', amount: 2, unit: 'each' }]), cat);
    expect(c.complete).toBe(true); expect(c.total!).toBeCloseTo(0.70, 10);
  });
  test('cases priced by the dozen work too (5 dozen for $15 → $0.25/egg)', () => {
    const c = recipeCost(recipe([{ id: 'e', name: 'Eggs', amount: 4, unit: 'each' }]), [{ id: 'egg', name: 'Large egg', packageAmount: 5, packageUnit: 'dozen', price: 15 }]);
    expect(c.total!).toBeCloseTo(1.0, 10);
  });
});

describe('butter (required test 3): one canonical gram quantity', () => {
  const lb: CatalogIngredient[] = [{ id: 'b', name: 'Unsalted butter', packageAmount: 1, packageUnit: 'lb', price: 4.536 }]; // ≈ $0.01 per g
  const sticks: CatalogIngredient[] = [{ id: 'b', name: 'Unsalted butter', packageAmount: 4, packageUnit: 'stick', price: 4.536 }];
  test('113.4 g, 8 tbsp and 1 stick cost the same', () => {
    for (const cat of [lb, sticks]) {
      const g = recipeCost(recipe([{ id: '1', name: 'Unsalted butter', amount: 113.4, unit: 'g' }]), cat).total!;
      const tbsp = recipeCost(recipe([{ id: '1', name: 'Unsalted butter', amount: 8, unit: 'tbsp' }]), cat).total!;
      const stick = recipeCost(recipe([{ id: '1', name: 'Unsalted butter', amount: 1, unit: 'stick' }]), cat).total!;
      expect(tbsp).toBeCloseTo(g, 6); expect(stick).toBeCloseTo(g, 6);
    }
    expect(recipeCost(recipe([{ id: '1', name: 'Unsalted butter', amount: 1, unit: 'stick' }]), sticks).total!).toBeCloseTo(1.134, 6);
  });
  test('the three displayed units are never counted as separate ingredients', () => {
    const c = recipeCost(recipe([{ id: '1', name: 'Unsalted butter', amount: 170, unit: 'g' }]), lb);
    expect(c.lines).toHaveLength(1);
  });
});

describe('teaspoon measures with by-weight prices (root cause of “incomplete”)', () => {
  const r = recipe([{ id: '1', name: 'Baking soda', amount: 0.5, unit: 'tsp' }]);
  test('without a recorded teaspoon weight the line is flagged with a clear reason', () => {
    const c = recipeCost(r, [{ id: 's', name: 'Baking soda', packageAmount: 1, packageUnit: 'lb', price: 2 }]);
    expect(c.complete).toBe(false); expect(c.total).toBeNull();
    expect(c.issues[0].message).toMatch(/teaspoon weight/);
  });
  test('with gramsPerTsp it is priced', () => {
    const c = recipeCost(r, [{ id: 's', name: 'Baking soda', packageAmount: 453.59237, packageUnit: 'g', price: 4.5359237, gramsPerTsp: 6 }]);
    expect(c.total!).toBeCloseTo(0.03, 6); // 3 g at $0.01/g
  });
  test('a pinch never blocks completeness', () => {
    const c = recipeCost(recipe([{ id: '1', name: 'Flaky salt', amount: 1, unit: 'pinch' }]), []);
    expect(c.complete).toBe(true); expect(c.lines[0].status).toBe('negligible');
  });
});

describe('matching & aliases', () => {
  test('canonical names', () => {
    expect(canonicalName('AP flour')).toBe(canonicalName('All-purpose flour'));
    expect(canonicalName('Semi-sweet chocolate chips')).toBe(canonicalName('Semisweet Chocolate Chips'));
    expect(canonicalName('White sugar')).toBe(canonicalName('Granulated sugar'));
    expect(canonicalName('Large eggs')).toBe(canonicalName('Egg'));
    expect(canonicalName('Molasses')).toBe('molasses');
  });
  test('import matching finds the existing (priced) entry instead of creating a duplicate', () => {
    const cat: CatalogIngredient[] = [{ id: 'f', name: 'All-purpose flour', price: 15, packageAmount: 10, packageUnit: 'lb' }, { id: 'v', name: 'Vanilla', aliases: ['Pure vanilla extract'] }];
    expect(matchCatalog('AP flour', cat)).toEqual({ id: 'f', exact: true });
    expect(matchCatalog('pure vanilla extract', cat)).toEqual({ id: 'v', exact: true });
  });
  test('recipes linked to an old duplicate follow the merge to the priced entry', () => {
    const cat: CatalogIngredient[] = [
      { id: 'dup', name: 'AP flour', mergedInto: 'f' },
      { id: 'f', name: 'All-purpose flour', price: 10, packageAmount: 1000, packageUnit: 'g' },
    ];
    const c = recipeCost(recipe([{ id: '1', name: 'AP flour', amount: 100, unit: 'g', catalogIngredientId: 'dup' }]), cat);
    expect(c.total).toBe(1);
  });
  test('unmerged duplicates are detected and the issue points at the priced twin', () => {
    const cat: CatalogIngredient[] = [{ id: 'dup', name: 'AP flour' }, { id: 'f', name: 'All-purpose flour', price: 10, packageAmount: 1000, packageUnit: 'g' }];
    expect(possibleDuplicates(cat)).toHaveLength(1);
    const c = recipeCost(recipe([{ id: '1', name: 'AP flour', amount: 100, unit: 'g', catalogIngredientId: 'dup' }]), cat);
    expect(c.issues[0].duplicateOf?.id).toBe('f');
  });
});

describe('price updates & missing-cost scope (required tests 4 & 5)', () => {
  const cookie = recipe([{ id: '1', name: 'Flour', amount: 500, unit: 'g', catalogIngredientId: 'f' }, { id: '2', name: 'Sugar', amount: 100, unit: 'g', catalogIngredientId: 's' }], { id: 'cookie' });
  const brownie = recipe([{ id: '1', name: 'Flour', amount: 100, unit: 'g', catalogIngredientId: 'f' }], { id: 'brownie' });
  const imported = recipe([{ id: '1', name: 'Flour', amount: 100, unit: 'g', catalogIngredientId: 'f' }, { id: '2', name: 'Cardamom', amount: 1, unit: 'tsp', catalogIngredientId: 'c' }], { id: 'new' });
  test('changing a price changes every recipe that uses it', () => {
    const cat = (p: number): CatalogIngredient[] => [{ id: 'f', name: 'Flour', price: p, packageAmount: 1000, packageUnit: 'g' }, { id: 's', name: 'Sugar', price: 2, packageAmount: 1000, packageUnit: 'g' }];
    expect(recipeCost(cookie, cat(4)).total).toBeCloseTo(2.2); expect(recipeCost(brownie, cat(4)).total).toBeCloseTo(0.4);
    expect(recipeCost(cookie, cat(6)).total).toBeCloseTo(3.2); expect(recipeCost(brownie, cat(6)).total).toBeCloseTo(0.6);
  });
  test('a newly imported recipe with an unpriced ingredient marks only itself incomplete', () => {
    const cat: CatalogIngredient[] = [{ id: 'f', name: 'Flour', price: 4, packageAmount: 1000, packageUnit: 'g' }, { id: 's', name: 'Sugar', price: 2, packageAmount: 1000, packageUnit: 'g' }, { id: 'c', name: 'Cardamom' }];
    expect(recipeCost(cookie, cat).complete).toBe(true);
    expect(recipeCost(brownie, cat).complete).toBe(true);
    const n = recipeCost(imported, cat);
    expect(n.complete).toBe(false); expect(n.total).toBeNull(); expect(n.issues.map(i => i.name)).toEqual(['Cardamom']);
  });
});

describe('vanilla substitution (required test 1)', () => {
  const master = recipe([{ id: 'v', name: 'Vanilla extract', amount: 2, unit: 'tsp', catalogIngredientId: 'ext' }]);
  const cat: CatalogIngredient[] = [
    { id: 'ext', name: 'Vanilla extract', packageAmount: 4, packageUnit: 'fl oz', price: 12 },
    { id: 'paste', name: 'Vanilla bean paste', packageAmount: 4, packageUnit: 'fl oz', price: 24 },
  ];
  test('choosing paste shows 2 tsp paste, costs with the paste price, leaves the master unchanged', () => {
    const before = JSON.stringify(master);
    const eff = effectiveRecipe(master, { v: 'Vanilla bean paste' }, cat);
    expect(eff.ingredients[0]).toMatchObject({ name: 'Vanilla bean paste', amount: 2, unit: 'tsp', catalogIngredientId: 'paste' });
    const ext = recipeCost(master, cat).total!, paste = recipeCost(master, cat, { substitutions: { v: 'Vanilla bean paste' } }).total!;
    expect(paste).toBeCloseTo(ext * 2, 8);
    expect(JSON.stringify(master)).toBe(before);
  });
  test('a product-specific ratio overrides 1:1', () => {
    const c2 = cat.map(c => c.id === 'paste' ? { ...c, substituteRatio: 0.5 } : c);
    expect(effectiveRecipe(master, { v: 'Vanilla bean paste' }, c2).ingredients[0].amount).toBe(1);
  });
});

describe('pan pieces (required tests 6 & 7)', () => {
  const brownie = recipe([{ id: '1', name: 'Flour', amount: 1000, unit: 'g', catalogIngredientId: 'f' }], { category: 'Brownies', yieldAmount: 1, yieldUnit: 'pan', piecesPerPan: 9 });
  const cat: CatalogIngredient[] = [{ id: 'f', name: 'Flour', price: 10.8, packageAmount: 1000, packageUnit: 'g' }];
  test('pan cost is divided by the configurable piece count', () => {
    expect(isPanRecipe(brownie)).toBe(true);
    const cost = recipeCost(brownie, cat);
    expect(costPerItem(cost, expectedItems(brownie))).toBeCloseTo(1.2);       // master 9 pieces
    expect(costPerItem(cost, expectedItems(brownie, 1, 12))).toBeCloseTo(0.9); // this session 12 pieces
    expect(brownie.piecesPerPan).toBe(9); // session override doesn't touch the master
  });
  test('no invented yield: pan without pieces → unknown per-piece cost', () => {
    expect(expectedItems({ ...brownie, piecesPerPan: undefined })).toBeNull();
  });
});

describe('v0.8: water, price-like, grams per item, made-from-recipe', () => {
  const egg: CatalogIngredient = { id: 'egg', name: 'Large egg', packageAmount: 18, packageUnit: 'each', price: 6.3 };
  test('water costs nothing and never blocks costing', () => {
    const c = recipeCost(recipe([{ id: '1', name: 'Hot water', amount: 30, unit: 'g' }, { id: '2', name: 'Egg', amount: 1, unit: 'each' }]), [egg, { id: 'w', name: 'Hot water' }]);
    expect(c.complete).toBe(true); expect(c.total).toBeCloseTo(0.35); expect(c.lines[0].status).toBe('free');
    expect(recipeCost(recipe([{ id: '1', name: 'Water', amount: 50, unit: 'g' }]), []).complete).toBe(true); // even if not in the list
  });
  test('anything can be marked free', () => {
    expect(recipeCost(recipe([{ id: '1', name: 'Ice', amount: 2, unit: 'cup', catalogIngredientId: 'i' }]), [{ id: 'i', name: 'Ice', free: true }]).complete).toBe(true);
  });
  test('egg yolk priced like a whole egg: 2 yolks = 2 eggs', () => {
    const cat = [egg, { id: 'yolk', name: 'Egg yolk', costAs: 'egg' }];
    const c = recipeCost(recipe([{ id: '1', name: 'Egg yolk', amount: 2, unit: 'each', catalogIngredientId: 'yolk' }]), cat);
    expect(c.total).toBeCloseTo(0.70); expect(c.lines[0].product?.name).toBe('Egg yolk');
  });
  test('lemon juice in grams with lemons priced each: uses grams per lemon', () => {
    const lemons: CatalogIngredient = { id: 'l', name: 'Fresh lemon juice', packageAmount: 6, packageUnit: 'each', price: 3 };
    const r = recipe([{ id: '1', name: 'Fresh lemon juice', amount: 90, unit: 'g', catalogIngredientId: 'l' }]);
    expect(recipeCost(r, [lemons]).issues[0].message).toMatch(/grams per item/);
    expect(recipeCost(r, [{ ...lemons, gramsPerEach: 45 }]).total).toBeCloseTo(1.0); // 90 g = 2 lemons = $1
  });
  test('homemade caramel from its own recipe: cost per gram flows into other recipes', () => {
    const sugar: CatalogIngredient = { id: 's', name: 'Sugar', packageAmount: 1000, packageUnit: 'g', price: 2 };
    const cream: CatalogIngredient = { id: 'c', name: 'Heavy cream', packageAmount: 1000, packageUnit: 'ml', price: 6 };
    const caramel = recipe([{ id: '1', name: 'Sugar', amount: 200, unit: 'g', catalogIngredientId: 's' }, { id: '2', name: 'Heavy cream', amount: 100, unit: 'ml', catalogIngredientId: 'c' }], { id: 'caramel', title: 'Thick Salted Caramel Sauce', yieldAmount: 1, yieldUnit: 'batch' });
    const link: CatalogIngredient = { id: 'hc', name: 'Homemade caramel', fromRecipeId: 'caramel' };
    const blondie = recipe([{ id: '1', name: 'Homemade caramel', amount: 50, unit: 'g', catalogIngredientId: 'hc' }], { id: 'blondie' });
    const cat = [sugar, cream, link];
    // no finished weight yet → clear message
    expect(recipeCost(blondie, cat, { recipes: [caramel, blondie] }).issues[0].message).toMatch(/finished batch weight/);
    // batch = $0.40 + $0.60 = $1.00, weighs 250 g → $0.004/g → 50 g = $0.20
    const withWeight = { ...caramel, yieldWeightG: 250 };
    expect(recipeCost(blondie, cat, { recipes: [withWeight, blondie] }).total).toBeCloseTo(0.20);
    // price change in the caramel recipe flows through
    expect(recipeCost(blondie, [{ ...sugar, price: 4 }, cream, link], { recipes: [withWeight, blondie] }).total).toBeCloseTo(0.28);
  });
  test('recipes that use each other in a loop are reported, not looped forever', () => {
    const a = recipe([{ id: '1', name: 'B stuff', amount: 10, unit: 'g', catalogIngredientId: 'b' }], { id: 'A', yieldWeightG: 100 });
    const b = recipe([{ id: '1', name: 'A stuff', amount: 10, unit: 'g', catalogIngredientId: 'a' }], { id: 'B', yieldWeightG: 100 });
    const c = recipeCost(a, [{ id: 'a', name: 'A stuff', fromRecipeId: 'A' }, { id: 'b', name: 'B stuff', fromRecipeId: 'B' }], { recipes: [a, b] });
    expect(c.complete).toBe(false);
  });
});
