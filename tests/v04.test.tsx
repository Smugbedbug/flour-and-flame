import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { AmountInput, convertForEdit, quantityProblem } from '../src/components/AmountInput';
import { masterYieldFromRecord } from '../src/components/ProductionHistory';
import { PhoenixSmolder, setLogoAnimationSetting } from '../src/components/Logo';
import { addPhoto, addProduction, deletePhoto, dumpAll, init, photosFor, primaryThumbs, productionFor, readData, revisionsFor, writeRecipe } from '../src/db';
import { createBackup, restoreBackup, validateBackup } from '../src/backup';
import { ingredientDisplay } from '../src/units';
import type { ProductionRecord, Recipe, RecipePhoto } from '../src/types';
import { testRecipes } from './fixtures';

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const photo = (recipeId: string, id: string): RecipePhoto => ({ id, recipeId, dataUrl: IMG, thumbUrl: IMG, width: 1, height: 1, primary: false, createdAt: new Date().toISOString(), sync: 'local' });

/** Create an older-version database directly, as an existing install would have it. */
function makeOldDb(version: number, stores: Record<string, unknown[]>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('flour-and-flame-v1', version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['recipes', 'catalog', 'outbox']) db.createObjectStore(s, { keyPath: 'id' });
      db.createObjectStore('revisions', { keyPath: ['recipeId', 'version'] });
      db.createObjectStore('meta', { keyPath: 'key' });
      if (version >= 3) db.createObjectStore('sessions', { keyPath: 'recipeId' });
    };
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(Object.keys(stores), 'readwrite');
      for (const [s, rows] of Object.entries(stores)) for (const r of rows) tx.objectStore(s).put(r);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('8. measurement dropdowns, conversions and validation', () => {
  test('changing units converts only within the same kind of measure', () => {
    expect(convertForEdit(113, 'g', 'oz', false)).toBeCloseTo(3.99, 2);
    expect(convertForEdit(3, 'tsp', 'tbsp', false)).toBe(1);
    expect(convertForEdit(1, 'tbsp', 'tsp', false)).toBe(3);
    expect(convertForEdit(1, 'cup', 'g', false)).toBeNull(); // never guesses density
    expect(convertForEdit(8, 'tbsp', 'g', true)).toBe(113);  // butter: US standard
    expect(convertForEdit(1, 'each', 'g', false)).toBeNull();
    expect(convertForEdit(170.10000000000002, 'g', 'g', true)).toBe(170); // tidy numbers
  });
  test('quantities and units are validated before saving', () => {
    expect(quantityProblem(0.5, 'tsp', 'Baking soda')).toBeNull();
    expect(quantityProblem(NaN, 'g', 'Flour')).toMatch(/enter an amount/);
    expect(quantityProblem(0, 'g', 'Flour')).toMatch(/more than 0/);
    expect(quantityProblem(1, 'handful', 'Nuts')).toMatch(/choose a unit/);
  });
  test('spoon amounts use a ¼-step picker with a custom option', () => {
    const onChange = vi.fn();
    render(<AmountInput amount={0.5} unit="tsp" onChange={onChange} />);
    const sel = screen.getByLabelText('Amount') as HTMLSelectElement;
    expect(sel.value).toBe('0.5');
    expect([...sel.options].map(o => o.text).slice(0, 4)).toEqual(['¼', '½', '¾', '1']);
    fireEvent.change(sel, { target: { value: '0.75' } });
    expect(onChange).toHaveBeenCalledWith(0.75);
    fireEvent.change(sel, { target: { value: 'custom' } });
    expect((screen.getByLabelText('Amount') as HTMLInputElement).type).toBe('number');
  });
  test('eggs display as counts: "2 large eggs", no weight', () => {
    expect(ingredientDisplay({ id: 'e', name: 'Large egg', amount: 2, unit: 'each' }, 1, null)).toEqual({ primary: '2 large eggs', secondary: [], note: undefined });
    expect(ingredientDisplay({ id: 'e', name: 'Large egg', amount: 1, unit: 'each' }, 1, null).primary).toBe('1 large egg');
  });
});

