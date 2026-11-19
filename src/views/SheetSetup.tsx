import { CheckCircle2, ChevronLeft, Copy, Eye, EyeOff, Link2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { back, go, useApp } from '../app-context';
import { APPS_SCRIPT_VERSION, buildAppsScript, newSheetKey } from '../appsScript';
import { clearSheet, getSheetConfig, isValidScriptUrl, setSheetConfig, syncLedger, testSheet } from '../ledger';
import { getHubConfig } from '../hub';
import { useLedger } from '../ledgerState';

export function SheetSetup() {
  const { notify } = useApp();
  const { cfg, connected } = useLedger();
  const [key] = useState(() => { const c = getSheetConfig(); if (c.key) return c.key; const k = newSheetKey(); setSheetConfig({ key: k }); return k; });
  const [url, setUrl] = useState(cfg.url ?? '');
  const [manualKey, setManualKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const hub = getHubConfig();
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => notify(`${what} copied.`)).catch(() => notify('Copy failed; select and copy it manually.', true));

  async function connect(k = key) {
    setBusy(true);
    try {
      const version = await testSheet(url, k);
      setSheetConfig({ scriptVersion: version, url: url.trim(), key: k, lastSeq: getSheetConfig().url === url.trim() ? getSheetConfig().lastSeq : 0, lastError: undefined });
      const r = await syncLedger();
      notify(`Connected to your bakery sheet${r.sent ? `; shared ${r.sent} change${r.sent > 1 ? 's' : ''}` : ''}${r.received ? `; received ${r.received}` : ''}.${hub.role === 'hub' ? ' Press “Send to phone” so your phone connects too.' : ''}`);
    } catch (e) { notify(e instanceof Error ? e.message : 'Couldn’t connect.', true); }
    setBusy(false);
  }

  return (
    <div className="page sheet-setup">
      <button className="link" onClick={() => back('freezer')}><ChevronLeft size={18} /> Back</button>
      <h2>Shared bakery sheet</h2>
      <p className="muted">A private Google Sheet in your Google account that keeps <b>The Freezer</b> (and soon orders) the same on your PC and phone, both ways. Later the same sheet will receive your customer order form and email you new orders.</p>

      {connected ? (
        <section className="card">
          <h3><CheckCircle2 size={18} /> Connected</h3>
          <p className="muted small">Syncs automatically when the app opens, every couple of minutes while open, and right after you make a change. Works offline and catches up later.</p>
          <p className="small">Web app URL: <code className="pair-link">{cfg.url}</code></p>
          {hub.role === 'receiver' && <p className="muted small">Set up automatically from your PC.</p>}
          {hub.role !== 'receiver' && (cfg.scriptVersion ?? 1) < APPS_SCRIPT_VERSION && (
            <div className="banner warn">
              <div><strong>Update the script</strong> (version {APPS_SCRIPT_VERSION}) for {(cfg.scriptVersion ?? 1) < 2 ? 'the customer order form, order emails, ' : ''}{(cfg.scriptVersion ?? 1) < 3 ? 'pickup choices, the order-form note and open/closed switch, customer emails, ' : ''}{(cfg.scriptVersion ?? 1) < 4 ? 'mixed boxes, custom box sizes, requiring an email address on the order form, ' : ''}and cookie pictures on the order form.
                <ol className="small">
                  <li><button className="link" onClick={() => copy(buildAppsScript(cfg.key!), 'Script')}>Copy the new script</button>.</li>
                  <li>In your sheet: <b>Extensions → Apps Script</b>, select all, paste over it, click 💾 Save.</li>
                  <li><b>Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy.</b> Allow access if asked (it sends order emails, including to customers who give an email address).</li>
                  <li>Come back and press <b>Check again</b>.</li>
                </ol>
                <button className="small-btn" disabled={busy} onClick={async () => { setBusy(true); try { const v = await testSheet(cfg.url!, cfg.key!); setSheetConfig({ scriptVersion: v }); notify(v >= APPS_SCRIPT_VERSION ? 'Script is up to date.' : `This web address still runs script version ${v}. Either edit THIS deployment and choose “New version”, or if you made a new deployment, paste its URL under “Use a different Web app URL”.`, v < APPS_SCRIPT_VERSION); } catch (e) { notify(e instanceof Error ? e.message : 'Check failed', true); } setBusy(false); }}>Check again</button>
              </div>
            </div>
          )}
          {hub.role === 'hub' && <p className="muted small">Your phone gets these settings automatically the next time you press <b>Send to phone</b>.</p>}
          {hub.role !== 'receiver' && (
            <details><summary className="small">Use a different Web app URL (e.g. after creating a new deployment)</summary>
              <p className="muted small">Your key stays the same, so the script you pasted keeps working.</p>
              <input aria-label="New Web app URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
              <button className="small-btn" disabled={busy || !url.trim()} onClick={() => void connect(cfg.key!)}>Test &amp; use this URL</button>
            </details>
          )}
          <details><summary className="small">Key (for connecting a device by hand)</summary>
            <p><code>{showKey ? cfg.key : '••••••••••••••••'}</code> <button className="small-btn" onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button> <button className="small-btn" onClick={() => copy(cfg.key!, 'Key')}><Copy size={14} /></button></p>
          </details>
          <div className="btn-row">
            <button onClick={() => go('freezer')}>Open The Freezer</button>
            <button className="link" onClick={() => { if (window.confirm('Disconnect this device from the bakery sheet? Freezer data stays on this device; nothing is deleted from the sheet.')) clearSheet(); }}><Unlink size={14} /> Disconnect</button>
          </div>
        </section>
      ) : hub.role === 'receiver' ? (
        <section className="card">
          <h3>On your phone</h3>
          <p>Set up the sheet on your PC first; your phone connects automatically with the next “Send to phone”.</p>
          <details><summary className="small">Or connect by hand</summary>
            <label className="field">Web app URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></label>
            <label className="field">Key<input value={manualKey} onChange={e => setManualKey(e.target.value)} /></label>
            <button className="primary" disabled={busy || !isValidScriptUrl(url) || !manualKey.trim()} onClick={() => void connect(manualKey.trim())}><Link2 size={16} /> Connect</button>
          </details>
        </section>
      ) : (
        <section className="card">
          <h3>Set up (about 10 minutes, once, on your PC)</h3>
          <ol className="setup-steps">
            <li><strong>Create a new Google Sheet.</strong> Open <a href="https://sheets.new" target="_blank" rel="noreferrer">sheets.new</a> (signed in to your Gmail) and name it <i>Flour and Flame Bakery</i>.</li>
            <li><strong>Open the script editor:</strong> in the sheet, choose <b>Extensions → Apps Script</b>. Delete the few lines already there.</li>
            <li><strong>Paste the Flour and Flame script</strong> (it already contains your private key), then click the 💾 <b>Save</b> icon.
              <div className="btn-row"><button className="primary" onClick={() => copy(buildAppsScript(key), 'Script')}><Copy size={16} /> Copy script</button></div>
              <details><summary className="small muted">Show the script</summary><pre className="code-view">{buildAppsScript(key)}</pre></details>
            </li>
            <li><strong>Deploy it:</strong> click <b>Deploy → New deployment</b>, click the ⚙️ next to “Select type” and pick <b>Web app</b>. Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>, then <b>Deploy</b>.
              <p className="muted small">Google then asks you to authorize your own script: choose your account → “Google hasn’t verified this app” → <b>Advanced</b> → <b>Go to … (unsafe)</b> → <b>Allow</b>. That warning appears for every personal script; it only lets the script edit this one sheet. “Anyone” lets the app reach it without a Google sign-in; only requests with your key can read or change it.</p>
            </li>
            <li><strong>Copy the Web app URL</strong> (ends in <code>/exec</code>) and paste it here:
              <input aria-label="Web app URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
              <button className="primary big" disabled={busy || !url.trim()} onClick={() => void connect()}><Link2 size={18} /> {busy ? 'Connecting…' : 'Test & connect'}</button>
            </li>
          </ol>
          <p className="muted small">If you ever edit the script, use <b>Deploy → Manage deployments → ✏️ → Version: New version</b> so the URL stays the same.</p>
        </section>
      )}
    </div>
  );
}
