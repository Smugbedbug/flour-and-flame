import { AlertTriangle, HardDriveDownload, HardDriveUpload, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { backupFileName, backupIsDue, createBackup, downloadText, recordBackupExported, restoreBackup, validateBackup, type BackupFile } from '../backup';
import { dumpAll } from '../db';

const LABELS: Record<string, string> = { recipes: 'Recipes', revisions: 'Recipe versions', catalog: 'Ingredients & prices', sessions: 'Baking sessions', meta: 'Settings', outbox: 'Pending sync records' };

export function BackupView() {
  const { lastBackupAt, run, refresh, notify } = useApp();
  const [pending, setPending] = useState<{ backup: BackupFile; summary: Record<string, number>; current: Record<string, number>; name: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)); }, []);

  async function exportNow() {
    await run(async () => {
      const b = await createBackup();
      downloadText(backupFileName(), JSON.stringify(b, null, 1));
      await recordBackupExported();
      await refresh();
      notify(`Backup downloaded: ${b.counts.recipes} recipes, ${b.counts.revisions} versions, ${b.counts.catalog} ingredients.`);
    });
  }

  async function pick(f: File) {
    setProblems([]); setPending(null); setAgree(false);
    const check = validateBackup(await f.text());
    if (!check.ok) { setProblems(check.problems); return; }
    const d = await dumpAll();
    setPending({ backup: check.backup, summary: check.summary, current: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length])), name: f.name });
  }

  async function doRestore() {
    if (!pending) return;
    await run(async () => {
      await restoreBackup(pending.backup);
      await refresh();
      setPending(null);
      notify('Backup restored. All data on this device was replaced.');
    });
  }

  return (
    <div className="page">
      <h2>Backup &amp; Restore</h2>
      <div className={'banner ' + (backupIsDue(lastBackupAt) ? 'warn' : 'ok')}>
        <ShieldCheck size={20} />
        <div><strong>Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'never'}</strong>
          <p>Your data is stored only in this browser on this device. A backup file is your safety net and the way to move data between your phone and PC until sync exists. You'll be reminded weekly.</p></div>
      </div>

      <section className="card">
        <h3><HardDriveDownload size={18} /> Create backup</h3>
        <p className="muted">Includes every recipe and all its versions, ingredients and prices, baking sessions and settings. Works offline. Save the file somewhere safe (Google Drive, OneDrive, email to yourself).</p>
        <button className="primary big" onClick={() => void exportNow()}><HardDriveDownload size={18} /> Download full backup</button>
      </section>

      <section className="card">
        <h3><HardDriveUpload size={18} /> Restore from backup</h3>
        <p className="muted">The file is checked first. Nothing changes until you confirm.</p>
        <button onClick={() => file.current?.click()}><HardDriveUpload size={16} /> Choose backup file</button>
        <input hidden ref={file} type="file" accept=".json,application/json" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await pick(f); }} />
        {problems.length > 0 && <div className="banner error" role="alert"><strong>This file can't be restored:</strong><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul><p>Your current data was not changed.</p></div>}
        {pending && (
          <div className="restore-confirm">
            <p><strong>{pending.name}</strong>, created {new Date(pending.backup.createdAt).toLocaleString()} (app {pending.backup.appVersion})</p>
            <table className="compare">
              <thead><tr><th /><th>On this device now</th><th>In backup</th></tr></thead>
              <tbody>{Object.keys(LABELS).map(k => <tr key={k}><td>{LABELS[k]}</td><td>{pending.current[k] ?? 0}</td><td>{pending.summary[k] ?? 0}</td></tr>)}</tbody>
            </table>
            <div className="banner error"><AlertTriangle size={18} /><p><strong>Restoring replaces ALL data on this device</strong> with the backup. Anything added since that backup will be lost unless you download a backup of the current data first.</p></div>
            <div className="btn-row"><button onClick={() => void exportNow()}><HardDriveDownload size={16} /> First, back up current data</button></div>
            <label className="agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I understand this replaces everything on this device.</label>
            <div className="btn-row">
              <button className="danger" disabled={!agree} onClick={() => void doRestore()}>Replace data with this backup</button>
              <button onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3><ShieldCheck size={18} /> Protect browser storage</h3>
        <p className="muted">Browsers may clear website data when storage runs low. Asking for persistent storage makes that much less likely. (Installed apps usually get it automatically.)</p>
        <p>Status: <strong>{persisted === null ? 'unknown in this browser' : persisted ? 'Protected (persistent)' : 'Not protected'}</strong></p>
        {persisted === false && <button onClick={() => void navigator.storage.persist().then(ok => { setPersisted(ok); notify(ok ? 'Storage is now persistent.' : 'The browser declined. Installing the app usually allows it.', !ok); })}>Request persistent storage</button>}
      </section>
    </div>
  );
}
