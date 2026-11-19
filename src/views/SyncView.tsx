import { CheckCircle2, Copy, Laptop, Link2, RefreshCw, Send, Share2, Smartphone, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { go, useApp } from '../app-context';
import { clearHub, getHubConfig, getPass, getToken, pairingLink, parseGistId, setHubConfig, setPass, setToken, type HubConfig } from '../hub';
import { useHubActions, usePendingChoice } from '../hubState';

function ago(iso?: string) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleString();
}

export function useHubConfig(): HubConfig {
  const [cfg, setCfg] = useState(getHubConfig);
  useEffect(() => { const on = () => setCfg(getHubConfig()); window.addEventListener('ff-hub', on); window.addEventListener('storage', on); return () => { window.removeEventListener('ff-hub', on); window.removeEventListener('storage', on); }; }, []);
  return cfg;
}

export function SyncView({ pairId }: { pairId?: string }) {
  const cfg = useHubConfig();
  const role = pairId ? 'receiver' : cfg.role;
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="page sync">
      <h2>PC → Phone updates</h2>
      <p className="muted">Make changes on your PC, press <b>Send to phone</b>, and your phone picks them up when it opens. Updates are encrypted with your passphrase and kept in a secret file in your own GitHub account; without the passphrase they can’t be read.</p>
      <p className="muted small">Sent: recipes (incl. deletions), ingredient prices and packaging costs. Not sent: photos, production history, baking sessions. Those stay on the device where you made them (use Backup to copy everything).</p>

      {!role || choosing ? (
        <div className="grid-2">
          <button className="card role-card" onClick={() => { setHubConfig({ role: 'hub' }); setChoosing(false); }}>
            <Laptop size={28} /><strong>This is my PC (the hub)</strong><span>I edit here and send updates.</span>
          </button>
          <button className="card role-card" onClick={() => { setHubConfig({ role: 'receiver' }); setChoosing(false); }}>
            <Smartphone size={28} /><strong>This is my phone</strong><span>Receive updates from my PC.</span>
          </button>
        </div>
      ) : role === 'hub' ? <HubSetup onChangeRole={() => setChoosing(true)} /> : <ReceiverSetup pairId={pairId} onChangeRole={() => setChoosing(true)} />}
    </div>
  );
}

function HubSetup({ onChangeRole }: { onChangeRole: () => void }) {
  const { notify } = useApp();
  const cfg = useHubConfig();
  const { send, sending, unsent } = useHubActions();
  const [token, setTok] = useState(getToken());
  const [pass, setP] = useState(getPass());
  const [pass2, setP2] = useState(getPass());
  const ready = !!getToken() && !!getPass();
  const link = cfg.gistId ? pairingLink(cfg.gistId) : '';

  function saveSecrets() {
    if (!token.trim()) { notify('Paste your GitHub token.', true); return; }
    if (pass.length < 6) { notify('Use a passphrase of at least 6 characters.', true); return; }
    if (pass !== pass2) { notify('The two passphrases don’t match.', true); return; }
    setToken(token); setPass(pass); setHubConfig({ role: 'hub' }); notify('Saved on this PC.');
  }
  return (
    <>
      <section className="card">
        <h3><Laptop size={18} /> This PC is the hub</h3>
        <ol className="setup-steps">
          <li>
            <strong>GitHub token</strong> (lets this PC save the encrypted update to your GitHub)
            <details>
              <summary>How to get one (2 minutes)</summary>
              <ol>
                <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">github.com/settings/personal-access-tokens/new</a> (signed in as you).</li>
                <li><b>Token name:</b> Flour and Flame. <b>Expiration:</b> pick the longest you're comfortable with (e.g. 1 year).</li>
                <li>Under <b>Permissions</b>, choose <b>Account</b> permissions → <b>Gists</b> → <b>Read and write</b>. Nothing else is needed.</li>
                <li>Click <b>Generate token</b>, copy it, and paste it below.</li>
              </ol>
              <p className="muted small">The token is stored only in this PC’s browser and is never included in backups or updates.</p>
            </details>
            <input type="password" aria-label="GitHub token" autoComplete="off" value={token} onChange={e => setTok(e.target.value)} placeholder="github_pat_…" />
          </li>
          <li>
            <strong>Passphrase</strong> (you'll type it once on your phone; it isn't sent anywhere)
            <input type="password" aria-label="Passphrase" autoComplete="new-password" value={pass} onChange={e => setP(e.target.value)} placeholder="At least 6 characters" />
            <input type="password" aria-label="Repeat passphrase" autoComplete="new-password" value={pass2} onChange={e => setP2(e.target.value)} placeholder="Repeat passphrase" />
          </li>
        </ol>
        <button onClick={saveSecrets}>Save</button>
      </section>

      <section className="card">
        <h3><Send size={18} /> Send to phone</h3>
        <p>Last sent: <strong>{ago(cfg.lastPublishedAt)}</strong>{cfg.lastPublishedAt && (unsent ? <span className="pill warn small">changes not sent yet</span> : <span className="pill ok small"><CheckCircle2 size={13} /> up to date</span>)}</p>
        <button className="primary big" disabled={!ready || sending} onClick={() => void send()}><Send size={18} /> {sending ? 'Sending…' : 'Send to phone'}</button>
        {!ready && <p className="muted small">Save a token and passphrase first.</p>}
      </section>

      {link && (
        <section className="card">
          <h3><Link2 size={18} /> Link your phone (once)</h3>
          <p className="muted small">Open this link on your phone (email or text it to yourself), then enter the same passphrase.</p>
          <code className="pair-link">{link}</code>
          <div className="btn-row">
            <button onClick={() => void navigator.clipboard?.writeText(link).then(() => notify('Link copied.')).catch(() => notify('Copy failed. Select the link and copy it.', true))}><Copy size={16} /> Copy link</button>
            {'share' in navigator && <button onClick={() => void (navigator as any).share({ title: 'Flour and Flame: link my phone', url: link }).catch(() => {})}><Share2 size={16} /> Share</button>}
          </div>
        </section>
      )}
      <div className="btn-row">
        <button className="link" onClick={onChangeRole}>This isn’t my PC</button>
        <button className="link" onClick={() => { if (window.confirm('Unlink this PC? Your recipes stay. The token and passphrase are removed from this browser.')) { clearHub(); go('sync'); } }}><Unlink size={14} /> Unlink</button>
      </div>
    </>
  );
}

