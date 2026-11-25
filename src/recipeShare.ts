// Phone → PC recipes, through the bakery sheet. The phone sends a copy; the PC shows it in "From your phone"
// and nothing changes there until you tap Add (an existing recipe gets a new version; the old one stays in History).
import { addEvents } from './ledger';
import { importRecipes } from './db';
import { stableCatalogId } from './logic';
import { canonicalName, findByName } from './costing';
import { withCleanAllergens } from './allergens';
import type { CatalogIngredient, Recipe } from './types';

export type RecipeShare = { shareId: string; recipe: Recipe; sentAt: string };
export type RecipeShareEvent = { type: 'recipe.share'; share: RecipeShare };
export type RecipeShareDone = { type: 'recipe.shareDone'; shareId: string; action: 'added' | 'skipped' };

const MAX_CHARS = 40_000; // a sheet cell holds 50,000

export const validShare = (s: any): s is RecipeShare => !!s && typeof s.shareId === 'string' && !!s.recipe && typeof s.recipe.id === 'string' && typeof s.recipe.title === 'string' && Array.isArray(s.recipe.ingredients) && Array.isArray(s.recipe.steps);

/** Phone: send this recipe to the PC. */
export async function sendRecipeToPc(recipe: Recipe): Promise<void> {
  const { deletedAt: _d, ...clean } = recipe as Recipe & { deletedAt?: string };
  const share: RecipeShare = { shareId: crypto.randomUUID(), recipe: clean as Recipe, sentAt: new Date().toISOString() };
  if (JSON.stringify(share).length > MAX_CHARS) throw Error('This recipe is too long to send through the sheet. Use Export recipe instead.');
  await addEvents([{ type: 'recipe.share', share } as any]);
}

/** The recipe as it will be saved on this device: ingredients matched to this device's ingredient list (new ones added, no prices). */
export function prepareShared(share: RecipeShare, catalog: CatalogIngredient[]): { recipe: Recipe; newCatalog: CatalogIngredient[] } {
  const newCatalog: CatalogIngredient[] = [];
  const ingredients = share.recipe.ingredients.map(i => {
    if (i.catalogIngredientId && catalog.some(c => c.id === i.catalogIngredientId)) return i;
    const byName = findByName(i.name, catalog) ?? newCatalog.find(c => canonicalName(c.name) === canonicalName(i.name));
    if (byName) return { ...i, catalogIngredientId: byName.id };
    const c: CatalogIngredient = { id: stableCatalogId(i.name), name: i.name };
    newCatalog.push(c);
    return { ...i, catalogIngredientId: c.id };
  });
  return { recipe: { ...withCleanAllergens(structuredClone(share.recipe)), ingredients }, newCatalog };
}

/** PC: save it (new recipe, or a new version of the one you have) and mark it handled everywhere. */
export async function addShared(share: RecipeShare, recipes: Recipe[], catalog: CatalogIngredient[]): Promise<Recipe> {
  const { recipe, newCatalog } = prepareShared(share, catalog);
  const existing = recipes.find(r => r.id === recipe.id);
  const [saved] = await importRecipes(newCatalog, [{ recipe, expectedVersion: existing ? existing.version : null }]);
  await addEvents([{ type: 'recipe.shareDone', shareId: share.shareId, action: 'added' } as any]);
  return saved;
}
export const skipShared = (share: RecipeShare) => addEvents([{ type: 'recipe.shareDone', shareId: share.shareId, action: 'skipped' } as any]);
