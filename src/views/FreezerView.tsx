import { CloudOff, Minus, Plus, RefreshCw, Settings2, Snowflake } from 'lucide-react';
import { useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { addEvents, syncLedger } from '../ledger';
import { todayLocal, weeksSince, type FreezerItem, type RemoveReason } from '../freezer';
import { useLedger } from '../ledgerState';

const QUALITY_KEY = 'ff-freezer-quality-weeks';
export const qualityWeeks = () => { try { return Number(localStorage.getItem(QUALITY_KEY)) || 12; } catch { return 12; } };
const REASONS: [RemoveReason, string][] = [['baked', 'Baked (for us / sale)'], ['order', 'Used for an order'], ['discarded', 'Discarded'], ['correction', 'Count correction'], ['other', 'Other']];

function ago(iso?: string) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString();
}

export function SheetStatus() {
  const { cfg, connected, pending } = useLedger();
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  if (!connected) return (
    <div className="banner info small sheet-status">
      <CloudOff size={16} /> Saved on this device only. <button className="link" onClick={() => go('sheet')}>Share with your other device</button>
    </div>
  );
  return (
    <div className={'sheet-status small ' + (cfg.lastError ? 'err' : '')}>
      <span>{cfg.lastError ? `⚠ ${cfg.lastError}` : pending ? `${pending} change${pending > 1 ? 's' : ''} waiting to share` : `Shared · synced ${ago(cfg.lastSyncAt)}`}</span>
      <button className="small-btn" disabled={busy} onClick={async () => { setBusy(true); try { const r = await syncLedger(); notify(r.sent || r.received ? `Synced: sent ${r.sent}, received ${r.received}.` : 'Already in sync.'); } catch (e) { notify(e instanceof Error ? e.message : 'Sync failed', true); } setBusy(false); }}><RefreshCw size={14} /> {busy ? 'Syncing…' : 'Sync now'}</button>
      <button className="small-btn" onClick={() => go('sheet')}><Settings2 size={14} /> Sheet settings</button>
    </div>
  );
}

export function FreezerView() {
  const { recipes, notify, run } = useApp();
  const { freezer, bakery } = useLedger();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<FreezerItem | null>(null);
  const weeks = qualityWeeks();
  const known = new Set(freezer.items.map(i => i.recipeId));

  return (
    <div className="page freezer">
      <div className="page-head">
        <h2><Snowflake size={24} /> The Freezer</h2>
        <button className="primary" onClick={() => setAdding(true)}><Plus size={16} /> Add dough balls</button>
      </div>
      <SheetStatus />
      <p className="stat-line"><strong>{freezer.total}</strong> dough balls in the freezer{(() => { const k = freezer.items.filter(i => i.total > 0).length; return k ? ` · ${k} kind${k > 1 ? 's' : ''}` : ''; })()}</p>
      {freezer.warnings.map(w => <p key={w} className="banner warn small">{w}</p>)}
      {bakery.plan.some(r => r.makeMore) && <p className="banner warn small"><b>Make more dough for orders:</b> {bakery.plan.filter(r => r.makeMore).map(r => `${r.makeMore} × ${r.recipeTitle}`).join(' · ')} <button className="link" onClick={() => go('orders/plan')}>Planning</button></p>}

      <div className="freezer-grid">
        {[...freezer.items, ...bakery.plan.filter(r => r.makeMore && !freezer.items.some(i => i.recipeId === r.recipeId)).map(r => ({ recipeId: r.recipeId, recipeTitle: r.recipeTitle, total: 0, batches: [], oldest: undefined }))].map(it => {
          const age = it.oldest ? weeksSince(it.oldest) : 0;
          const old = it.oldest && age >= weeks;
          return (
            <section key={it.recipeId} className={'card freezer-card' + (it.total === 0 && !bakery.plan.find(r => r.recipeId === it.recipeId)?.makeMore ? ' empty' : '') + (bakery.plan.find(r => r.recipeId === it.recipeId)?.makeMore ? ' short' : '')}>
              <div className="freezer-top">
                <div>
                  <strong className="freezer-title">{it.recipeTitle}</strong>
                  <span className="muted small">{it.total === 0 ? 'None left' : `Oldest frozen ${new Date(it.oldest! + 'T12:00:00').toLocaleDateString()} (${age} wk)`}</span>
                </div>
                <span className="freezer-count" aria-label={`${it.total} dough balls`}>{it.total}</span>
              </div>
              {(() => { const row = bakery.plan.find(r => r.recipeId === it.recipeId); if (!row || (!row.reserved && !row.pending)) return null; return (
                <p className={'small hold-line' + (row.makeMore ? ' warn-text' : '')}>
                  Held for orders: <b>{row.reserved}</b>{row.pending ? ` · requests: ${row.pending}` : ''} · {row.makeMore ? <b>make {row.makeMore} more</b> : `${Math.max(0, row.available)} free`}
                </p>); })()}
              {old && <p className="pill warn small">Use soon: older than your {weeks}-week quality guide</p>}
              {it.batches.length > 0 && (
                <details>
                  <summary className="small muted">{it.batches.length} batch{it.batches.length > 1 ? 'es' : ''}</summary>
                  <ul className="batch-list">
                    {it.batches.map(b => <li key={b.batchId}><span>{new Date(b.frozenOn + 'T12:00:00').toLocaleDateString()}</span><span>{b.remaining} of {b.added}{b.portionWeightG ? ` · ${b.portionWeightG} g` : ''}</span>{b.note && <em>{b.note}</em>}</li>)}
                  </ul>
                </details>
              )}
              <div className="btn-row">
                <button className="small-btn" disabled={it.total === 0} onClick={() => setRemoving(it)}><Minus size={14} /> Use / remove</button>
                <button className="small-btn" onClick={() => setAdding(true)}><Plus size={14} /> Add</button>
                {recipes.some(r => r.id === it.recipeId) && <button className="small-btn" onClick={() => go('recipe/' + it.recipeId)}>Recipe</button>}
              </div>
            </section>
          );
        })}
        {!freezer.items.length && <p className="muted">Nothing in the freezer yet. Add dough balls here, or choose “Frozen dough” when you finish a baking session.</p>}
      </div>
      <p className="muted small">The “use soon” guide is your own quality target ({weeks} weeks; change it below), not a food-safety date.</p>
      <label className="inline small">Quality guide: <input aria-label="Quality guide in weeks" inputMode="numeric" defaultValue={weeks} onBlur={e => { const n = Math.round(Number(e.target.value)); if (n > 0 && n < 104) { try { localStorage.setItem(QUALITY_KEY, String(n)); } catch { /* unavailable */ } notify(`Quality guide set to ${n} weeks.`); } }} /> weeks</label>

      {adding && <AddDialog recipes={recipes.filter(r => r.category === 'Cookies' || known.has(r.id))} allRecipes={recipes} onClose={() => setAdding(false)} onSave={async ev => { await run(async () => { await addEvents([ev]); notify(`Added ${ev.count} ${ev.recipeTitle} dough balls.`); setAdding(false); }); }} />}
      {removing && <RemoveDialog item={removing} onClose={() => setRemoving(null)} onSave={async ev => { await run(async () => { await addEvents([ev]); notify(`Removed ${ev.count} ${ev.recipeTitle}.`); setRemoving(null); }); }} />}
    </div>
  );
}

