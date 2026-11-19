import type { Recipe } from './types';

/** True when two recipes have the same content (ignoring version numbers, dates, deleted state and device-specific catalog links). */
export function sameRecipeContent(a: Recipe, b: Recipe): boolean {
  const strip = (r: Recipe) => JSON.stringify({ ...r, version: 0, updatedAt: '', deletedAt: undefined, ingredients: r.ingredients.map(i => ({ ...i, catalogIngredientId: undefined })) });
  return strip(a) === strip(b);
}
