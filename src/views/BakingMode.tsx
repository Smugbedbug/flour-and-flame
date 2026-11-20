import { recordProduction } from '../sharedProduction';
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Flame, Lightbulb, List, ListOrdered, Pause, Play, Plus, RotateCcw, Scale, Timer as TimerIcon, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { back, go, useApp } from '../app-context';
import { IngredientTiles } from '../components/IngredientTiles';
import { deleteSession, getSession, markUsed, saveSession, writeRecipe } from '../db';
import { addEvents } from '../ledger';
import { CostCard, useSwaps } from '../components/CostCard';
import { masterYieldFromRecord } from '../components/ProductionHistory';
import { costPerItem, effectiveRecipe, expectedItems, isPanRecipe, itemNoun, recipeCost } from '../costing';
import { findDurations, panFactor, scaleAmount, usesBrownButter } from '../logic';
import { butterGrams, formatAmount, isButter } from '../units';
import type { BakingSession, BakingTimer, PanSize, ProductionRecord, ProductionStorage, Recipe } from '../types';

// ---------- timer sound / vibration ----------
let audio: AudioContext | null = null;
function primeAudio() { try { audio ??= new (window.AudioContext || (window as any).webkitAudioContext)(); void audio.resume(); } catch { /* no audio */ } }
function alarm() {
  try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch { /* not supported */ }
  if (!audio) return;
  const t0 = audio.currentTime;
  for (let k = 0; k < 3; k++) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.0001, t0 + k * 0.5); g.gain.exponentialRampToValueAtTime(0.4, t0 + k * 0.5 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.5 + 0.35);
    o.start(t0 + k * 0.5); o.stop(t0 + k * 0.5 + 0.4);
  }
}
const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`; };
const newTimer = (label: string, minutes: number): BakingTimer => ({ id: crypto.randomUUID(), label, durationMs: minutes * 60000, endsAt: null, remainingMs: minutes * 60000, finished: false });

function freshSession(r: Recipe): BakingSession {
  const now = new Date().toISOString();
  return { recipeId: r.id, recipeVersion: r.version, factor: 1, checked: [], stepsDone: [], currentStep: 0, timers: [], startedAt: now, updatedAt: now };
}

// ---------- keep screen awake ----------
function useWakeLock(on: boolean) {
  const lock = useRef<any>(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  useEffect(() => {
    if (!on || !supported) return;
    let cancelled = false;
    const acquire = async () => { try { lock.current = await (navigator as any).wakeLock.request('screen'); } catch { /* denied */ } };
    void acquire();
    const vis = () => { if (document.visibilityState === 'visible' && !cancelled) void acquire(); };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', vis); try { lock.current?.release(); } catch { /* ignore */ } lock.current = null; };
  }, [on, supported]);
  return supported;
}

export function BakingMode({ id }: { id: string }) {
  const { recipes, catalog, run, setPrefs, refresh, notify } = useApp();
  const r = recipes.find(x => x.id === id);
  const [s, setS] = useState<BakingSession | null>(null);
  const [stepMode, setStepMode] = useState(false);
  const [awake, setAwake] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [openTip, setOpenTip] = useState<string | null>(null);
  const [ringing, setRinging] = useState<string[]>([]);
  const wakeSupported = useWakeLock(awake);
  const loaded = useRef(false);
  const [finishing, setFinishing] = useState(false);

  // load or create session
  useEffect(() => {
    if (!r) return;
    void run(async () => {
      const existing = await getSession(r.id);
      setS(existing ?? freshSession(r));
      loaded.current = true;
      setPrefs(await markUsed(r.id));
    });
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // persist every change (temporary session data only — never the master recipe)
  const update = useCallback((fn: (x: BakingSession) => BakingSession) => {
    setS(prev => { if (!prev) return prev; const next = fn(prev); void saveSession(next).catch(() => notify('Could not save baking progress on this device.', true)); return next; });
  }, [notify]);

  // tick timers
  const anyRunning = !!s?.timers.some(t => t.endsAt && !t.finished);
  useEffect(() => {
    if (!anyRunning) return;
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, [anyRunning]);
  useEffect(() => {
    if (!s) return;
    const done = s.timers.filter(t => t.endsAt && !t.finished && t.endsAt <= now);
    if (!done.length) return;
    update(x => ({ ...x, timers: x.timers.map(t => done.some(d => d.id === t.id) ? { ...t, finished: true, remainingMs: 0, endsAt: null } : t) }));
    setRinging(rg => [...rg, ...done.map(d => d.id)]);
    alarm();
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Flour and Flame timer', { body: done.map(d => d.label).join(', ') + ' done', icon: 'icon-192.png' }); } catch { /* ignore */ }
  }, [now, s, update]);

  const brown = useMemo(() => (r ? usesBrownButter(r) : false), [r]);
  const { swaps, onSwap } = useSwaps(r, s?.substitutions, subs => update(x => ({ ...x, substitutions: subs })));
  if (!r) return <div className="page"><p>Recipe not found.</p><button onClick={() => go('recipes')}>Library</button></div>;
  if (!s) return <div className="page"><p>Preparing baking session…</p></div>;

  const visible = effectiveRecipe(r, s.substitutions, catalog).ingredients;
  const progress = s.checked.filter(c => visible.some(i => i.id === c)).length;
  const stale = s.recipeVersion !== r.version;

  const toggle = (iid: string) => update(x => ({ ...x, checked: x.checked.includes(iid) ? x.checked.filter(c => c !== iid) : [...x.checked, iid] }));
  const toggleStep = (i: number) => update(x => ({ ...x, stepsDone: x.stepsDone.includes(i) ? x.stepsDone.filter(n => n !== i) : [...x.stepsDone, i] }));
  const addTimer = (label: string, minutes: number, start = true) => {
    primeAudio();
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
    const t = newTimer(label, minutes);
    if (start) { t.endsAt = Date.now() + t.durationMs; }
    update(x => ({ ...x, timers: [...x.timers, t] }));
    setNow(Date.now());
  };
  const timerAction = (tid: string, action: 'pause' | 'resume' | 'reset' | 'remove') => {
    primeAudio();
    setRinging(rg => rg.filter(x => x !== tid));
    update(x => ({ ...x, timers: action === 'remove' ? x.timers.filter(t => t.id !== tid) : x.timers.map(t => {
      if (t.id !== tid) return t;
      if (action === 'pause') return { ...t, remainingMs: Math.max(0, (t.endsAt ?? Date.now()) - Date.now()), endsAt: null };
      if (action === 'resume') return { ...t, endsAt: Date.now() + t.remainingMs, finished: false };
      return { ...t, endsAt: null, remainingMs: t.durationMs, finished: false };
    }) }));
    setNow(Date.now());
  };
  const finish = () => setFinishing(true);

  const step = Math.min(s.currentStep, Math.max(0, r.steps.length - 1));
  const renderStepExtras = (i: number) => (
    <>
      {findDurations(r.steps[i]).map(d => (
        <button key={d.label} className="timer-suggest" onClick={() => addTimer(`Step ${i + 1}: ${d.label}`, d.minutes)}>
          <TimerIcon size={14} /> Start {d.minutes} min{d.maxMinutes !== d.minutes ? ` (check early; up to ${d.maxMinutes})` : ''}
        </button>
      ))}
      {(r.tips ?? []).filter(t => t.step === i).map(t => (
        <span key={t.id} className="tip">
          <button className="tip-btn" aria-expanded={openTip === t.id} onClick={() => setOpenTip(openTip === t.id ? null : t.id)}><Lightbulb size={14} /> {t.title || 'Tip'}</button>
          {openTip === t.id && <span className="tip-text">{t.text}</span>}
        </span>
      ))}
    </>
  );

  return (
    <div className="page bake">
      <div className="bake-bar">
        <button className="icon-btn" aria-label="Back" onClick={() => back('recipe/' + r.id)}><ChevronLeft size={20} /></button>
        <div className="bake-title"><strong>{r.title}</strong><span>{s.factor}× · {progress}/{visible.length} measured</span></div>
        <button className={'icon-btn' + (stepMode ? ' on' : '')} aria-pressed={stepMode} aria-label={stepMode ? 'Show full recipe' : 'Step-by-step mode'} title={stepMode ? 'Full recipe' : 'Step by step'} onClick={() => setStepMode(!stepMode)}>{stepMode ? <List size={20} /> : <ListOrdered size={20} />}</button>
        {wakeSupported && <button className={'icon-btn' + (awake ? ' on' : '')} aria-pressed={awake} aria-label="Keep screen awake" title="Keep screen awake" onClick={() => setAwake(!awake)}>{awake ? <Eye size={20} /> : <EyeOff size={20} />}</button>}
      </div>

      {stale && (
        <div className="banner warn">
          <div><strong>This recipe was edited after this session started.</strong><p>Session was for version {s.recipeVersion}; the recipe is now version {r.version}.</p></div>
          <button onClick={() => update(x => ({ ...freshSession(r), timers: x.timers, factor: x.factor }))}>Restart checklist</button>
        </div>
      )}

      <ScalePanel recipe={r} factor={s.factor} onChange={f => update(x => ({ ...x, factor: f }))} />
      {s.factor !== 1 && <p className="banner info small">Amounts are scaled to {s.factor}×. Method text and baking times are from the original recipe; times are estimates, so test for doneness.</p>}
      {brown && <BrownButterPanel recipe={r} factor={s.factor} value={s.brownButter} onChange={bb => update(x => ({ ...x, brownButter: bb }))} />}

      <div className="section-head">
        <h3>Ingredients</h3>
        <span className="muted">{progress} of {visible.length} measured</span>
        {progress > 0 && <button className="small-btn" onClick={() => update(x => ({ ...x, checked: [] }))}><RotateCcw size={14} /> Reset</button>}
      </div>
      <div className="progress" aria-hidden><span style={{ width: `${visible.length ? (progress / visible.length) * 100 : 0}%` }} /></div>
      {isPanRecipe(r) && <PiecesPanel recipe={r} value={s.piecesPerPan} onChange={n => update(x => ({ ...x, piecesPerPan: n }))} />}
      <IngredientTiles ingredients={visible} factor={s.factor} checked={s.checked} onToggle={toggle} large swaps={swaps} onSwap={onSwap} />
      {s.substitutions && Object.keys(s.substitutions).length > 0 && <p className="muted small">Swaps apply to this bake only; the master recipe is unchanged.</p>}
      <details className="cost-details card">
        <summary>Cost for this bake</summary>
        <CostCard recipe={r} factor={s.factor} substitutions={s.substitutions} piecesPerPan={s.piecesPerPan} title="" />
      </details>

      <h3>Method</h3>
      {stepMode && r.steps.length > 0 ? (
        <div className="step-card">
          <span className="eyebrow">Step {step + 1} of {r.steps.length}</span>
          <p className="step-big">{r.steps[step]}</p>
          <div className="step-extras">{renderStepExtras(step)}</div>
          <div className="step-nav">
            <button disabled={step === 0} onClick={() => update(x => ({ ...x, currentStep: step - 1 }))}><ChevronLeft size={18} /> Previous</button>
            <button className={s.stepsDone.includes(step) ? 'on' : ''} aria-pressed={s.stepsDone.includes(step)} onClick={() => toggleStep(step)}><Check size={18} /> {s.stepsDone.includes(step) ? 'Done' : 'Mark done'}</button>
            <button className="primary" disabled={step >= r.steps.length - 1} onClick={() => update(x => ({ ...x, stepsDone: x.stepsDone.includes(step) ? x.stepsDone : [...x.stepsDone, step], currentStep: step + 1 }))}>Next <ChevronRight size={18} /></button>
          </div>
        </div>
      ) : (
        <ol className="steps bake-steps">
          {r.steps.map((text, i) => (
            <li key={i} className={s.stepsDone.includes(i) ? 'done' : ''}>
              <button className="step-check" aria-pressed={s.stepsDone.includes(i)} aria-label={`Step ${i + 1} done`} onClick={() => toggleStep(i)}>{s.stepsDone.includes(i) && <Check size={16} strokeWidth={3} />}</button>
              <div><span className="step-text">{text}</span><div className="step-extras">{renderStepExtras(i)}</div></div>
            </li>
          ))}
        </ol>
      )}
      {r.notes && <details className="card"><summary>Recipe notes</summary><p className="pre">{r.notes}</p></details>}
      {(r.tips ?? []).some(t => t.step === undefined) && <details className="card"><summary><Lightbulb size={15} /> Baking tips</summary>{r.tips!.filter(t => t.step === undefined).map(t => <p key={t.id}><strong>{t.title}</strong> {t.text}</p>)}</details>}

      {s.timers.some(t => t.endsAt || ringing.includes(t.id)) && (
        <div className="timer-strip" role="region" aria-label="Running timers">
          {s.timers.filter(t => t.endsAt || ringing.includes(t.id)).map(t => (
            <button key={t.id} className={'strip-timer' + (ringing.includes(t.id) ? ' ringing' : '')} onClick={() => ringing.includes(t.id) ? timerAction(t.id, 'reset') : document.getElementById('timers')?.scrollIntoView({ behavior: 'smooth' })}>
              <TimerIcon size={15} /><b>{t.finished ? 'Done' : fmt((t.endsAt ?? now) - now)}</b><span>{ringing.includes(t.id) ? 'Tap to stop' : t.label}</span>
            </button>
          ))}
        </div>
      )}
      <TimerDock timers={s.timers} now={now} ringing={ringing} onAction={timerAction} onAdd={addTimer} />
      <div className="finish-row"><button className="primary" onClick={finish}><Flame size={16} /> Finish baking session</button></div>
      {finishing && <CompleteDialog recipe={r} session={s} onCancel={() => setFinishing(false)} onDone={async (rec, masterChange, toFreezer) => {
        await run(async () => {
          if (rec) await recordProduction(rec);
          if (rec && toFreezer && rec.storage === 'frozen-dough') await addEvents([{ type: 'freezer.add', batchId: rec.id, recipeId: rec.recipeId, recipeTitle: rec.recipeTitle, count: rec.actualQuantity, frozenOn: rec.date, ...(rec.portionWeightG ? { portionWeightG: rec.portionWeightG } : {}), productionId: rec.id } as any]);
          if (masterChange) { const cur = recipes.find(x => x.id === r.id)!; await writeRecipe({ ...cur, ...masterChange }, cur.version); }
          await deleteSession(r.id); await refresh();
          notify(rec ? `Recorded ${rec.actualQuantity} ${rec.unitLabel}${toFreezer && rec.storage === 'frozen-dough' ? ' and added them to The Freezer' : ''}${masterChange ? '; master recipe updated' : ''}.` : 'Baking session finished.');
          go('recipe/' + r.id);
        });
      }} />}
    </div>
  );
}

// ---------- scaling ----------
function ScalePanel({ recipe, factor, onChange }: { recipe: Recipe; factor: number; onChange: (f: number) => void }) {
  const [custom, setCustom] = useState('');
  const [target, setTarget] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const countable = !/batch|pan|sheet|loaf/i.test(recipe.yieldUnit);
  const apply = (f: number) => { if (Number.isFinite(f) && f > 0 && f <= 50) onChange(Math.round(f * 1000) / 1000); };
  return (
    <details className="card scale-panel">
      <summary><Scale size={16} /> Scale: <strong>{factor}×</strong> <span className="muted">(temporary, original unchanged)</span></summary>
      <div className="presets">
        {[0.5, 1, 1.5, 2].map(f => <button key={f} className={factor === f ? 'on' : ''} aria-pressed={factor === f} onClick={() => apply(f)}>{f}×</button>)}
        <form className="inline" onSubmit={e => { e.preventDefault(); apply(Number(custom)); }}>
          <input aria-label="Custom multiplier" inputMode="decimal" placeholder="Custom ×" value={custom} onChange={e => setCustom(e.target.value)} />
          <button type="submit">Apply</button>
        </form>
      </div>
      <p className="muted small">Reference yield: {recipe.yieldAmount} {recipe.yieldUnit}{factor !== 1 ? ` → about ${scaleAmount(recipe.yieldAmount, factor)} at ${factor}×` : ''}.</p>
      {countable && (
        <form className="inline" onSubmit={e => { e.preventDefault(); apply(Number(target) / recipe.yieldAmount); }}>
          <label>Make <input aria-label="Target count" inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} placeholder={String(recipe.yieldAmount)} /> {recipe.yieldUnit.split(' ')[0]}</label>
          <button type="submit">Scale to count</button>
        </form>
      )}
      {recipe.portionWeightG && countable && (
        <form className="inline" onSubmit={e => { e.preventDefault(); apply((Number(target || recipe.yieldAmount) * Number(targetWeight)) / (recipe.yieldAmount * recipe.portionWeightG!)); }}>
          <label>at <input aria-label="Target portion weight" inputMode="decimal" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} placeholder={String(recipe.portionWeightG)} /> g each</label>
          <button type="submit">Scale by portion weight</button>
        </form>
      )}
      <PanCalculator recipe={recipe} onApply={apply} />
    </details>
  );
}

function PanCalculator({ recipe, onApply }: { recipe: Recipe; onApply: (f: number) => void }) {
  const ref = recipe.panSize;
  const [from, setFrom] = useState<PanSize>(ref ?? { shape: 'rect', widthIn: 9, lengthIn: 9 });
  const [to, setTo] = useState<PanSize>({ shape: 'rect', widthIn: 8, lengthIn: 8 });
  const [thick, setThick] = useState('100');
  let factor: number | null = null;
  try { factor = panFactor(from as any, to as any, Number(thick) / 100); } catch { factor = null; }
  const PanInput = ({ p, set, label }: { p: PanSize; set: (p: PanSize) => void; label: string }) => (
    <span className="pan-input">
      <select aria-label={`${label} shape`} value={p.shape} onChange={e => set(e.target.value === 'round' ? { shape: 'round', diameterIn: 9 } : { shape: 'rect', widthIn: 9, lengthIn: 9 })}><option value="rect">Rect</option><option value="round">Round</option></select>
      {p.shape === 'rect'
        ? <><input aria-label={`${label} width`} inputMode="decimal" value={p.widthIn} onChange={e => set({ ...p, widthIn: Number(e.target.value) })} />×<input aria-label={`${label} length`} inputMode="decimal" value={p.lengthIn} onChange={e => set({ ...p, lengthIn: Number(e.target.value) })} /> in</>
        : <><input aria-label={`${label} diameter`} inputMode="decimal" value={p.diameterIn} onChange={e => set({ ...p, diameterIn: Number(e.target.value) })} /> in ⌀</>}
    </span>
  );
  return (
    <div className="pan-calc">
      <h4>Pan calculator</h4>
      {!ref && <p className="muted small">This recipe has no recorded pan size. Enter the pan you know it was made in; nothing is assumed.</p>}
      <div className="pan-rows">
        <label>From {PanInput({ p: from, set: setFrom, label: 'From pan' })}</label>
        <label>To {PanInput({ p: to, set: setTo, label: 'To pan' })}</label>
        <label>Thickness <input aria-label="Thickness percent" inputMode="decimal" value={thick} onChange={e => setThick(e.target.value)} /> % of original</label>
      </div>
      {factor !== null && Number.isFinite(factor) && (
        <p className="pan-result">New pan ≈ <strong>{(factor * 100).toFixed(1)}%</strong> of the original batch <button onClick={() => onApply(factor!)}>Use {Math.round(factor * 1000) / 1000}×</button></p>
      )}
      <p className="muted small">Baking time changes with depth and pan material. Treat the original time as a starting point and test early.</p>
    </div>
  );
}

// ---------- brown butter ----------
function BrownButterPanel({ recipe, factor, value, onChange }: { recipe: Recipe; factor: number; value?: { startG?: number; endG?: number }; onChange: (v: { startG?: number; endG?: number }) => void }) {
  const butter = recipe.ingredients.find(i => isButter(i.name));
  const expected = butter ? butterGrams(butter.amount * factor, butter.unit) : null;
  const start = value?.startG ?? (expected ? Math.round(expected) : undefined);
  const lost = start && value?.endG ? start - value.endG : null;
  const adjust = recipe.ingredients.filter(i => /butter adjust|moisture/i.test(i.section ?? ''));
  return (
    <details className="card brown">
      <summary><Flame size={16} /> Brown butter record{lost !== null ? `: lost ${Math.round(lost)} g (${((lost / start!) * 100).toFixed(1)}%)` : ''}</summary>
      <div className="inline">
        <label>Before browning <input aria-label="Butter weight before browning" inputMode="decimal" value={start ?? ''} onChange={e => onChange({ ...value, startG: e.target.value === '' ? undefined : Number(e.target.value) })} /> g</label>
        <label>After browning <input aria-label="Butter weight after browning" inputMode="decimal" value={value?.endG ?? ''} onChange={e => onChange({ ...value, endG: e.target.value === '' ? undefined : Number(e.target.value) })} /> g</label>
      </div>
      {lost !== null && lost >= 0 && <p>Moisture lost: <strong>{Math.round(lost)} g</strong> ({((lost / start!) * 100).toFixed(1)}% of the starting weight).</p>}
      {adjust.length > 0
        ? <p className="muted small">This recipe already specifies its own adjustment: {adjust.map(i => `${i.name} ${formatAmount(i.amount * factor, i.unit)}`).join(', ')}. Follow the recipe; the app does not substitute anything automatically.</p>
        : <p className="muted small">This recipe records no replacement for lost moisture, so none is suggested. If you add cream to make up weight, note that heavy cream is not equivalent to the lost water; it adds fat and changes the balance. Any permanent change must be saved by editing the recipe.</p>}
    </details>
  );
}

// ---------- timers ----------
function TimerDock({ timers, now, ringing, onAction, onAdd }: { timers: BakingTimer[]; now: number; ringing: string[]; onAction: (id: string, a: 'pause' | 'resume' | 'reset' | 'remove') => void; onAdd: (label: string, minutes: number) => void }) {
  const [label, setLabel] = useState('');
  const [mins, setMins] = useState('');
  return (
    <section className="card timers" id="timers" aria-label="Timers">
      <h3><TimerIcon size={18} /> Timers</h3>
      {timers.map(t => {
        const left = t.endsAt ? t.endsAt - now : t.remainingMs;
        return (
          <div key={t.id} className={'timer' + (t.finished ? ' finished' : '') + (ringing.includes(t.id) ? ' ringing' : '')} role={ringing.includes(t.id) ? 'alert' : undefined}>
            <span className="timer-time">{t.finished ? 'Done' : fmt(left)}</span>
            <span className="timer-label">{t.label}</span>
            <span className="btn-row">
              {!t.finished && (t.endsAt ? <button aria-label="Pause" onClick={() => onAction(t.id, 'pause')}><Pause size={16} /></button> : <button aria-label="Start" onClick={() => onAction(t.id, 'resume')}><Play size={16} /></button>)}
              <button aria-label="Reset" onClick={() => onAction(t.id, 'reset')}><RotateCcw size={16} /></button>
              <button aria-label="Remove timer" onClick={() => onAction(t.id, 'remove')}><X size={16} /></button>
            </span>
          </div>
        );
      })}
      <form className="inline add-timer" onSubmit={e => { e.preventDefault(); const m = Number(mins); if (m > 0) { onAdd(label.trim() || `${m} min timer`, m); setLabel(''); setMins(''); } }}>
        <input aria-label="Timer label" placeholder="Label (optional)" value={label} onChange={e => setLabel(e.target.value)} />
        <input aria-label="Minutes" inputMode="decimal" placeholder="Min" value={mins} onChange={e => setMins(e.target.value)} />
        <button type="submit"><Plus size={16} /> Add timer</button>
      </form>
      <p className="muted small">Timers keep counting if you leave this screen or reload. On phones, the alarm sounds only while the app is open; turn on “keep screen awake” (eye icon) for long bakes.</p>
    </section>
  );
}

// ---------- pieces per pan (session only) ----------
function PiecesPanel({ recipe, value, onChange }: { recipe: Recipe; value?: number; onChange: (n: number | undefined) => void }) {
  const current = value ?? recipe.piecesPerPan;
  const [custom, setCustom] = useState('');
  return (
    <div className="card pieces-panel">
      <strong>Cut each pan into</strong>
      <div className="presets">
        {[9, 12, 16, 24].map(n => <button key={n} className={current === n ? 'on' : ''} aria-pressed={current === n} onClick={() => onChange(n === recipe.piecesPerPan ? undefined : n)}>{n}</button>)}
        <form className="inline" onSubmit={e => { e.preventDefault(); const n = Math.round(Number(custom)); if (n > 0 && n < 500) { onChange(n === recipe.piecesPerPan ? undefined : n); setCustom(''); } }}>
          <input aria-label="Custom pieces per pan" inputMode="numeric" placeholder="Other" value={custom} onChange={e => setCustom(e.target.value)} />
          <button type="submit">Set</button>
        </form>
      </div>
      <p className="muted small">{current ? `${current} pieces per pan` : 'Not set'}{recipe.piecesPerPan ? ` · master default ${recipe.piecesPerPan}` : ' · the master recipe has no default yet'}{value !== undefined && value !== recipe.piecesPerPan ? ' (this bake only)' : ''}</p>
    </div>
  );
}

// ---------- finishing: record what was actually produced ----------
const QUESTION: Record<string, [string, string]> = {
  Cookies: ['How many dough balls did this batch make?', 'dough balls'],
  Brownies: ['How many brownie pieces did this pan produce?', 'brownie pieces'],
  'Crispy Treats': ['How many squares did this batch produce?', 'squares'],
  'Cupcakes': ['How many cupcakes did this batch make?', 'cupcakes'],
  Other: ['How many pieces did this batch make?', 'pieces'],
};
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function CompleteDialog({ recipe, session, onCancel, onDone }: { recipe: Recipe; session: BakingSession; onCancel: () => void; onDone: (rec: ProductionRecord | null, masterChange: Partial<Recipe> | null, toFreezer: boolean) => Promise<void> }) {
  const { catalog } = useApp();
  const pan = isPanRecipe(recipe);
  const [question, unitLabel] = QUESTION[recipe.category] ?? QUESTION.Other;
  const pieces = session.piecesPerPan ?? recipe.piecesPerPan;
  const expected = expectedItems(recipe, session.factor, session.piecesPerPan);
  const [actual, setActual] = useState(expected !== null ? String(Math.round(expected)) : '');
  const [date, setDate] = useState(localDate());
  const [storage, setStorage] = useState<ProductionStorage>(recipe.category === 'Cookies' ? 'frozen-dough' : 'baked');
  const [portion, setPortion] = useState(recipe.portionWeightG ? String(recipe.portionWeightG) : '');
  const [notes, setNotes] = useState('');
  const [updateMaster, setUpdateMaster] = useState(false);
  const [toFreezer, setToFreezer] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = Number(actual);
  const valid = Number.isFinite(n) && n > 0 && n < 10000 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const panCount = pan ? Math.round(recipe.yieldAmount * session.factor * 100) / 100 : undefined;

  const record = (): ProductionRecord => {
    const cost = recipeCost(recipe, catalog, { factor: session.factor, substitutions: session.substitutions });
    return {
      id: crypto.randomUUID(), recipeId: recipe.id, recipeVersion: recipe.version, recipeTitle: recipe.title, category: recipe.category,
      date, factor: session.factor, expectedQuantity: expected, actualQuantity: n, unitLabel,
      ...(pan ? { panCount, piecesPerPan: panCount ? Math.round(n / panCount) : pieces } : {}),
      ...(recipe.panSize ? { panSize: recipe.panSize } : {}),
      ...(Number(portion) > 0 ? { portionWeightG: Number(portion) } : {}),
      storage,
      ...(session.substitutions && Object.keys(session.substitutions).length ? { substitutions: session.substitutions } : {}),
      costSnapshot: { complete: cost.complete, batchTotal: cost.total, perItem: costPerItem(cost, n), recordedAt: new Date().toISOString() },
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
  };
  const change = valid ? masterYieldFromRecord(recipe, record()) : null;
  const changeText = change?.piecesPerPan ? `${change.piecesPerPan} pieces per pan` : change?.yieldAmount ? `${change.yieldAmount} ${recipe.yieldUnit} per batch` : '';

  const submit = async (save: boolean) => { setBusy(true); await onDone(save ? record() : null, save && updateMaster && change ? change : null, toFreezer); setBusy(false); };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="finish-title">
      <div className="modal">
        <h3 id="finish-title">Finish baking</h3>
        <label className="field">{question}
          <input autoFocus inputMode="numeric" value={actual} onChange={e => setActual(e.target.value)} aria-label="Actual quantity produced" />
        </label>
        <p className="muted small">{expected !== null ? `Expected about ${expected} ${itemNoun(recipe)} at ${session.factor}×${pan && pieces ? ` (${pieces} per pan)` : ''}.` : 'No expected yield is recorded for this recipe.'}</p>
        <div className="form-grid">
          <label className="field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="field">What happened to them?<select value={storage} onChange={e => setStorage(e.target.value as ProductionStorage)}>
            <option value="baked">Baked</option><option value="frozen-dough">Frozen dough</option><option value="refrigerated-dough">Refrigerated dough</option><option value="other">Other</option>
          </select></label>
          <label className="field">Portion size (g, optional)<input inputMode="decimal" value={portion} onChange={e => setPortion(e.target.value)} /></label>
        </div>
        {storage === 'frozen-dough' && <label className="agree"><input type="checkbox" checked={toFreezer} onChange={e => setToFreezer(e.target.checked)} /> Add {Number(actual) > 0 ? actual : 'these'} dough balls to The Freezer</label>}
        <label className="field">Notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. dough was soft, chilled extra 10 min" /></label>
        {change && (
          <fieldset className="master-choice">
            <legend>Master recipe</legend>
            <label><input type="radio" checked={!updateMaster} onChange={() => setUpdateMaster(false)} /> Save this result for this bake only</label>
            <label><input type="radio" checked={updateMaster} onChange={() => setUpdateMaster(true)} /> Also update the master default to {changeText} (new version)</label>
          </fieldset>
        )}
        <div className="btn-row">
          <button className="primary" disabled={!valid || busy} onClick={() => void submit(true)}>Save &amp; finish</button>
          <button disabled={busy} onClick={() => { if (window.confirm('Finish without recording what this batch made?')) void submit(false); }}>Finish without recording</button>
          <button disabled={busy} onClick={onCancel}>Keep baking</button>
        </div>
      </div>
    </div>
  );
}
