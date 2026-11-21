// Test bakes on the recipe page: log a batch (oven, time, changes, yield, taste scores), add next-day scores,
// compare batches side by side, and copy the results for the Head Baker.
import { ClipboardCopy, Columns3, NotebookPen, Pencil, Star, Trash2, Utensils } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';
import { CHECK_WHEN, compareRows, DECISIONS, headBakerText, KITCHEN, latestScores, logsFor, newBakeLog, SCORE_HINTS, SCORE_KEYS, SCORE_LABELS, type BakeLog, type Scores, type TasteCheck } from '../bakeLog';
import type { Recipe } from '../types';

export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PREFILL = 'ff-bakelog-prefill';
/** Finish baking hands its numbers to the form through this (opened on the recipe page). */
export function setBakeLogPrefill(p: Partial<BakeLog> & { recipeId: string }) { try { sessionStorage.setItem(PREFILL, JSON.stringify(p)); } catch { /* private mode */ } }
function takePrefill(recipeId: string): Partial<BakeLog> | null {
  try { const raw = sessionStorage.getItem(PREFILL); if (!raw) return null; const p = JSON.parse(raw); if (p.recipeId !== recipeId) return null; sessionStorage.removeItem(PREFILL); return p; } catch { return null; }
}
const save = (log: BakeLog) => addEvents([{ type: 'bakelog.save', log: { ...log, updatedAt: new Date().toISOString() } } as any]);
const num = (v: string) => v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
const RESULT_CHIPS = ['Spread a lot', 'Spread just right', 'Barely spread', 'Domed nicely', 'Sunk in the middle', 'Pale', 'Golden', 'Dark edges', 'Underbaked center', 'Dry'];