describe('9. photos persist locally and come back from a backup', () => {
  test('add, primary, thumbnails, delete; restore into an empty install', async () => {
    await init();
    await addPhoto(photo('test-cookie', 'p1'), false);
    await addPhoto(photo('test-cookie', 'p2'), true);
    let ps = await photosFor('test-cookie');
    expect(ps.map(p => [p.id, p.primary])).toEqual([['p2', true], ['p1', false]]);
    expect(Object.keys(await primaryThumbs())).toEqual(['test-cookie']);
    const text = JSON.stringify(await createBackup());
    (globalThis as any).indexedDB = new IDBFactory();
    const check = validateBackup(text);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    await restoreBackup(check.backup);
    ps = await photosFor('test-cookie');
    expect(ps).toHaveLength(2); expect(ps[0].dataUrl).toBe(IMG);
    await deletePhoto('p2');
    ps = await photosFor('test-cookie');
    expect(ps.map(p => [p.id, p.primary])).toEqual([['p1', true]]); // next photo becomes main
  });
  test('a backup with a broken photo is rejected', async () => {
    await init();
    const b = await createBackup();
    b.data.photos = [{ id: 'x', recipeId: 'r', dataUrl: 'javascript:alert(1)' }];
    expect(validateBackup(JSON.stringify(b)).ok).toBe(false);
  });
});

describe('7 & 10. production history and explicit master changes', () => {
  const rec = (over: Partial<ProductionRecord>): ProductionRecord => ({ id: crypto.randomUUID(), recipeId: 'test-cookie', recipeVersion: 1, recipeTitle: 'T', category: 'Cookies', date: '2026-11-18', factor: 1, expectedQuantity: 12, actualQuantity: 11, unitLabel: 'dough balls', storage: 'frozen-dough', createdAt: new Date().toISOString(), ...over });
  test('records are saved, listed newest first, and do NOT change the master', async () => {
    await init();
    const before = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    await addProduction(rec({ date: '2026-11-18', actualQuantity: 12 }));
    await addProduction(rec({ date: '2026-11-22', actualQuantity: 11 }));
    await addProduction(rec({ date: '2026-11-26', actualQuantity: 24, factor: 2 }));
    expect((await productionFor('test-cookie')).map(p => p.actualQuantity)).toEqual([24, 11, 12]);
    expect((await readData()).recipes.find(r => r.id === 'test-cookie')).toEqual(before);
    const dump = await dumpAll();
    expect(dump.production).toHaveLength(3); // included in backups
  });
  test('“update master” is explicit and creates a revision (cookies per batch, brownies per pan)', async () => {
    await init();
    const cookie = (await readData()).recipes.find(r => r.id === 'test-cookie')!;
    expect(masterYieldFromRecord(cookie, rec({ actualQuantity: 22, factor: 2 }))).toEqual({ yieldAmount: 11 });
    const brownie: Recipe = { ...testRecipes[1], yieldAmount: 1, yieldUnit: 'pan', piecesPerPan: 9 };
    expect(masterYieldFromRecord(brownie, rec({ category: 'Brownies', actualQuantity: 12, panCount: 1, piecesPerPan: 12 }))).toEqual({ piecesPerPan: 12 });
    expect(masterYieldFromRecord(brownie, rec({ category: 'Brownies', actualQuantity: 9, panCount: 1 }))).toBeNull();
    const v2 = await writeRecipe({ ...cookie, yieldAmount: 11 }, cookie.version);
    expect(v2.version).toBe(2);
    expect((await revisionsFor(cookie.id)).map(r => r.snapshot.yieldAmount)).toEqual([11, 12]);
  });
});

describe('11. blondies move to Brownies safely', () => {
  const blondie: Recipe = { ...testRecipes[0], id: 'ff-bb-espresso-caramel-blondies', title: 'Brown Butter Espresso Caramel Blondies', category: 'Other', version: 3 };
  test('category changes via a new revision; id, title, ingredients, steps and history preserved; runs once', async () => {
    await makeOldDb(3, {
      recipes: [blondie, testRecipes[0]],
      revisions: [1, 2, 3].map(v => ({ recipeId: blondie.id, version: v, snapshot: { ...blondie, version: v }, recordedAt: 'x' })),
      meta: [{ key: 'seeded', value: true }],
    });
    await init();
    let r = (await readData()).recipes.find(x => x.id === blondie.id)!;
    expect(r.category).toBe('Brownies'); expect(r.version).toBe(4); expect(r.title).toBe(blondie.title);
    expect(r.ingredients).toEqual(blondie.ingredients); expect(r.steps).toEqual(blondie.steps);
    expect((await revisionsFor(blondie.id)).map(v => v.version)).toEqual([4, 3, 2, 1]);
    expect((await readData()).recipes.find(x => x.id === 'test-cookie')!.version).toBe(1); // others untouched
    await init();
    expect((await readData()).recipes.find(x => x.id === blondie.id)!.version).toBe(4); // idempotent
    // a later deliberate change is respected
    r = await writeRecipe({ ...r, category: 'Other' }, 4);
    await init();
    expect((await readData()).recipes.find(x => x.id === blondie.id)!.category).toBe('Other');
  });
});