function Stepper({ value, onChange, max, label }: { value: number; onChange: (n: number) => void; max?: number; label: string }) {
  return (
    <span className="stepper">
      <button type="button" aria-label="Fewer" onClick={() => onChange(Math.max(1, value - 1))}><Minus size={18} /></button>
      <input aria-label={label} inputMode="numeric" value={value || ''} onChange={e => { const n = Math.round(Number(e.target.value)); onChange(Number.isFinite(n) ? Math.min(max ?? 9999, Math.max(0, n)) : 0); }} />
      <button type="button" aria-label="More" onClick={() => onChange(Math.min(max ?? 9999, value + 1))}><Plus size={18} /></button>
    </span>
  );
}

function AddDialog({ recipes, allRecipes, onClose, onSave }: { recipes: { id: string; title: string; portionWeightG?: number }[]; allRecipes: { id: string; title: string; portionWeightG?: number }[]; onClose: () => void; onSave: (ev: any) => Promise<void> }) {
  const list = useMemo(() => (recipes.length ? recipes : allRecipes), [recipes, allRecipes]);
  const [recipeId, setRecipeId] = useState(list[0]?.id ?? '');
  const r = allRecipes.find(x => x.id === recipeId);
  const [count, setCount] = useState(12);
  const [grams, setGrams] = useState(r?.portionWeightG ? String(r.portionWeightG) : '');
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const valid = !!r && count > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="modal">
        <h3 id="add-title"><Snowflake size={18} /> Add to The Freezer</h3>
        <label className="field">Recipe<select value={recipeId} onChange={e => { setRecipeId(e.target.value); const x = allRecipes.find(y => y.id === e.target.value); setGrams(x?.portionWeightG ? String(x.portionWeightG) : ''); }}>
          {allRecipes.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select></label>
        <label className="field">How many dough balls?<Stepper label="Number of dough balls" value={count} onChange={setCount} /></label>
        <div className="form-grid">
          <label className="field">Frozen on<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="field">Ball size (g, optional)<input inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} /></label>
        </div>
        <label className="field">Note (optional)<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. extra flaky salt" /></label>
        <div className="btn-row">
          <button className="primary" disabled={!valid} onClick={() => void onSave({ type: 'freezer.add', batchId: crypto.randomUUID(), recipeId, recipeTitle: r!.title, count, frozenOn: date, ...(Number(grams) > 0 ? { portionWeightG: Number(grams) } : {}), ...(note.trim() ? { note: note.trim() } : {}) })}>Add {count || ''} to freezer</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function RemoveDialog({ item, onClose, onSave }: { item: FreezerItem; onClose: () => void; onSave: (ev: any) => Promise<void> }) {
  const [count, setCount] = useState(Math.min(6, item.total));
  const [reason, setReason] = useState<RemoveReason>('baked');
  const [note, setNote] = useState('');
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rm-title">
      <div className="modal">
        <h3 id="rm-title">Use from The Freezer</h3>
        <p className="muted">{item.recipeTitle}: {item.total} in the freezer. Oldest dough is used first.</p>
        <label className="field">How many?<Stepper label="Number to remove" value={count} max={item.total} onChange={setCount} /></label>
        <label className="field">Why<select value={reason} onChange={e => setReason(e.target.value as RemoveReason)}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Note (optional)<input value={note} onChange={e => setNote(e.target.value)} /></label>
        <div className="btn-row">
          <button className="primary" disabled={!(count > 0 && count <= item.total)} onClick={() => void onSave({ type: 'freezer.remove', recipeId: item.recipeId, recipeTitle: item.recipeTitle, count, reason, ...(note.trim() ? { note: note.trim() } : {}) })}>Remove {count || ''}</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
