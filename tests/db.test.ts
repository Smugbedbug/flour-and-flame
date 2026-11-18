import { describe, expect, test } from 'vitest';
import { init, readData, writeRecipe, revisionsFor, importRecipes, saveSession, getSession, listSessions, dumpAll } from '../src/db';
import { createBackup, validateBackup, restoreBackup } from '../src/backup';
import { stableCatalogId } from '../src/logic';
import { recipeCost } from '../src/costing';
import type { Recipe } from '../src/types';
import { IDBFactory } from 'fake-indexeddb';

const imported = (id = 'imp-1', title = 'Imported Test Cookie'): Recipe => ({
  id, schemaVersion: 1, version: 1, title, category: 'Cookies', status: 'Experimental', yieldAmount: 12, yieldUnit: 'cookies',
  updatedAt: '2026-11-18T00:00:00.000Z', steps: ['Mix.', 'Bake 10 minutes.'],
  ingredients: [
    { id: 'a', name: 'All-purpose flour', amount: 200, unit: 'g' },
    { id: 'b', name: 'Cardamom', amount: 0.5, unit: 'tsp' },
  ],
});

describe('local database', () => {
  test('fresh install seeds both recipes and an unpriced catalog', async () => {
    await init();
    const d = await readData();
    expect(d.recipes.map(r => r.id).sort()).toEqual(['test-bar', 'test-cookie']);
    expect(d.catalog.length).toBeGreaterThan(5);
    expect(d.catalog.every(c => c.price === undefined)).toBe(true);
  });

  test('data persists across app reloads (re-opening the database)', async () => {
    await init();
    const cookie = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    await writeRecipe({ ...cookie, notes: 'Persist me' }, cookie.version);
    await init(); // second launch must not re-seed or overwrite
    const again = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    expect(again.notes).toBe('Persist me'); expect(again.version).toBe(2);
  });

  test('import with NO prices, matching one existing ingredient and creating one new unpriced ingredient', async () => {
    await init();
    const before = await readData();
    const flour = before.catalog.find(c => c.name === 'All-purpose flour')!;
    const cardamom = { id: stableCatalogId('Cardamom'), name: 'Cardamom' };
    const recipe = imported();
    recipe.ingredients[0].catalogIngredientId = flour.id;
    recipe.ingredients[1].catalogIngredientId = cardamom.id;
    await importRecipes([cardamom], [{ recipe, expectedVersion: null }]);
    const after = await readData();
    expect(after.recipes.find(r => r.id === 'imp-1')!.ingredients[0].catalogIngredientId).toBe(flour.id);
    expect(after.catalog.find(c => c.id === cardamom.id)).toEqual(cardamom); // no price required
    const cost = recipeCost(after.recipes.find(r => r.id === 'imp-1')!, after.catalog);
    expect(cost.total).toBeNull(); // incomplete, not $0.00
  });

  test('multi-recipe import is all-or-nothing', async () => {
    await init();
    const cookie = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    const good = imported('imp-good', 'Good');
    const conflicting = { ...cookie, title: 'Stale copy' };
    await expect(importRecipes([{ id: 'ing-new', name: 'New thing' }], [
      { recipe: good, expectedVersion: null },
      { recipe: conflicting, expectedVersion: 99 }, // wrong version → must fail
    ])).rejects.toThrow();
    const d = await readData();
    expect(d.recipes.some(r => r.id === 'imp-good')).toBe(false);
    expect(d.catalog.some(c => c.id === 'ing-new')).toBe(false);
    expect(d.recipes.find(r => r.id === 'test-cookie')!.title).toBe(cookie.title);
  });

  test('editing creates a revision and an older revision can be restored as a new version', async () => {
    await init();
    const v1 = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    const v2 = await writeRecipe({ ...v1, title: 'Renamed' }, v1.version);
    expect(v2.version).toBe(2);
    const revs = await revisionsFor(v1.id);
    expect(revs.map(r => r.version)).toEqual([2, 1]);
    const restored = await writeRecipe({ ...revs[1].snapshot }, v2.version);
    expect(restored.version).toBe(3); expect(restored.title).toBe(v1.title);
    expect((await revisionsFor(v1.id)).length).toBe(3);
  });

  test('saving over a newer version is refused (edits are never silently overwritten)', async () => {
    await init();
    const v1 = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    await writeRecipe({ ...v1, title: 'Device A' }, 1);
    await expect(writeRecipe({ ...v1, title: 'Device B' }, 1)).rejects.toThrow(/changed since/);
  });

  test('baking session (scaling + checked tiles) never modifies the master recipe', async () => {
    await init();
    const master = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    await saveSession({ recipeId: master.id, recipeVersion: master.version, factor: 2, checked: [master.ingredients[0].id], stepsDone: [0], currentStep: 1, timers: [], startedAt: 'x', updatedAt: 'x' });
    const s = await getSession(master.id);
    expect(s!.factor).toBe(2);
    const after = (await readData()).recipes.find(r => r.id === master.id)!;
    expect(after).toEqual(master);
    expect((await revisionsFor(master.id)).length).toBe(1);
  });
});

