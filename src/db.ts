// Local IndexedDB storage. Database name is unchanged from v0.1/v0.2 so existing data is kept.
import type { BakingSession, CatalogIngredient, DatabaseSnapshot, PendingChange, ProductionRecord, Recipe, RecipePhoto, RecipePrefs, Revision } from './types';
import { stableCatalogId } from './logic';
import { seeds } from './seeds';

export const DB_NAME = 'flour-and-flame-v1';
export const DB_VERSION = 4; // v2: revisions; v3: baking sessions; v4: photos + production history
export const STORES = ['recipes', 'catalog', 'revisions', 'outbox', 'meta', 'sessions', 'photos', 'production'] as const;
export type StoreName = (typeof STORES)[number];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error || Error('Transaction failed'));
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = event => {
      const db = r.result, tx = r.transaction!;
      if (!db.objectStoreNames.contains('recipes')) db.createObjectStore('recipes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('revisions')) db.createObjectStore('revisions', { keyPath: ['recipeId', 'version'] });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'recipeId' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }).createIndex('recipeId', 'recipeId');
      if (!db.objectStoreNames.contains('production')) db.createObjectStore('production', { keyPath: 'id' }).createIndex('recipeId', 'recipeId');
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion >= 1 && oldVersion < 2) {
        // v0.1 → v0.2: record each existing current recipe as a revision.
        const recipes = tx.objectStore('recipes'), revisions = tx.objectStore('revisions');
        recipes.openCursor().onsuccess = e => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) { const recipe = cursor.value as Recipe; revisions.put({ recipeId: recipe.id, version: recipe.version, snapshot: recipe, recordedAt: recipe.updatedAt }); cursor.continue(); }
        };
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error('Database upgrade blocked. Close other Flour and Flame tabs and reload.'));
  });
}

async function withDb<T>(callback: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try { return await callback(db); } finally { db.close(); }
}

function queue(tx: IDBTransaction, entity: 'recipe' | 'catalogIngredient', payload: Recipe | CatalogIngredient): void {
  const item: PendingChange = { id: crypto.randomUUID(), entity, entityId: payload.id, operation: 'upsert', updatedAt: new Date().toISOString(), payload };
  tx.objectStore('outbox').put(item);
}

export async function init(): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction(['recipes', 'catalog', 'revisions', 'meta', 'outbox'], 'readwrite'), done = txDone(tx);
    const meta = tx.objectStore('meta'), flag = await requestResult(meta.get('seeded'));
    if (!flag) {
      const rs = tx.objectStore('recipes'), cs = tx.objectStore('catalog'), vs = tx.objectStore('revisions');
      const existing = (await requestResult(rs.getAll())) as Recipe[];
      if (!existing.length) for (const r of seeds) { rs.put(r); vs.put({ recipeId: r.id, version: r.version, snapshot: r, recordedAt: r.updatedAt }); queue(tx, 'recipe', r); }
      const catalogExisting = (await requestResult(cs.getAll())) as CatalogIngredient[];
      const names = new Map<string, string>();
      for (const c of catalogExisting) names.set(c.name.trim().toLowerCase(), c.id);
      for (const r of [...existing, ...(!existing.length ? seeds : [])]) for (const line of r.ingredients) {
        const n = line.name.trim().toLowerCase();
        if (!names.has(n)) { const c: CatalogIngredient = { id: line.catalogIngredientId || stableCatalogId(line.name), name: line.name }; cs.put(c); names.set(n, c.id); }
      }
      meta.put({ key: 'seeded', value: true });
    }
    // v0.4 migration: blondies belong in Brownies. Runs once per recipe; creates a normal revision
    // (ids, history, ingredients and method untouched). Recorded so a later manual change is respected.
    const migrated = ((await requestResult(meta.get('blondiesMovedToBrownies'))) as { value: string[] } | undefined)?.value ?? [];
    const all = (await requestResult(tx.objectStore('recipes').getAll())) as Recipe[];
    const moved: string[] = [];
    for (const r of all) {
      if (migrated.includes(r.id) || !isBlondie(r)) continue;
      moved.push(r.id);
      if (r.category !== 'Brownies') putRecipeInTx(tx, r, { ...r, category: 'Brownies' }, r.version);
    }
    if (moved.length) meta.put({ key: 'blondiesMovedToBrownies', value: [...migrated, ...moved] });
    await done;
  });
}

