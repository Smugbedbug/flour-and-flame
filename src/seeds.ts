import type { Recipe } from './types';

/**
 * Recipes added automatically on a brand-new install.
 * Intentionally EMPTY in the public repository: personal recipes are imported
 * from a private JSON file (Recipes → Import) so they are never published.
 */
export const seeds: Recipe[] = [];