function ReceiverSetup({ pairId, onChangeRole }: { pairId?: string; onChangeRole: () => void }) {
  const { notify } = useApp();
  const cfg = useHubConfig();
  const { check, checking } = useHubActions();
  const pending = usePendingChoice();
  const [link, setLink] = useState(pairId ?? cfg.gistId ?? '');
  const [pass, setP] = useState(getPass());
  const linked = !!cfg.gistId && !!getPass() && cfg.role === 'receiver' && !pairId;

  async function connect() {
    const id = parseGistId(link);
    if (!id) { notify('Paste the link from your PC (it ends with a long code).', true); return; }
    if (pass.length < 6) { notify('Enter the passphrase you set on your PC.', true); return; }
    setHubConfig({ role: 'receiver', gistId: id, lastSeenUpdatedAt: undefined }); setPass(pass);
    const ok = await check(true);
    if (!ok) { setPass(''); setHubConfig({ gistId: undefined }); return; } // not linked until the first update decrypts
    if (pairId) go('sync');
  }

  return (
    <>
      {pending && <ConflictChooser />}
      <section className="card">
        <h3><Smartphone size={18} /> This phone receives updates from your PC</h3>
        {linked ? (
          <>
            <p>Last update received: <strong>{ago(cfg.lastReceivedAt)}</strong></p>
            <p className="muted small">The app checks automatically when you open it (with internet).</p>
            <button className="primary" disabled={checking} onClick={() => void check(true)}><RefreshCw size={16} /> {checking ? 'Checking…' : 'Check now'}</button>
          </>
        ) : (
          <>
            <label className="field">Link from your PC<input aria-label="Link from your PC" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…#/pair/…" /></label>
            <label className="field">Passphrase<input type="password" aria-label="Passphrase" value={pass} onChange={e => setP(e.target.value)} /></label>
            <button className="primary big" disabled={checking} onClick={() => void connect()}><Link2 size={18} /> {checking ? 'Connecting…' : 'Link & get latest'}</button>
          </>
        )}
        <p className="muted small">Edits you make on this phone stay here. If the PC later changes the same recipe, you'll be asked which version to keep, and the other stays in History.</p>
      </section>
      <div className="btn-row">
        <button className="link" onClick={onChangeRole}>This isn’t my phone</button>
        {linked && <button className="link" onClick={() => { if (window.confirm('Stop receiving updates on this phone? Your recipes stay.')) { clearHub(); go('sync'); } }}><Unlink size={14} /> Unlink</button>}
      </div>
    </>
  );
}

export function ConflictChooser() {
  const pending = usePendingChoice();
  const { resolve, resolving } = useHubActions();
  const [choices, setChoices] = useState<Record<string, 'pc' | 'phone'>>({});
  if (!pending) return null;
  const all = pending.plan.conflicts.every(c => choices[c.id]);
  return (
    <section className="card conflict">
      <h3>Choose which version to keep</h3>
      <p className="muted small">These recipes were changed on both your PC and this phone. Whichever you don’t pick is kept in the recipe’s History.</p>
      {pending.plan.conflicts.map(c => (
        <fieldset key={c.id} className="master-choice">
          <legend>{c.title}</legend>
          <label><input type="radio" checked={choices[c.id] === 'pc'} onChange={() => setChoices({ ...choices, [c.id]: 'pc' })} /> Use the PC’s version</label>
          <label><input type="radio" checked={choices[c.id] === 'phone'} onChange={() => setChoices({ ...choices, [c.id]: 'phone' })} /> Keep this phone’s version</label>
        </fieldset>
      ))}
      <div className="btn-row">
        <button className="small-btn" onClick={() => setChoices(Object.fromEntries(pending.plan.conflicts.map(c => [c.id, 'pc'])))}>All: PC</button>
        <button className="small-btn" onClick={() => setChoices(Object.fromEntries(pending.plan.conflicts.map(c => [c.id, 'phone'])))}>All: phone</button>
      </div>
      <button className="primary" disabled={!all || resolving} onClick={() => void resolve(choices)}>Apply update</button>
    </section>
  );
}
