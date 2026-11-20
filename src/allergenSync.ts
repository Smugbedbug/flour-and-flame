// Keeps the order form's allergen lines in step with the recipes: when a recipe on the menu gets
// (or changes) its allergen list, its menu picture entry is re-sent to the sheet with the new line.
// Runs on the main device only (a phone linked to the PC may hold older recipe copies).
import { useEffect } from 'react';
import { useApp } from './app-context';
import { getHubConfig } from './hub';
import { addEvents, getSheetConfig } from './ledger';
import { useLedger } from './ledgerState';
import { staleAllergenEvents } from './components/MenuPicture';

const sent = new Map<string, string>(); // recipeId → line already queued this session (avoids repeats before the ledger catches up)

export function useAllergenSync(ready: boolean) {
  const { recipes } = useApp();
  const { bakery, connected } = useLedger();
  useEffect(() => {
    if (!ready || !connected || getHubConfig().role === 'receiver' || !getSheetConfig().lastPullAt) return;
    const t = setTimeout(() => {
      const onMenu = bakery.products.filter(p => p.active).flatMap(p => p.kind === 'mixed' ? (p.options ?? []).map(o => o.recipeId) : [p.recipeId]);
      const evs = staleAllergenEvents(onMenu, recipes, bakery.looks).filter((e: any) => sent.get(e.look.recipeId) !== (e.look.contains ?? ''));
      if (!evs.length) return;
      evs.forEach((e: any) => sent.set(e.look.recipeId, e.look.contains ?? ''));
      void addEvents(evs).catch(() => evs.forEach((e: any) => sent.delete(e.look.recipeId)));
    }, 4000);
    return () => clearTimeout(t);
  }, [ready, connected, recipes, bakery]);
}