describe('backup & restore', () => {
  test('export, then restore into an EMPTY installation', async () => {
    await init();
    const cookie = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    await writeRecipe({ ...cookie, notes: 'Edited before backup' }, 1);
    await saveSession({ recipeId: cookie.id, recipeVersion: 2, factor: 1.5, checked: [], stepsDone: [], currentStep: 0, timers: [], startedAt: 'x', updatedAt: 'x' });
    const before = await dumpAll();
    const text = JSON.stringify(await createBackup());

    (globalThis as any).indexedDB = new IDBFactory(); // brand new device
    const check = validateBackup(text);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    await restoreBackup(check.backup);
    await init(); // app launch after restore must NOT re-seed over restored data
    const after = await dumpAll();
    expect(after.recipes).toEqual(before.recipes);
    expect(after.revisions).toEqual(before.revisions);
    expect(after.catalog).toEqual(before.catalog);
    expect((await listSessions())[0].factor).toBe(1.5);
  });

  test('invalid files are rejected before touching data', async () => {
    await init();
    expect(validateBackup('not json').ok).toBe(false);
    expect(validateBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
    const b = await createBackup();
    (b.data.recipes[0] as any).ingredients = [];
    const bad = validateBackup(JSON.stringify(b));
    expect(bad.ok).toBe(false);
    expect((await readData()).recipes.length).toBe(2);
  });
});

describe('upgrade from v0.2', () => {
  test('a v0.2 database (version 2) keeps its recipes, revisions and prices after upgrading', async () => {
    const { testRecipes: seeds } = await import('./fixtures');
    const mine = { ...seeds[0], version: 4, notes: 'my v0.2 edit' };
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('flour-and-flame-v1', 2);
      req.onupgradeneeded = () => { const db = req.result; for (const s of ['recipes', 'catalog', 'outbox']) db.createObjectStore(s, { keyPath: 'id' }); db.createObjectStore('revisions', { keyPath: ['recipeId', 'version'] }); db.createObjectStore('meta', { keyPath: 'key' }); };
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction(['recipes', 'catalog', 'revisions', 'meta'], 'readwrite');
        tx.objectStore('recipes').put(mine);
        tx.objectStore('revisions').put({ recipeId: mine.id, version: 4, snapshot: mine, recordedAt: 'x' });
        tx.objectStore('catalog').put({ id: 'flour', name: 'All-purpose flour', packageAmount: 10, packageUnit: 'lb', price: 15 });
        tx.objectStore('meta').put({ key: 'seeded', value: true });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await init();
    const d = await readData();
    expect(d.recipes).toHaveLength(1);
    expect(d.recipes[0].notes).toBe('my v0.2 edit');
    expect(d.catalog[0].price).toBe(15);
    expect((await revisionsFor(mine.id))[0].version).toBe(4);
    expect(await listSessions()).toEqual([]);
  });
});
