// Made-up recipes used only by automated tests (not real Flour and Flame formulas).
import type { Ingredient, Recipe } from '../src/types';

let n = 0;
const ing = (name: string, amount: number, unit: string, section?: string, optional = false): Ingredient =>
  ({ id: `t${++n}`, name, amount, unit, section, optional, catalogIngredientId: 'cat-' + name.toLowerCase().replace(/\W+/g, '-') });

export const testRecipes: Recipe[] = [
  {
    id: 'test-cookie', schemaVersion: 1, version: 1, title: 'Test Brown Butter Cookie', category: 'Cookies', status: 'Testing',
    yieldAmount: 12, yieldUnit: 'cookies', updatedAt: '2026-11-18T00:00:00.000Z',
    ingredients: [
      ing('Unsalted butter', 170, 'g', 'Dough'), ing('Granulated sugar', 150, 'g', 'Dough'), ing('Large egg', 1, 'each', 'Dough'),
      ing('All-purpose flour', 200, 'g', 'Dough'), ing('Vanilla extract', 2, 'tsp', 'Dough'),
      ing('Granulated sugar', 2, 'tbsp', 'Coating'), ing('Water', 1, 'tbsp', 'Butter adjustment'),
    ],
    steps: ['Brown the butter and cool.', 'Mix everything.', 'Bake 10–12 minutes.'],
  },
  {
    id: 'test-bar', schemaVersion: 1, version: 1, title: 'Test Chocolate Bar', category: 'Brownies', status: 'Experimental',
    yieldAmount: 1, yieldUnit: 'pan', updatedAt: '2026-11-18T00:00:00.000Z',
    ingredients: [ing('Unsalted butter', 113, 'g'), ing('Cocoa powder', 40, 'g'), ing('Eggs', 2, 'each')],
    steps: ['Melt butter, mix, bake 25 minutes.'],
  },
];