export function isBlondie(r: Pick<Recipe, 'title' | 'tags'>): boolean {
  return /\bblondies?\b/i.test(r.title) || (r.tags ?? []).some(t => /\bblondies?\b/i.test(t));
}

export async function readData(): Promise<DatabaseSnapshot> {
  return withDb(async db => {
    const tx = db.transaction(['recipes', 'catalog'], 'readonly'), done = txDone(tx);
    const [recipes, catalog] = await Promise.all([requestResult(tx.objectStore('recipes').getAll()), requestResult(tx.objectStore('catalog').getAll())]);
    await done;
    return { recipes: recipes as Recipe[], catalog: catalog as CatalogIngredient[] };
  });
}

export async function revisionsFor(recipeId: string): Promise<Revision[]> {
  return withDb(async db => {
    const tx = db.transaction('revisions', 'readonly'), done = txDone(tx);
    const values = await requestResult(tx.objectStore('revisions').getAll(IDBKeyRange.bound([recipeId, 0], [recipeId, Number.MAX_SAFE_INTEGER])));
    await done;
    return (values as Revision[]).sort((a, b) => b.version - a.version);
  });
}

function putRecipeInTx(tx: IDBTransaction, existing: Recipe | undefined, input: Recipe, expectedVersion: number | null): Recipe {
  if (existing && existing.version !== expectedVersion) throw Error(`"${input.title}" changed since you opened it. Reload before saving; your edits have not been overwritten.`);
  if (!existing && expectedVersion !== null) throw Error(`"${input.title}" was deleted or is unavailable.`);
  const next: Recipe = { ...structuredClone(input), version: existing ? existing.version + 1 : 1, updatedAt: new Date().toISOString() };
  tx.objectStore('recipes').put(next);
  tx.objectStore('revisions').put({ recipeId: next.id, version: next.version, snapshot: next, recordedAt: next.updatedAt });
  queue(tx, 'recipe', next);
  return next;
}

/** Explicit save of a master recipe: always creates a new revision. */
export async function writeRecipe(input: Recipe, expectedVersion: number | null): Promise<Recipe> {
  return withDb(async db => {
    const tx = db.transaction(['recipes', 'revisions', 'outbox'], 'readwrite'), done = txDone(tx);
    try {
      const existing = (await requestResult(tx.objectStore('recipes').get(input.id))) as Recipe | undefined;
      const next = putRecipeInTx(tx, existing, input, expectedVersion);
      await done;
      return next;
    } catch (e) { try { tx.abort(); } catch { /* already finished */ } await done.catch(() => {}); throw e; }
  });
}

/**
 * All-or-nothing import: new catalog ingredients and every recipe are written in ONE transaction.
 * If any recipe fails (e.g. it changed meanwhile), nothing from this import is saved.
 */
export async function importRecipes(newCatalog: CatalogIngredient[], items: { recipe: Recipe; expectedVersion: number | null }[]): Promise<Recipe[]> {
  return withDb(async db => {
    const tx = db.transaction(['recipes', 'revisions', 'outbox', 'catalog'], 'readwrite'), done = txDone(tx);
    try {
      for (const c of newCatalog) { tx.objectStore('catalog').put(c); queue(tx, 'catalogIngredient', c); }
      const saved: Recipe[] = [];
      for (const item of items) {
        const existing = (await requestResult(tx.objectStore('recipes').get(item.recipe.id))) as Recipe | undefined;
        saved.push(putRecipeInTx(tx, existing, item.recipe, item.expectedVersion));
      }
      await done;
      return saved;
    } catch (e) { try { tx.abort(); } catch { /* already finished */ } await done.catch(() => {}); throw e; }
  });
}

export async function writeCatalog(item: CatalogIngredient): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction(['catalog', 'outbox'], 'readwrite'), done = txDone(tx);
    tx.objectStore('catalog').put(item); queue(tx, 'catalogIngredient', item);
    await done;
  });
}

// ---------- meta (settings, prefs, backup dates) ----------
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return withDb(async db => {
    const tx = db.transaction('meta', 'readonly'), done = txDone(tx);
    const row = (await requestResult(tx.objectStore('meta').get(key))) as { key: string; value: T } | undefined;
    await done;
    return row?.value;
  });
}
export async function setMeta<T>(key: string, value: T): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('meta', 'readwrite'), done = txDone(tx);
    tx.objectStore('meta').put({ key, value });
    await done;
  });
}

