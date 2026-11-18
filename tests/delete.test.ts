import { describe, expect, test } from 'vitest';
import { addPhoto, addProduction, dumpAll, importRecipes, init, photosFor, productionFor, purgeRecipe, readData, revisionsFor, saveSession, setRecipeDeleted, writeRecipe } from '../src/db';
import { createBackup, restoreBackup, validateBackup } from '../src/backup';
import { IDBFactory } from 'fake-indexeddb';

const IMG = 'data:image/jpeg;base64,AAAA';

describe('deleting master recipes', () => {
  test('delete moves to Recently deleted without a new version; restore brings it back unchanged', async () => {
    await init();
    const before = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    await writeRecipe({ ...before, notes: 'v2' }, 1);
    await setRecipeDeleted('test-cookie', true);
    let r = (await readData()).recipes.find(x => x.id === 'test-cookie')!;
    expect(r.deletedAt).toBeTruthy(); expect(r.version).toBe(2);
    expect((await revisionsFor('test-cookie')).length).toBe(2); // nothing lost
    await setRecipeDeleted('test-cookie', false);
    r = (await readData()).recipes.find(x => x.id === 'test-cookie')!;
    expect(r.deletedAt).toBeUndefined(); expect(r.notes).toBe('v2'); expect(r.version).toBe(2);
  });

  test('permanent delete removes the recipe, its versions, photos and session, but keeps production history and other recipes', async () => {
    await init();
    await addPhoto({ id: 'p1', recipeId: 'test-cookie', dataUrl: IMG, thumbUrl: IMG, width: 1, height: 1, primary: true, createdAt: 'x', sync: 'local' }, true);
    await addPhoto({ id: 'p2', recipeId: 'test-bar', dataUrl: IMG, thumbUrl: IMG, width: 1, height: 1, primary: true, createdAt: 'x', sync: 'local' }, true);
    await saveSession({ recipeId: 'test-cookie', recipeVersion: 1, factor: 1, checked: [], stepsDone: [], currentStep: 0, timers: [], startedAt: 'x', updatedAt: 'x' });
    await addProduction({ id: 'h1', recipeId: 'test-cookie', recipeVersion: 1, recipeTitle: 'Test Brown Butter Cookie', category: 'Cookies', date: '2026-11-18', factor: 1, expectedQuantity: 12, actualQuantity: 12, unitLabel: 'dough balls', storage: 'baked', createdAt: 'x' });
    await setRecipeDeleted('test-cookie', true);
    await purgeRecipe('test-cookie');
    const d = await dumpAll();
    expect((d.recipes as any[]).map(r => r.id)).toEqual(['test-bar']);
    expect((d.revisions as any[]).every(v => v.recipeId !== 'test-cookie')).toBe(true);
    expect((d.revisions as any[]).some(v => v.recipeId === 'test-bar')).toBe(true);
    expect(await photosFor('test-cookie')).toEqual([]);
    expect(await photosFor('test-bar')).toHaveLength(1);
    expect(d.sessions).toEqual([]);
    expect((await productionFor('test-cookie'))[0].recipeTitle).toBe('Test Brown Butter Cookie');
  });

  test('deleted recipes survive backup/restore and stay deleted', async () => {
    await init();
    await setRecipeDeleted('test-bar', true);
    const text = JSON.stringify(await createBackup());
    (globalThis as any).indexedDB = new IDBFactory();
    const check = validateBackup(text);
    expect(check.ok).toBe(true);
    if (check.ok) await restoreBackup(check.backup);
    expect((await readData()).recipes.find(r => r.id === 'test-bar')!.deletedAt).toBeTruthy();
  });

  test('importing a file with the id of a deleted recipe as a new version brings it back as active', async () => {
    await init();
    const bar = (await readData()).recipes.find(r => r.id === 'test-bar')!;
    await setRecipeDeleted('test-bar', true);
    const [saved] = await importRecipes([], [{ recipe: { ...bar, deletedAt: undefined, notes: 'reimported' }, expectedVersion: bar.version }]);
    expect(saved.deletedAt).toBeUndefined(); expect(saved.version).toBe(2);
  });
});
