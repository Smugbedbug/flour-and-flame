// Bake history shared through the bakery sheet: each device keeps its own records locally and also
// publishes them as ledger events, so the phone and PC see the same history (and the same yield-based
// batch suggestions). A deletion on any device hides the record everywhere.
import { useEffect, useMemo, useState } from 'react';
import { addProduction, deleteProduction, productionAll } from './db';
import { addEvents, getSheetConfig } from './ledger';
import { useLedger } from './ledgerState';
import type { ProductionRecord } from './types';

const BACKFILL = 'ff-production-shared';

export async function recordProduction(rec: ProductionRecord) {
  await addProduction(rec);
  await addEvents([{ type: 'production.record', record: rec } as any]);
}
export async function removeProduction(id: string) {
  await deleteProduction(id);
  await addEvents([{ type: 'production.delete', recordId: id } as any]);
}

/** Merge local and shared records (deduped by id, shared deletions win). */
export function mergeProduction(local: ProductionRecord[], shared: ProductionRecord[], deleted: string[]): ProductionRecord[] {
  const gone = new Set(deleted);
  const m = new Map<string, ProductionRecord>();
  for (const r of [...shared, ...local]) if (!gone.has(r.id)) m.set(r.id, r);
  return [...m.values()].sort((a, b) => (b.date + (b.createdAt ?? '')).localeCompare(a.date + (a.createdAt ?? '')));
}

/** All bake history visible on this device; `version` changes whenever it may have changed. */
export function useAllProduction(version: unknown = 0): ProductionRecord[] {
  const { bakery, connected } = useLedger();
  const [local, setLocal] = useState<ProductionRecord[]>([]);
  useEffect(() => { void productionAll().then(setLocal).catch(() => {}); }, [version, bakery.production.length, bakery.productionDeleted.length]);
  // one-time: publish records made before sharing existed
  useEffect(() => {
    if (!connected || !local.length) return;
    try { if (localStorage.getItem(BACKFILL) === getSheetConfig().url) return; } catch { return; }
    const known = new Set([...bakery.production.map(r => r.id), ...bakery.productionDeleted]);
    const missing = local.filter(r => !known.has(r.id));
    void (missing.length ? addEvents(missing.map(record => ({ type: 'production.record', record } as any))) : Promise.resolve())
      .then(() => { try { localStorage.setItem(BACKFILL, getSheetConfig().url ?? ''); } catch { /* ignore */ } }).catch(() => {});
  }, [connected, local]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => mergeProduction(local, bakery.production, bakery.productionDeleted), [local, bakery.production, bakery.productionDeleted]);
}
