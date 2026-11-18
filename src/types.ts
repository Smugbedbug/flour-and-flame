// Shared data model for Flour and Flame Bakery.
// Recipe schemaVersion 1 is unchanged from v0.2; every field added in v0.3 is OPTIONAL,
// so older recipe files and older saved data remain valid.

export type RecipeCategory = 'Cookies' | 'Brownies' | 'Crispy Treats' | 'Other';
export type RecipeStatus = 'Experimental' | 'Testing' | 'Approved' | 'Retired';
export const CATEGORIES: RecipeCategory[] = ['Cookies', 'Brownies', 'Crispy Treats', 'Other'];
export const STATUSES: RecipeStatus[] = ['Experimental', 'Testing', 'Approved', 'Retired'];

export type Ingredient = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  optional?: boolean;
  /** Ingredient group heading, e.g. Dough, Coating, Filling. */
  section?: string;
  /** Stable link to the ingredient catalog, independent of display name. */
  catalogIngredientId?: string | null;
  note?: string;
};

export type RecipeTip = { id: string; title: string; text: string; /** 0-based step index this tip belongs to */ step?: number };

/** Rectangular or round reference pan, in inches. Only recorded when the source recipe states it. */
export type PanSize =
  | { shape: 'rect'; widthIn: number; lengthIn: number; thicknessIn?: number }
  | { shape: 'round'; diameterIn: number; thicknessIn?: number };

export type Recipe = {
  id: string;
  schemaVersion: 1;
  version: number;
  title: string;
  category: RecipeCategory;
  status: RecipeStatus;
  yieldAmount: number;
  yieldUnit: string;
  ingredients: Ingredient[];
  steps: string[];
  notes?: string;
  source?: string;
  updatedAt: string;
  // ---- optional, added in v0.3 ----
  description?: string;
  tags?: string[];
  tips?: RecipeTip[];
  panSize?: PanSize;
  portionWeightG?: number;
  ovenTemp?: string;
  storage?: string;
};

export type CatalogIngredient = { id: string; name: string; packageAmount?: number; packageUnit?: string; price?: number; brand?: string; store?: string };
export type Revision = { recipeId: string; version: number; snapshot: Recipe; recordedAt: string };
export type PendingChange = { id: string; entity: 'recipe' | 'catalogIngredient'; entityId: string; operation: 'upsert'; updatedAt: string; payload: Recipe | CatalogIngredient };
export type DatabaseSnapshot = { recipes: Recipe[]; catalog: CatalogIngredient[] };

export type BakingTimer = {
  id: string;
  label: string;
  durationMs: number;
  /** epoch ms when the timer will finish; null when paused or not started */
  endsAt: number | null;
  /** remaining time while paused */
  remainingMs: number;
  finished: boolean;
};

/** Temporary working state for one recipe. Never written back to the master recipe. */
export type BakingSession = {
  recipeId: string;
  recipeVersion: number;
  factor: number;
  checked: string[];
  stepsDone: number[];
  currentStep: number;
  timers: BakingTimer[];
  brownButter?: { startG?: number; endG?: number };
  startedAt: string;
  updatedAt: string;
};

export type RecipePrefs = { favorites: string[]; recent: { id: string; at: string }[] };

const isStr = (v: unknown) => typeof v === 'string';
const isNonEmpty = (v: unknown) => typeof v === 'string' && !!v.trim();
const isPosNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function validRecipe(x: unknown): x is Recipe {
  return recipeProblems(x).length === 0;
}

/** Returns human-readable validation problems (empty array = valid). */
export function recipeProblems(x: unknown): string[] {
  const p: string[] = [];
  if (!x || typeof x !== 'object') return ['Not a recipe object.'];
  const r = x as Record<string, unknown>;
  if (r.schemaVersion !== 1) p.push('schemaVersion must be 1.');
  for (const k of ['id', 'title', 'yieldUnit', 'updatedAt']) if (!isNonEmpty(r[k])) p.push(`"${k}" must be non-empty text.`);
  if (!Number.isInteger(r.version) || Number(r.version) < 1) p.push('"version" must be a whole number ≥ 1.');
  if (!isPosNum(r.yieldAmount)) p.push('"yieldAmount" must be a positive number.');
  if (!CATEGORIES.includes(r.category as RecipeCategory)) p.push(`"category" must be one of: ${CATEGORIES.join(', ')}.`);
  if (!STATUSES.includes(r.status as RecipeStatus)) p.push(`"status" must be one of: ${STATUSES.join(', ')}.`);
  if (!Array.isArray(r.ingredients) || r.ingredients.length < 1) p.push('At least one ingredient is required.');
  else {
    r.ingredients.forEach((value: unknown, n) => {
      const i = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      const ok = isNonEmpty(i.id) && isNonEmpty(i.name) && typeof i.amount === 'number' && Number.isFinite(i.amount) && i.amount >= 0 && isNonEmpty(i.unit) &&
        (i.catalogIngredientId === undefined || i.catalogIngredientId === null || isStr(i.catalogIngredientId)) &&
        (i.section === undefined || isStr(i.section)) && (i.optional === undefined || typeof i.optional === 'boolean');
      if (!ok) p.push(`Ingredient ${n + 1} needs id, name, a non-negative amount and a unit.`);
    });
    const ids = (r.ingredients as Ingredient[]).map(i => i?.id);
    if (new Set(ids).size !== ids.length) p.push('Ingredient ids must be unique within a recipe.');
  }
  if (!Array.isArray(r.steps) || !r.steps.every(isStr)) p.push('"steps" must be a list of text.');
  for (const k of ['notes', 'source', 'description', 'ovenTemp', 'storage']) if (r[k] !== undefined && !isStr(r[k])) p.push(`"${k}" must be text.`);
  if (r.tags !== undefined && !(Array.isArray(r.tags) && r.tags.every(isStr))) p.push('"tags" must be a list of text.');
  if (r.tips !== undefined && !(Array.isArray(r.tips) && r.tips.every((t: any) => t && isNonEmpty(t.id) && isStr(t.title) && isNonEmpty(t.text) && (t.step === undefined || Number.isInteger(t.step))))) p.push('"tips" entries need id, title, text and optional step number.');
  if (r.portionWeightG !== undefined && !isPosNum(r.portionWeightG)) p.push('"portionWeightG" must be a positive number.');
  if (r.panSize !== undefined) {
    const s = r.panSize as any;
    const ok = s && ((s.shape === 'rect' && isPosNum(s.widthIn) && isPosNum(s.lengthIn)) || (s.shape === 'round' && isPosNum(s.diameterIn))) && (s.thicknessIn === undefined || isPosNum(s.thicknessIn));
    if (!ok) p.push('"panSize" must be {shape:"rect",widthIn,lengthIn} or {shape:"round",diameterIn}.');
  }
  return p;
}

export function validCatalogIngredient(x: unknown): x is CatalogIngredient {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  if (!isNonEmpty(c.id) || !isNonEmpty(c.name)) return false;
  if (c.packageAmount !== undefined && !isPosNum(c.packageAmount)) return false;
  if (c.price !== undefined && !(typeof c.price === 'number' && Number.isFinite(c.price) && c.price >= 0)) return false;
  if (c.packageUnit !== undefined && !isStr(c.packageUnit)) return false;
  return true;
}