describe('12. phoenix animation honours reduced motion and the setting', () => {
  const mm = (matches: boolean) => { window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as any; };
  test('animated normally; static when reduced motion is requested; static when turned off', () => {
    mm(false); setLogoAnimationSetting(true);
    const a = render(<PhoenixSmolder><span>logo</span></PhoenixSmolder>);
    expect(a.getByTestId('phoenix-smolder').dataset.animated).toBe('true');
    expect(a.container.querySelector('.embers')).not.toBeNull();
    expect(a.container.querySelectorAll('.ph-wing')).toHaveLength(0); // children only here; emblem tested below
    a.unmount();
    mm(true);
    const b = render(<PhoenixSmolder><span>logo</span></PhoenixSmolder>);
    expect(b.getByTestId('phoenix-smolder').dataset.animated).toBe('false');
    expect(b.container.querySelector('.embers')).toBeNull();
    expect(b.getByText('logo')).toBeTruthy(); // static fallback still shows the logo
    b.unmount();
    mm(false); setLogoAnimationSetting(false);
    const c = render(<PhoenixSmolder><span>logo</span></PhoenixSmolder>);
    expect(c.getByTestId('phoenix-smolder').dataset.animated).toBe('false');
    setLogoAnimationSetting(true);
  });
});

describe('12b. phoenix wings are hinged groups', () => {
  test('four wing groups (2 per side) for the wing-beat animation', async () => {
    const { FullLogo } = await import('../src/components/Logo');
    const { container } = render(<PhoenixSmolder><FullLogo /></PhoenixSmolder>);
    expect(container.querySelectorAll('.ph-wing.ph-l')).toHaveLength(2);
    expect(container.querySelectorAll('.ph-wing.ph-r')).toHaveLength(2);
  });
});

describe('13. upgrading an existing v0.3 database keeps everything', () => {
  test('recipes, revisions, prices, sessions and settings survive; new stores are added', async () => {
    const cat = { id: 'flour', name: 'All-purpose flour', packageAmount: 10, packageUnit: 'lb', price: 15 };
    await makeOldDb(3, {
      recipes: [{ ...testRecipes[0], version: 5, notes: 'mine' }],
      revisions: [{ recipeId: 'test-cookie', version: 5, snapshot: { ...testRecipes[0], version: 5 }, recordedAt: 'x' }],
      catalog: [cat],
      sessions: [{ recipeId: 'test-cookie', recipeVersion: 5, factor: 2, checked: ['t1'], stepsDone: [], currentStep: 0, timers: [], startedAt: 'x', updatedAt: 'x' }],
      meta: [{ key: 'seeded', value: true }, { key: 'lastBackupAt', value: '2026-11-01T00:00:00.000Z' }, { key: 'recipePrefs', value: { favorites: ['test-cookie'], recent: [] } }],
    });
    await init();
    const d = await dumpAll();
    expect((d.recipes[0] as Recipe).notes).toBe('mine');
    expect(d.revisions).toHaveLength(1);
    expect(d.catalog).toEqual([cat]);
    expect((d.sessions[0] as any).factor).toBe(2);
    expect(d.meta.map((m: any) => m.key).sort()).toEqual(['lastBackupAt', 'recipePrefs', 'seeded']);
    expect(d.photos).toEqual([]); expect(d.production).toEqual([]);
  });
  test('older (v1) backup files still restore', async () => {
    await init();
    const b: any = await createBackup();
    b.backupVersion = 1; delete b.data.photos; delete b.data.production;
    (globalThis as any).indexedDB = new IDBFactory();
    const check = validateBackup(JSON.stringify(b));
    expect(check.ok).toBe(true);
    if (check.ok) await restoreBackup(check.backup);
    expect((await readData()).recipes).toHaveLength(2);
  });
});
