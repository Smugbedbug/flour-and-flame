// What-to-bake choices shared by the Shopping list and the Bake day "Make list" (same batches in both).
export type ShoppingSaved = { includeRequests: boolean; overrides: Record<string, number>; manual: { recipeId: string; factor: number }[]; have: Record<string, boolean>; extras: { id: string; text: string }[] };
export const SHOPPING_KEY = 'ff-shopping';
export const loadShopping = (): ShoppingSaved => {
  const base: ShoppingSaved = { includeRequests: true, overrides: {}, manual: [], have: {}, extras: [] };
  try { return { ...base, ...JSON.parse(localStorage.getItem(SHOPPING_KEY) ?? '{}') }; } catch { return base; }
};
export const saveShopping = (s: ShoppingSaved) => { try { localStorage.setItem(SHOPPING_KEY, JSON.stringify(s)); } catch { /* private mode */ } };
