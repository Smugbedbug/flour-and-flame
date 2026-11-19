// Shared UI state for PC → phone updates (send/check actions, pending conflict choice, unsent-changes flag).
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './app-context';
import { buildHubPackage, checkForUpdate, finishWithChoices, getHubConfig, packageHash, sendUpdate, type HubPackage, type HubPlan } from './hub';

type Pending = { pkg: HubPackage; plan: HubPlan; updatedAt: string } | null;
let pending: Pending = null;
let busy = { sending: false, checking: false, resolving: false };
let lastAutoCheck = 0;
const emit = () => window.dispatchEvent(new Event('ff-hub-state'));
function useHubTick() {
  const [, set] = useState(0);
  useEffect(() => { const on = () => set(n => n + 1); window.addEventListener('ff-hub-state', on); window.addEventListener('ff-hub', on); return () => { window.removeEventListener('ff-hub-state', on); window.removeEventListener('ff-hub', on); }; }, []);
}

export function usePendingChoice(): Pending { useHubTick(); return pending; }

export function useHubActions() {
  useHubTick();
  const { refresh, notify, recipes, catalog, packaging } = useApp();
  const [unsent, setUnsent] = useState(false);

  // Hub: is the current data different from what was last sent?
  useEffect(() => {
    const cfg = getHubConfig();
    if (cfg.role !== 'hub' || !cfg.lastPublishedHash) { setUnsent(false); return; }
    let cancelled = false;
    void buildHubPackage().then(packageHash).then(h => { if (!cancelled) setUnsent(h !== getHubConfig().lastPublishedHash); }).catch(() => {});
    return () => { cancelled = true; };
  }, [recipes, catalog, packaging]);

  const send = useCallback(async () => {
    busy.sending = true; emit();
    try { await sendUpdate(); setUnsent(false); notify('Sent. Your phone will pick it up next time it opens.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Sending failed.', true); }
    finally { busy.sending = false; emit(); }
  }, [notify]);

  /** Returns true when the check succeeded (applied, nothing new, or waiting for your choice). */
  const check = useCallback(async (manual = false): Promise<boolean> => {
    if (busy.checking) return false;
    busy.checking = true; emit();
    try {
      const r = await checkForUpdate(manual);
      if (r.status === 'applied') { await refresh(); notify(`Updated from your PC: ${r.summary}.`); }
      else if (r.status === 'needs-choice') { pending = { pkg: r.pkg, plan: r.plan, updatedAt: r.updatedAt }; notify('Update from your PC: choose which version to keep for changed recipes.'); }
      else if (manual) notify('Already up to date.');
      return true;
    } catch (e) { if (manual) notify(e instanceof Error ? e.message : 'Checking failed.', true); else console.warn('Auto update check failed', e); return false; }
    finally { busy.checking = false; emit(); }
  }, [refresh, notify]);

  const resolve = useCallback(async (choices: Record<string, 'pc' | 'phone'>) => {
    if (!pending) return;
    busy.resolving = true; emit();
    try { const summary = await finishWithChoices(pending.pkg, pending.plan, pending.updatedAt, choices); pending = null; await refresh(); notify(`Updated from your PC: ${summary}.`); }
    catch (e) { notify(e instanceof Error ? e.message : 'Update failed.', true); }
    finally { busy.resolving = false; emit(); }
  }, [refresh, notify]);

  return { send, check, resolve, unsent, sending: busy.sending, checking: busy.checking, resolving: busy.resolving };
}

/** Phone: check automatically on open, when returning to the app, and when back online (at most once a minute). */
export function useAutoCheck(ready: boolean) {
  const { check } = useHubActions();
  useEffect(() => {
    if (!ready) return;
    const maybe = () => {
      const cfg = getHubConfig();
      if (cfg.role !== 'receiver' || !cfg.gistId || !navigator.onLine || document.visibilityState !== 'visible') return;
      if (Date.now() - lastAutoCheck < 60_000) return;
      lastAutoCheck = Date.now();
      void check(false);
    };
    maybe();
    document.addEventListener('visibilitychange', maybe);
    window.addEventListener('online', maybe);
    return () => { document.removeEventListener('visibilitychange', maybe); window.removeEventListener('online', maybe); };
  }, [ready, check]);
}
