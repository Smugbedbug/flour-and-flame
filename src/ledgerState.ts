import { useEffect, useMemo, useState } from 'react';
import { ledgerAll } from './db';
import { computeFreezer, type LedgerEvent } from './freezer';
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
  const freezer = useMemo(() => computeFreezer(events), [events]);
  const pending = events.filter(e => e.seq === undefined).length;
  return { events, freezer, pending, cfg, connected: sheetReady(cfg) };
}

let lastAuto = 0;
/** Keep the sheet in step: on open, when returning to the app, when back online, and every 2 minutes while open. */
export function useAutoLedgerSync(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const tick = (force = false) => {
      if (!sheetReady() || !navigator.onLine || document.visibilityState !== 'visible') return;
      if (!force && Date.now() - lastAuto < 20_000) return;
      lastAuto = Date.now();
      void syncLedger().catch(() => {});
    };
    tick(true);
    const vis = () => tick(), online = () => tick(true);
    document.addEventListener('visibilitychange', vis); window.addEventListener('online', online);
    const h = setInterval(() => tick(true), 120_000);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', online); clearInterval(h); };
  }, [ready]);
}
