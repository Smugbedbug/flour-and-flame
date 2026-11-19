import { useEffect, useMemo, useState } from 'react';
import { ledgerAll } from './db';
import type { LedgerEvent } from './freezer';
import { computeBakery } from './bakery';
import { getSheetConfig, sheetReady, syncLedger, type SheetConfig } from './ledger';

/** Live freezer data + sheet status; refreshes when events change on this device or arrive from the sheet. */
export function useLedger() {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [cfg, setCfg] = useState<SheetConfig>(getSheetConfig);
  useEffect(() => {
    let alive = true;
    const load = () => void ledgerAll().then(e => { if (alive) setEvents(e); }).catch(() => {});
    const onCfg = () => setCfg(getSheetConfig());
    load();
    window.addEventListener('ff-ledger', load); window.addEventListener('ff-sheet', onCfg);
    return () => { alive = false; window.removeEventListener('ff-ledger', load); window.removeEventListener('ff-sheet', onCfg); };
  }, []);
  const bakery = useMemo(() => computeBakery(events), [events]);
  const freezer = bakery.freezer;
  const pending = events.filter(e => e.seq === undefined).length;
  return { events, bakery, freezer, pending, cfg, connected: sheetReady(cfg) };
}

let lastAuto = 0;
/**
 * Keep the sheet in step so new orders show up fast: on open, when you come back to the app, when back online,
 * every 30 seconds while you're looking at it, and about once a minute while it's in a background tab
 * (so the pop-up, sound and Windows notification still happen).
 */
export function useAutoLedgerSync(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const tick = (force = false) => {
      if (!sheetReady() || !navigator.onLine) return;
      const visible = document.visibilityState === 'visible';
      const gap = Date.now() - lastAuto;
      if (!force && gap < (visible ? 20_000 : 55_000)) return;
      lastAuto = Date.now();
      void syncLedger().catch(() => {});
    };
    tick(true);
    const back = () => { if (document.visibilityState === 'visible') tick(Date.now() - lastAuto > 5_000); };
    const online = () => tick(true);
    document.addEventListener('visibilitychange', back); window.addEventListener('focus', back); window.addEventListener('online', online);
    const h = setInterval(() => tick(), 30_000);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); window.removeEventListener('online', online); clearInterval(h); };
  }, [ready]);
}
