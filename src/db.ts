// Local IndexedDB storage. Database name is unchanged from v0.1/v0.2 so existing data is kept.
import type { BakingSession, CatalogIngredient, DatabaseSnapshot, PendingChange, Recipe, RecipePrefs, Revision } from './types';
import { stableCatalogId } from './logic';
import { seeds } from './seeds';

export const DB_NAME = 'flour-and-flame-v1';
export const DB_VERSION = 3; // v2: revisions; v3: baking sessions
export const STORES = ['recipes', 'catalog', 'revisions', 'outbox', 'meta', 'sessions'] as const;
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
    await done;
  });
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