export async function getPrefs(): Promise<RecipePrefs> {
  return (await getMeta<RecipePrefs>('recipePrefs')) ?? { favorites: [], recent: [] };
}
export async function toggleFavorite(id: string): Promise<RecipePrefs> {
  const p = await getPrefs();
  const favorites = p.favorites.includes(id) ? p.favorites.filter(x => x !== id) : [...p.favorites, id];
  const next = { ...p, favorites };
  await setMeta('recipePrefs', next);
  return next;
}
export async function markUsed(id: string): Promise<RecipePrefs> {
  const p = await getPrefs();
  const next = { ...p, recent: [{ id, at: new Date().toISOString() }, ...p.recent.filter(r => r.id !== id)].slice(0, 12) };
  await setMeta('recipePrefs', next);
  return next;
}

// ---------- baking sessions (temporary working state) ----------
export async function getSession(recipeId: string): Promise<BakingSession | undefined> {
  return withDb(async db => {
    const tx = db.transaction('sessions', 'readonly'), done = txDone(tx);
    const s = (await requestResult(tx.objectStore('sessions').get(recipeId))) as BakingSession | undefined;
    await done;
    return s;
  });
}
export async function listSessions(): Promise<BakingSession[]> {
  return withDb(async db => {
    const tx = db.transaction('sessions', 'readonly'), done = txDone(tx);
    const s = (await requestResult(tx.objectStore('sessions').getAll())) as BakingSession[];
    await done;
    return s.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}
export async function saveSession(s: BakingSession): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('sessions', 'readwrite'), done = txDone(tx);
    tx.objectStore('sessions').put({ ...s, updatedAt: new Date().toISOString() });
    await done;
  });
}
export async function deleteSession(recipeId: string): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('sessions', 'readwrite'), done = txDone(tx);
    tx.objectStore('sessions').delete(recipeId);
    await done;
  });
}

// ---------- full dump / replace (used by backup.ts) ----------
export type RawDump = Record<StoreName, unknown[]>;

export async function dumpAll(): Promise<RawDump> {
  return withDb(async db => {
    const tx = db.transaction([...STORES], 'readonly'), done = txDone(tx);
    const values = await Promise.all(STORES.map(s => requestResult(tx.objectStore(s).getAll())));
    await done;
    return Object.fromEntries(STORES.map((s, i) => [s, values[i]])) as RawDump;
  });
}

/** Replace EVERYTHING in one transaction. If any write fails the previous data stays intact. */
export async function replaceAll(data: RawDump): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction([...STORES], 'readwrite'), done = txDone(tx);
    try {
      for (const s of STORES) {
        const store = tx.objectStore(s);
        store.clear();
        for (const row of data[s] ?? []) store.put(row);
      }
      tx.objectStore('meta').put({ key: 'seeded', value: true });
      await done;
    } catch (e) { try { tx.abort(); } catch { /* already finished */ } await done.catch(() => {}); throw e; }
  });
}

// ---------- catalog merge (duplicates) ----------
/** Mark `fromId` as a duplicate of `intoId`. Recipes are NOT edited; costing follows the link. */
export async function mergeCatalog(fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) throw Error('Choose two different ingredients.');
  await withDb(async db => {
    const tx = db.transaction(['catalog', 'outbox'], 'readwrite'), done = txDone(tx), cs = tx.objectStore('catalog');
    const from = (await requestResult(cs.get(fromId))) as CatalogIngredient | undefined;
    const into = (await requestResult(cs.get(intoId))) as CatalogIngredient | undefined;
    if (!from || !into) { tx.abort(); await done.catch(() => {}); throw Error('Ingredient not found.'); }
    const aliases = [...new Set([...(into.aliases ?? []), from.name, ...(from.aliases ?? [])])].filter(a => a.toLowerCase() !== into.name.toLowerCase());
    const nextInto = { ...into, aliases }, nextFrom = { ...from, mergedInto: intoId };
    cs.put(nextInto); cs.put(nextFrom); queue(tx, 'catalogIngredient', nextInto); queue(tx, 'catalogIngredient', nextFrom);
    await done;
  });
}
export async function unmergeCatalog(id: string): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction(['catalog', 'outbox'], 'readwrite'), done = txDone(tx), cs = tx.objectStore('catalog');
    const c = (await requestResult(cs.get(id))) as CatalogIngredient | undefined;
    if (c) { const { mergedInto: _m, ...rest } = c; void _m; cs.put(rest); queue(tx, 'catalogIngredient', rest); }
    await done;
  });
}

