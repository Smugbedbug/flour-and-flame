// The Freezer: stock of frozen dough balls, computed from a shared list of events.
// Nothing is ever edited in place: adding and removing are events, so two devices can't overwrite each other,
// and replaying the same events always gives the same stock on every device.

export type LedgerEventBase = {
  eventId: string;
  /** device clock time (display + ordering of not-yet-shared events) */
  at: string;
  device: string;
  /** order assigned by the shared sheet; absent until shared */
  seq?: number;
};

export type FreezerAdd = LedgerEventBase & {
  type: 'freezer.add';
  batchId: string;
  recipeId: string;
  recipeTitle: string;
  count: number;
  portionWeightG?: number;
  /** YYYY-MM-DD */
  frozenOn: string;
  note?: string;
  productionId?: string;
};

export type RemoveReason = 'baked' | 'order' | 'discarded' | 'correction' | 'other';
export type FreezerRemove = LedgerEventBase & {
  type: 'freezer.remove';
  recipeId: string;
  recipeTitle: string;
  count: number;
  reason: RemoveReason;
  /** take from this batch first (otherwise oldest first) */
  batchId?: string;
  note?: string;
  orderId?: string;
};

export type LedgerEvent = FreezerAdd | FreezerRemove;

export type Batch = { batchId: string; frozenOn: string; added: number; remaining: number; portionWeightG?: number; note?: string; at: string };
export type FreezerItem = { recipeId: string; recipeTitle: string; total: number; batches: Batch[]; oldest?: string };
export type FreezerState = { items: FreezerItem[]; total: number; warnings: string[] };

/** Shared events in sheet order first, then this device's unshared events in time order. */
export function orderEvents<T extends LedgerEventBase>(events: T[]): T[] {
  const shared = events.filter(e => e.seq !== undefined).sort((a, b) => a.seq! - b.seq!);
  const local = events.filter(e => e.seq === undefined).sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
  return [...shared, ...local];
}

export function computeFreezer(events: LedgerEvent[]): FreezerState {
  const items = new Map<string, FreezerItem>();
  const warnings: string[] = [];
  const seen = new Set<string>();
  const item = (recipeId: string, recipeTitle: string) => {
    let it = items.get(recipeId);
    if (!it) { it = { recipeId, recipeTitle, total: 0, batches: [] }; items.set(recipeId, it); }
    if (recipeTitle) it.recipeTitle = recipeTitle;
    return it;
  };
  for (const ev of orderEvents(events)) {
    if (seen.has(ev.eventId)) continue; // same event twice never counts twice
    seen.add(ev.eventId);
    if (ev.type === 'freezer.add') {
      if (!(ev.count > 0)) continue;
      const it = item(ev.recipeId, ev.recipeTitle);
      it.batches.push({ batchId: ev.batchId, frozenOn: ev.frozenOn, added: ev.count, remaining: ev.count, portionWeightG: ev.portionWeightG, note: ev.note, at: ev.at });
    } else if (ev.type === 'freezer.remove') {
      if (!(ev.count > 0)) continue;
      const it = item(ev.recipeId, ev.recipeTitle);
      let need = ev.count;
      const fifo = [...it.batches].sort((a, b) => a.frozenOn.localeCompare(b.frozenOn) || a.at.localeCompare(b.at));
      const order = ev.batchId ? [...fifo.filter(b => b.batchId === ev.batchId), ...fifo.filter(b => b.batchId !== ev.batchId)] : fifo;
      for (const b of order) { if (!need) break; const take = Math.min(b.remaining, need); b.remaining -= take; need -= take; }
      if (need > 0) warnings.push(`${it.recipeTitle}: tried to remove ${ev.count} but only ${ev.count - need} were left (the stock can't go below zero).`);
    }
  }
  const list = [...items.values()].map(it => {
    const batches = it.batches.filter(b => b.remaining > 0).sort((a, b) => a.frozenOn.localeCompare(b.frozenOn));
    return { ...it, batches, total: batches.reduce((s, b) => s + b.remaining, 0), oldest: batches[0]?.frozenOn };
  }).sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle));
  return { items: list, total: list.reduce((s, i) => s + i.total, 0), warnings };
}

/** Whole weeks since a YYYY-MM-DD date (local). */
export function weeksSince(date: string, now = new Date()): number {
  const d = new Date(date + 'T12:00:00');
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (7 * 86400000)));
}

export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