export function BakeLogSection({ recipe }: { recipe: Recipe }) {
  const { notify } = useApp();
  const { bakery } = useLedger();
  const logs = useMemo(() => logsFor(bakery.bakeLogs, recipe.id), [bakery.bakeLogs, recipe.id]);
  const [form, setForm] = useState<BakeLog | null>(null);
  const [taste, setTaste] = useState<BakeLog | null>(null);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  useEffect(() => { const p = takePrefill(recipe.id); if (p) setForm(newBakeLog(recipe, todayLocal(), p)); }, [recipe.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = logs.filter(l => (picked ?? logs.slice(0, 4).map(x => x.id)).includes(l.id));
  const experimental = recipe.status === 'Experimental' || recipe.status === 'Testing';

  const copy = async () => {
    const text = headBakerText(recipe, chosen.length ? chosen : logs);
    try { await navigator.clipboard.writeText(text); notify('Copied. Paste it into your Head Baker chat.'); }
    catch { window.prompt('Copy this for the Head Baker:', text); }
  };
  const remove = (l: BakeLog) => { if (window.confirm(`Delete the test bake from ${l.date}?`)) void addEvents([{ type: 'bakelog.delete', logId: l.id } as any]).then(() => notify('Test bake deleted.')); };

  return (
    <section className={'card bakelog' + (experimental ? ' experimental' : '')} id="test-bakes">
      <div className="bakelog-head">
        <h3><NotebookPen size={18} /> Test bakes {logs.length > 0 && <span className="muted small">({logs.length})</span>}</h3>
        <p className="muted small">Write down what you did and how they turned out, then compare batches.</p>
      </div>
      <div className="btn-row">
        <button className="primary" onClick={() => setForm(newBakeLog(recipe, todayLocal()))}><NotebookPen size={16} /> Log a test bake</button>
        {logs.length > 1 && <button className={comparing ? 'on' : ''} onClick={() => setComparing(!comparing)}><Columns3 size={16} /> Compare</button>}
        {logs.length > 0 && <button onClick={() => void copy()}><ClipboardCopy size={16} /> Copy for Head Baker</button>}
      </div>
      {logs.length === 0 && <p className="muted small">No test bakes yet.{experimental ? ' This recipe is still ' + recipe.status.toLowerCase() + ', so logging each batch is the fastest way to dial it in.' : ''}</p>}

      {logs.map(l => {
        const s = latestScores(l);
        const later = CHECK_WHEN.find(w => !l.checks.some(c => c.when === w) && w !== 'Bake day');
        return (
          <div key={l.id} className="bakelog-row">
            {comparing && <input type="checkbox" aria-label={`Compare bake from ${l.date}`} checked={chosen.some(c => c.id === l.id)} onChange={e => setPicked(e.target.checked ? [...chosen.map(c => c.id), l.id] : chosen.map(c => c.id).filter(id => id !== l.id))} />}
            <div className="bakelog-main">
              <strong>{l.date}</strong> <span className="muted small">v{l.recipeVersion}</span>
              {s.overall && <span className="bakelog-score" aria-label={`Overall ${s.overall} of 5`}><Star size={13} fill="currentColor" /> {s.overall}</span>}
              <div className="muted small">{[l.goal && `Testing: ${l.goal}`, l.ovenTempF && `${l.ovenTempF}°F`, l.bakeMinutes && `${l.bakeMinutes} min`, l.yieldCount && `${l.yieldCount} ${l.yieldUnit ?? ''}`.trim(), l.decision && DECISIONS[l.decision]].filter(Boolean).join(' · ') || 'No details yet'}</div>
            </div>
            <div className="btn-row tight">
              {later && <button className="small-btn" onClick={() => setTaste(l)}><Utensils size={14} /> {later} scores</button>}
              <button className="small-btn" aria-label={`Edit bake from ${l.date}`} onClick={() => setForm(l)}><Pencil size={14} /> Edit</button>
              <button className="small-btn" aria-label={`Delete bake from ${l.date}`} onClick={() => remove(l)}><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}

      {comparing && chosen.length > 0 && <CompareTable logs={[...chosen].reverse()} />}
      {form && <BakeLogForm recipe={recipe} initial={form} isNew={!logs.some(l => l.id === form.id)} onClose={() => setForm(null)} />}
      {taste && <TasteDialog log={taste} onClose={() => setTaste(null)} />}
    </section>
  );
}

function CompareTable({ logs }: { logs: BakeLog[] }) {
  const rows = compareRows(logs);
  return (
    <div className="compare-wrap" role="region" aria-label="Test bakes side by side" tabIndex={0}>
      <table className="compare">
        <thead><tr><th scope="col">Oldest → newest</th>{logs.map((l, i) => <th key={l.id} scope="col">Bake {i + 1}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.label} className={r.differs ? 'differs' : ''}><th scope="row">{r.label}</th>{r.cells.map((c, i) => <td key={i}>{c || '—'}</td>)}</tr>)}</tbody>
      </table>
      <p className="muted small">Highlighted rows are where the bakes differ.</p>
    </div>
  );
}

function ScorePicker({ scores, onChange }: { scores: Scores; onChange: (s: Scores) => void }) {
  return (
    <div className="score-grid">
      {SCORE_KEYS.map(k => (
        <div key={k} className="score-row" role="group" aria-label={SCORE_LABELS[k]}>
          <span className="score-label">{SCORE_LABELS[k]}<span className="muted small">{SCORE_HINTS[k]}</span></span>
          <span className="score-btns">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={scores[k] === n ? 'on' : ''} aria-pressed={scores[k] === n} onClick={() => onChange({ ...scores, [k]: scores[k] === n ? undefined : n })}>{n}</button>)}</span>
        </div>
      ))}
    </div>
  );
}

function BakeLogForm({ recipe, initial, isNew, onClose }: { recipe: Recipe; initial: BakeLog; isNew: boolean; onClose: () => void }) {
  const { notify } = useApp();
  const [l, setL] = useState<BakeLog>(initial);
  const day0 = l.checks.find(c => c.when === 'Bake day') ?? { when: 'Bake day', at: new Date().toISOString(), scores: {} };
  const setDay0 = (c: TasteCheck) => setL({ ...l, checks: [c, ...l.checks.filter(x => x.when !== 'Bake day')] });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof BakeLog>(k: K, v: BakeLog[K]) => setL(x => ({ ...x, [k]: v }));
  const text = (k: 'goal' | 'changes' | 'pan' | 'result' | 'next' | 'notes' | 'yieldUnit') => ({ value: (l[k] as string) ?? '', onChange: (e: { target: { value: string } }) => set(k, e.target.value || undefined) });
  const numField = (k: 'factor' | 'handsOnMinutes' | 'ovenTempF' | 'bakeMinutes' | 'portionG' | 'restHours' | 'doughTempF' | 'yieldCount') => ({ inputMode: 'decimal' as const, value: l[k] ?? '', onChange: (e: { target: { value: string } }) => set(k, num(e.target.value)) });
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(l.date);
  const submit = async () => {
    setBusy(true);
    const clean = { ...l, checks: Object.values(day0.scores).some(Boolean) || day0.notes ? l.checks : l.checks.filter(c => c.when !== 'Bake day') };
    await save(clean); setBusy(false); notify(isNew ? 'Test bake saved. Add next-day scores tomorrow.' : 'Test bake updated.'); onClose();
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="bl-title">
      <div className="modal bakelog-form">
        <div className="bl-top"><button onClick={onClose}>Cancel</button><h3 id="bl-title">{isNew ? 'Log a test bake' : 'Edit test bake'}: {recipe.title}</h3></div>

        <fieldset><legend>The batch</legend>
          <div className="form-grid">
            <label className="field">Date<input type="date" value={l.date} onChange={e => set('date', e.target.value)} /></label>
            <label className="field">Batch size (1 = as written)<input {...numField('factor')} /></label>
          </div>
          <label className="field">What are you testing? <span className="muted small">(one change per batch works best)</span><input {...text('goal')} placeholder="e.g. dark brown sugar instead of light" /></label>
          <label className="field">Changes you made to the recipe<textarea rows={2} {...text('changes')} placeholder="e.g. +10 g flour, swapped vanilla extract for paste, 1 tsp less salt" /></label>
        </fieldset>

        <fieldset><legend>Oven</legend>
          <div className="form-grid">
            <label className="field">Oven temp (°F)<input {...numField('ovenTempF')} /></label>
            <label className="field">Baked for (minutes)<input {...numField('bakeMinutes')} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={!!l.convection} onChange={e => set('convection', e.target.checked || undefined)} /> Convection / fan on</label>
          <span className="field-label">Rack</span>
          <div className="seg">{(['top', 'middle', 'bottom'] as const).map(r => <button key={r} type="button" className={l.rack === r ? 'on' : ''} onClick={() => set('rack', l.rack === r ? undefined : r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>
          <label className="field">Pan, sheet or liners<input {...text('pan')} placeholder="e.g. aluminum half sheet, parchment" /></label>
        </fieldset>

        <fieldset><legend>Prep</legend>
          <div className="form-grid">
            <label className="field">Hands-on time (minutes)<input {...numField('handsOnMinutes')} placeholder="mixing, scooping, frosting" /></label>
            <label className="field">Portion size (g)<input {...numField('portionG')} /></label>
            <label className="field">Rested / chilled (hours)<input {...numField('restHours')} /></label>
            <label className="field">Dough temp (°F, optional)<input {...numField('doughTempF')} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={!!l.fromFrozen} onChange={e => set('fromFrozen', e.target.checked || undefined)} /> Baked from frozen</label>
          <span className="field-label">Kitchen today</span>
          <div className="seg">{(Object.keys(KITCHEN) as (keyof typeof KITCHEN)[]).map(k => <button key={k} type="button" className={l.kitchen === k ? 'on' : ''} onClick={() => set('kitchen', l.kitchen === k ? undefined : k)}>{KITCHEN[k]}</button>)}</div>
        </fieldset>

        <fieldset><legend>How they came out</legend>
          <div className="form-grid">
            <label className="field">How many you got<input {...numField('yieldCount')} /></label>
            <label className="field">Of what<input {...text('yieldUnit')} placeholder="cookies, cupcakes, pieces" /></label>
          </div>
          <label className="field">Out of the oven<textarea rows={2} {...text('result')} placeholder="spread, rise, color, doneness" /></label>
          <div className="chip-row">{RESULT_CHIPS.map(c => <button key={c} type="button" className="chip" onClick={() => set('result', l.result ? (l.result.includes(c.toLowerCase()) ? l.result : `${l.result}, ${c.toLowerCase()}`) : c)}>{c}</button>)}</div>
        </fieldset>

        <fieldset><legend>Taste (bake day)</legend>
          <ScorePicker scores={day0.scores} onChange={s => setDay0({ ...day0, scores: s })} />
          <label className="field">Tasting notes<textarea rows={2} value={day0.notes ?? ''} onChange={e => setDay0({ ...day0, notes: e.target.value || undefined })} placeholder="e.g. caramel flavor faint, frosting a little gritty" /></label>
        </fieldset>

        <fieldset><legend>Your call</legend>
          <div className="chip-row">{(Object.keys(DECISIONS) as (keyof typeof DECISIONS)[]).map(d => <button key={d} type="button" className={'chip' + (l.decision === d ? ' on' : '')} aria-pressed={l.decision === d} onClick={() => set('decision', l.decision === d ? undefined : d)}>{DECISIONS[d]}</button>)}</div>
          <label className="field">Next thing to try<input {...text('next')} placeholder="e.g. bake 1 minute less" /></label>
          <label className="field">Other notes<textarea rows={2} {...text('notes')} /></label>
        </fieldset>

        <div className="btn-row"><button className="primary" disabled={!valid || busy} onClick={() => void submit()}>Save test bake</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

function TasteDialog({ log, onClose }: { log: BakeLog; onClose: () => void }) {
  const { notify } = useApp();
  const options = CHECK_WHEN.filter(w => !log.checks.some(c => c.when === w));
  const [when, setWhen] = useState<string>(options.find(w => w !== 'Bake day') ?? options[0] ?? 'Day 5');
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState('');
  const submit = async () => {
    await save({ ...log, checks: [...log.checks, { when, at: new Date().toISOString(), scores, ...(notes.trim() ? { notes: notes.trim() } : {}) }] });
    notify(`${when} scores saved.`); onClose();
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tc-title">
      <div className="modal bakelog-form">
        <div className="bl-top"><button onClick={onClose}>Cancel</button><h3 id="tc-title">Taste check: bake from {log.date}</h3></div>
        <p className="muted small">Taste one from the box you'd hand a customer. Shelf life shows up here.</p>
        <div className="seg">{options.map(w => <button key={w} type="button" className={when === w ? 'on' : ''} onClick={() => setWhen(w)}>{w}</button>)}</div>
        <ScorePicker scores={scores} onChange={setScores} />
        <label className="field">Notes<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. still soft, pretzels went chewy" /></label>
        <div className="btn-row"><button className="primary" disabled={!Object.values(scores).some(Boolean) && !notes.trim()} onClick={() => void submit()}>Save scores</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
