// "Connection check": a plain-words health report for order alerts on this device, with a Copy button.
import { Activity } from 'lucide-react';
import { useState } from 'react';
import { APP_VERSION } from '../backup';
import { APPS_SCRIPT_VERSION } from '../appsScript';
import { getSheetConfig, syncLedger } from '../ledger';
import { ledgerAll } from '../db';
import { getAlertSound, showSystem, systemAlertsState } from './OrderAlerts';

type Line = { ok: boolean | null; text: string };

const ago = (iso?: string) => {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

async function timed<T>(f: () => Promise<T>): Promise<[T | null, number, string?]> {
  const t = performance.now();
  try { const r = await f(); return [r, Math.round(performance.now() - t)]; }
  catch (e) { return [null, Math.round(performance.now() - t), e instanceof Error ? e.message : String(e)]; }
}

export function ConnectionCheck() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  const run = async () => {
    setBusy(true); setLines([]);
    const cfg = getSheetConfig();
    const out: Line[] = [];
    out.push({ ok: null, text: `App ${APP_VERSION} on ${/Android/i.test(navigator.userAgent) ? 'Android' : /Windows/i.test(navigator.userAgent) ? 'Windows' : navigator.platform || 'this device'} · ${navigator.onLine ? 'online' : 'OFFLINE'}` });
    if (!cfg.url || !cfg.key) { out.push({ ok: false, text: 'Not connected to the bakery sheet on this device.' }); setLines(out); setBusy(false); return; }
    const [ping, pingMs, pingErr] = await timed(async () => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60_000);
      try { const r = await fetch(`${cfg.url}?action=ping&key=${encodeURIComponent(cfg.key!)}`, { cache: 'no-store', redirect: 'follow', signal: ctl.signal }); return await r.json(); } finally { clearTimeout(t); }
    });
    if (!ping) out.push({ ok: false, text: `Couldn’t reach the sheet (${pingErr}) after ${(pingMs / 1000).toFixed(1)} s.` });
    else {
      out.push({ ok: !!ping.authorized, text: ping.authorized ? `Sheet answered in ${(pingMs / 1000).toFixed(1)} s, key accepted.` : 'Sheet answered, but REJECTED the key. Copy the script from Sheet settings again and redeploy.' });
      const v = Number(ping.version) || 0;
      out.push({ ok: v >= APPS_SCRIPT_VERSION, text: v >= APPS_SCRIPT_VERSION ? `Script version ${v} (up to date).` : `Script version ${v || '?'}: version ${APPS_SCRIPT_VERSION} is out. Update it in Sheet settings.` });
    }
    const [res, syncMs, syncErr] = await timed(() => syncLedger());
    out.push({ ok: !!res, text: res ? `Checked for new orders in ${(syncMs / 1000).toFixed(1)} s: received ${res.received}, sent ${res.sent}.` : `Sync failed after ${(syncMs / 1000).toFixed(1)} s: ${syncErr}` });
    const c2 = getSheetConfig();
    out.push({ ok: null, text: `Last check for new orders: ${ago(c2.lastPullAt ?? c2.lastSyncAt)}.` });
    const pending = (await ledgerAll()).filter(e => e.seq === undefined).length;
    out.push({ ok: pending === 0, text: pending ? `${pending} change${pending > 1 ? 's' : ''} on this device not yet on the sheet.` : 'Everything on this device is on the sheet.' });
    const sys = systemAlertsState();
    out.push({ ok: sys === 'on', text: sys === 'on' ? 'Windows/phone notifications: allowed.' : sys === 'blocked' ? 'Windows/phone notifications: BLOCKED for this site. Allow them in the browser’s site settings (the icon left of the web address).' : sys === 'unsupported' ? 'This browser can’t show notifications.' : 'Windows/phone notifications: not turned on. Tap “Also show Windows/phone notifications” on the order banner or in Order alerts.' });
    out.push({ ok: getAlertSound() ? true : null, text: getAlertSound() ? 'Chime: on.' : 'Chime: off.' });
    setLines(out); setBusy(false);
  };

  const copy = () => { void navigator.clipboard?.writeText(lines.map(l => (l.ok === false ? '⚠ ' : l.ok ? '✓ ' : '· ') + l.text).join('\n')); };

  return <>
    <button className="small-btn" onClick={() => { setOpen(true); void run(); }}><Activity size={14} /> Connection check</button>
    {open && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="conn-title">
        <div className="modal conn-modal">
          <h3 id="conn-title"><Activity size={20} /> Connection check</h3>
          {busy && !lines.length && <p className="muted">Checking… (the sheet can take up to 20 seconds to wake up)</p>}
          <ul className="conn-lines">{lines.map((l, i) => <li key={i} className={l.ok === false ? 'bad' : l.ok ? 'good' : ''}>{l.ok === false ? '⚠' : l.ok ? '✓' : '·'} {l.text}</li>)}</ul>
          {busy && lines.length > 0 && <p className="muted small">Still checking…</p>}
          <div className="btn-row">
            <button onClick={() => setOpen(false)}>Close</button>
            <button disabled={busy} onClick={() => void run()}>Check again</button>
            <button disabled={!lines.length} onClick={copy}>Copy details</button>
            {systemAlertsState() === 'on' && <button onClick={() => void showSystem('🔔 Test notification', 'If you can see this, order notifications work on this device.')}>Send a test notification</button>}
          </div>
        </div>
      </div>
    )}
  </>;
}
