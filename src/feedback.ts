// "How were they?" links: signed with your sheet key so only the customer's own link can leave a rating.
import { getSheetConfig } from './ledger';
import { orderParts, type Order } from './bakery';
import { costPerItem, expectedItems, recipeCost } from './costing';
import type { CatalogIngredient, Recipe } from './types';

async function hmacHex(key: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(value)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export async function feedbackLink(orderId: string): Promise<string | undefined> {
  const cfg = getSheetConfig();
  const dep = cfg.url?.match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/)?.[1];
  if (!dep || !cfg.key || !crypto?.subtle) return undefined;
  return `${location.origin}${location.pathname}#/feedback/${dep}/${orderId}/${await hmacHex(cfg.key, orderId)}`;
}
export { hmacHex as _hmacHexForTests };

/** The "Picked up" event: ingredient-cost snapshot (later price changes won't rewrite it) + feedback link. */
export async function pickedUpEvent(o: Order, recipes: Recipe[], catalog: CatalogIngredient[]) {
  let total = 0, complete = true;
  for (const part of orderParts(o.items)) {
    const r = recipes.find(x => x.id === part.recipeId);
    const pp = r ? costPerItem(recipeCost(r, catalog), expectedItems(r)) : null;
    if (pp === null) complete = false; else total += pp * part.count;
  }
  const link = await feedbackLink(o.orderId).catch(() => undefined);
  return { type: 'order.status', orderId: o.orderId, status: 'completed', costSnapshot: { total: complete ? Math.round(total * 100) / 100 : null, complete }, ...(link ? { feedbackLink: link } : {}) } as any;
}
