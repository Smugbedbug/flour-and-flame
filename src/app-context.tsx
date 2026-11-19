import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMeta, getPrefs, init, listSessions, primaryThumbs, readData } from './db';
import { setCostingRecipes } from './costing';
import type { BakingSession, CatalogIngredient, Recipe, RecipePrefs } from './types';

export type Mode = 'personal' | 'business';

type AppState = {
  ready: boolean;
  fatal: string;
  /** active recipes (not in Recently deleted) */
  recipes: Recipe[];
  /** recipes in Recently deleted */
  deletedRecipes: Recipe[];
  catalog: CatalogIngredient[];
  prefs: RecipePrefs;
  sessions: BakingSession[];
  lastBackupAt?: string;
  /** recipeId → primary photo thumbnail */
  thumbs: Record<string, string>;
  /** recipeId → packaging cost per sellable item (kept outside master recipes) */
  packaging: Record<string, number>;
  mode: Mode;
  setMode: (m: Mode) => void;
  setPrefs: (p: RecipePrefs) => void;
  refresh: () => Promise<void>;
  notify: (message: string, isError?: boolean) => void;
  toast: { message: string; error: boolean } | null;
  clearToast: () => void;
  /** Runs an async task, showing any error as a toast instead of crashing. */
  run: (task: () => Promise<void>) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [deletedRecipes, setDeletedRecipes] = useState<Recipe[]>([]);
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [prefs, setPrefs] = useState<RecipePrefs>({ favorites: [], recent: [] });
  const [sessions, setSessions] = useState<BakingSession[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [packaging, setPackaging] = useState<Record<string, number>>({});
  const [mode, setModeState] = useState<Mode>(() => { try { return (localStorage.getItem('ff-mode') as Mode) || 'personal'; } catch { return 'personal'; } });
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const data = await readData();
    const sorted = data.recipes.sort((a, b) => a.title.localeCompare(b.title));
    setCostingRecipes(sorted);
    setRecipes(sorted.filter(r => !r.deletedAt));
    setDeletedRecipes(sorted.filter(r => r.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!)));
    setCatalog(data.catalog.sort((a, b) => a.name.localeCompare(b.name)));
    setPrefs(await getPrefs());
    setSessions(await listSessions());
    setLastBackupAt(await getMeta<string>('lastBackupAt'));
    setThumbs(await primaryThumbs());
    setPackaging((await getMeta<Record<string, number>>('packagingCosts')) ?? {});
  }, []);

  useEffect(() => {
    (async () => {
      try { await init(); await refresh(); setReady(true); }
      catch (e) { setFatal(e instanceof Error ? e.message : 'Cannot open the local database.'); }
    })();
  }, [refresh]);

  const notify = useCallback((message: string, isError = false) => setToast({ message, error: isError }), []);
  const run = useCallback(async (task: () => Promise<void>) => {
    try { await task(); } catch (e) { setToast({ message: e instanceof Error ? e.message : 'Unexpected error', error: true }); }
  }, []);
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem('ff-mode', m); } catch { /* storage unavailable */ } };

  return (
    <Ctx.Provider value={{ ready, fatal, recipes, deletedRecipes, catalog, prefs, sessions, lastBackupAt, thumbs, packaging, mode, setMode, setPrefs, refresh, notify, toast, clearToast: () => setToast(null), run }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw Error('useApp outside AppProvider');
  return v;
}

// ---------- tiny hash router (makes the Android back button work) ----------
export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || 'home').split('/').map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export function go(path: string) { window.location.hash = '#/' + path; }
export function back(fallback = 'home') { if (window.history.length > 1) window.history.back(); else go(fallback); }
