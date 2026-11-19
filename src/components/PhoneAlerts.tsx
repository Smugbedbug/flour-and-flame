// Instant phone alerts while the app is closed, through the free ntfy app.
// The bakery sheet posts each new order to a private, hard-to-guess "topic"; the ntfy app on the phone
// subscribes to that topic and pops up a notification straight away. No account, no cost.
import { Copy, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../app-context';
import { APPS_SCRIPT_VERSION } from '../appsScript';
import { addEvents, getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';

export function newTopic(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return 'flourflame-' + Array.from(bytes, b => abc[b % abc.length]).join('');
}
const appUrl = () => location.origin + location.pathname;

export function PhoneAlerts() {
  const { bakery } = useLedger();
  const { run, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const shop = bakery.shop;
  const n = shop.ntfy;
  const cfg = getSheetConfig();
  const connected = !!(cfg.url && cfg.key);
  const oldScript = (cfg.scriptVersion ?? 1) < 13;
  const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const save = (ntfy: typeof n) => run(async () => { await addEvents([{ type: 'shop.settings', settings: { ...shop, ntfy, appUrl: appUrl() } } as any]); });
  const setUp = () => void save({ topic: newTopic() }).then(() => notify('Phone alerts set up. Now subscribe in the ntfy app (step 2).'));

  const test = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await fetch(cfg.url!, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: cfg.key, action: 'ntfyTest' }) });
      const d = await res.json();
      setResult(d.ok ? { ok: true, text: 'Sent! It should pop up on your phone within a few seconds. If it doesn’t, check step 2 and that ntfy is allowed to show notifications.' }
        : d.error === 'needs-permission' ? { ok: false, text: 'Google hasn’t given the sheet permission to send alerts yet. In the script editor, pick “authorizeAlerts” in the list at the top, press ▶ Run and allow it (bakery account → Advanced → Go to the project → Allow). Then test again.' }
        : d.error === 'no-topic' ? { ok: false, text: 'The sheet hasn’t received the setup yet. Wait a few seconds (or tap Sync now) and test again.' }
        : d.error === 'unknown-action' ? { ok: false, text: `Your sheet script is older than version ${APPS_SCRIPT_VERSION}. Update it in Sheet settings first.` }
        : { ok: false, text: `The alert didn’t go through (${d.error ?? 'unknown problem'}).` });
    } catch { setResult({ ok: false, text: 'Couldn’t reach the bakery sheet. Check the internet connection.' }); }
    setBusy(false);
  };

  return (
    <section className="card phone-alerts">
      <h3><Smartphone size={18} /> Instant phone alerts, even when the app is closed</h3>
      <p className="muted small">Uses <b>ntfy</b>, a free notification app (no account, no cost). Your bakery sheet sends each new order straight to your phone the moment it arrives.</p>
      {!connected ? <p className="warn-text small">Connect the shared bakery sheet first.</p> : <>
        {oldScript && <p className="warn-text small">Needs sheet script version 13. Update it in Sheet settings (the banner there walks you through it).</p>}
        <ol className="alert-steps">
          <li><b>Install “ntfy”</b> from the Google Play Store on your phone (the icon is a white bell on green).</li>
          <li>
            <b>Subscribe to your private alert channel.</b>
            {!n?.topic ? <div className="btn-row"><button className="primary" onClick={setUp}><Smartphone size={16} /> Set up my channel</button></div> : <>
              <span className="small"> In ntfy, tap <b>+</b>, then type this name exactly (leave “Use another server” off):</span>
              <div className="topic-row"><code className="pair-link">{n.topic}</code><button className="small-btn" onClick={() => void navigator.clipboard?.writeText(n.topic).then(() => notify('Channel name copied.'))}><Copy size={14} /> Copy</button></div>
              {isPhone && <a className="button-link" href={`ntfy://ntfy.sh/${n.topic}`}>Open in the ntfy app</a>}
              <span className="muted small">Keep this name private: anyone who has it could see your order alerts. If it ever gets out, tap “New channel”.</span>
            </>}
          </li>
          {n?.topic && <li><b>Test it:</b> <button disabled={busy || oldScript} onClick={() => void test()}>{busy ? 'Sending…' : '🔔 Send a test alert'}</button>
            {result && <p className={'small ' + (result.ok ? 'ok-text' : 'warn-text')} role="status">{result.ok ? '✓ ' : '⚠ '}{result.text}</p>}</li>}
        </ol>
        {n?.topic && <div className="btn-row">
          <label className="agree"><input type="checkbox" checked={!n.off} onChange={e => void save({ ...n, off: !e.target.checked || undefined })} /> Send phone alerts for new orders</label>
          <button className="small-btn" onClick={() => { if (window.confirm('Make a new channel? You’ll need to subscribe to the new name in ntfy again.')) setUp(); }}>New channel</button>
        </div>}
        <p className="muted small">Tapping an alert opens the app on Orders. Test orders show 🧪. Alerts include the first name, what was ordered and the total; no emails or addresses.</p>
      </>}
    </section>
  );
}