// ---------- photos ----------
export async function photosFor(recipeId: string): Promise<RecipePhoto[]> {
  return withDb(async db => {
    const tx = db.transaction('photos', 'readonly'), done = txDone(tx);
    const rows = (await requestResult(tx.objectStore('photos').index('recipeId').getAll(recipeId))) as RecipePhoto[];
    await done;
    return rows.sort((a, b) => Number(b.primary) - Number(a.primary) || a.createdAt.localeCompare(b.createdAt));
  });
}
/** Primary photo thumbnails for all recipes (for cards). */
export async function primaryThumbs(): Promise<Record<string, string>> {
  return withDb(async db => {
    const tx = db.transaction('photos', 'readonly'), done = txDone(tx);
    const out: Record<string, string> = {};
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore('photos').openCursor();
      req.onsuccess = () => { const c = req.result; if (!c) return resolve(); const p = c.value as RecipePhoto; if (p.primary || !out[p.recipeId]) out[p.recipeId] = p.thumbUrl; c.continue(); };
      req.onerror = () => reject(req.error);
    });
    await done;
    return out;
  });
}
export async function addPhoto(photo: RecipePhoto, makePrimary: boolean): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('photos', 'readwrite'), done = txDone(tx), store = tx.objectStore('photos');
    const existing = (await requestResult(store.index('recipeId').getAll(photo.recipeId))) as RecipePhoto[];
    const primary = makePrimary || !existing.length;
    if (primary) for (const p of existing) if (p.primary) store.put({ ...p, primary: false });
    store.put({ ...photo, primary });
    await done;
  });
}
export async function setPrimaryPhoto(recipeId: string, photoId: string): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('photos', 'readwrite'), done = txDone(tx), store = tx.objectStore('photos');
    for (const p of (await requestResult(store.index('recipeId').getAll(recipeId))) as RecipePhoto[]) store.put({ ...p, primary: p.id === photoId });
    await done;
  });
}
export async function deletePhoto(photoId: string): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('photos', 'readwrite'), done = txDone(tx), store = tx.objectStore('photos');
    const p = (await requestResult(store.get(photoId))) as RecipePhoto | undefined;
    store.delete(photoId);
    if (p?.primary) {
      const rest = ((await requestResult(store.index('recipeId').getAll(p.recipeId))) as RecipePhoto[]).filter(x => x.id !== photoId);
      if (rest[0]) store.put({ ...rest[0], primary: true });
    }
    await done;
  });
}

// ---------- production history ----------
export async function addProduction(rec: ProductionRecord): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('production', 'readwrite'), done = txDone(tx);
    tx.objectStore('production').put(rec);
    await done;
  });
}
export async function productionFor(recipeId: string): Promise<ProductionRecord[]> {
  return withDb(async db => {
    const tx = db.transaction('production', 'readonly'), done = txDone(tx);
    const rows = (await requestResult(tx.objectStore('production').index('recipeId').getAll(recipeId))) as ProductionRecord[];
    await done;
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  });
}
export async function deleteProduction(id: string): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction('production', 'readwrite'), done = txDone(tx);
    tx.objectStore('production').delete(id);
    await done;
  });
}

// ---------- deleting recipes ----------
/** Move a recipe to (or back from) "Recently deleted". Keeps its versions, photos and history; no new version. */
export async function setRecipeDeleted(id: string, deleted: boolean): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction(['recipes', 'outbox'], 'readwrite'), done = txDone(tx), rs = tx.objectStore('recipes');
    const r = (await requestResult(rs.get(id))) as Recipe | undefined;
    if (!r) { tx.abort(); await done.catch(() => {}); throw Error('Recipe not found.'); }
    const { deletedAt: _d, ...rest } = r; void _d;
    const next: Recipe = deleted ? { ...rest, deletedAt: new Date().toISOString() } : rest;
    rs.put(next); queue(tx, 'recipe', next);
    await done;
  });
}

/**
 * Permanently delete a recipe with its versions, photos and any open baking session.
 * Production history records are KEPT (they store the recipe title) so past results aren't lost.
 */
export async function purgeRecipe(id: string): Promise<void> {
  await withDb(async db => {
    const tx = db.transaction(['recipes', 'revisions', 'photos', 'sessions'], 'readwrite'), done = txDone(tx);
    tx.objectStore('recipes').delete(id);
    tx.objectStore('revisions').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    tx.objectStore('sessions').delete(id);
    const photos = tx.objectStore('photos');
    for (const key of (await requestResult(photos.index('recipeId').getAllKeys(id))) as IDBValidKey[]) photos.delete(key);
    await done;
  });
}
