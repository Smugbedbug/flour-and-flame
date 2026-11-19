// Launch checklist: one real run-through before sharing the order link widely.
// Most steps tick themselves by looking at your setup; a few you tick yourself.
import { Check, ChevronDown, ChevronUp, Rocket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { go, useApp } from '../app-context';
import { useLedger } from '../ledgerState';
import { getSheetConfig } from '../ledger';
import { APPS_SCRIPT_VERSION } from '../appsScript';
import { getHubConfig } from '../hub';
import { celebrate } from '../celebrate';

const KEY = 'ff-launch';
type Saved = { ticks: Record<string, boolean>; hidden?: boolean; celebrated?: boolean };
const load = (): Saved => { try { return { ticks: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ticks: {} }; } };

type Step = { id: string; title: string; how: string; done: boolean; auto: boolean; optional?: boolean; action?: { label: string; to: string } };

export function LaunchChecklist() {
  const { lastBackupAt } = useApp();
  const { bakery, cfg } = useLedger();
  const [st, setSt] = useState<Saved>(load);
  const [open, setOpen] = useState(true);
  const save = (s: Saved) => { setSt(s); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
  const tick = (id: string) => save({ ...st, ticks: { ...st.ticks, [id]: !st.ticks[id] } });
  const v = Number((getSheetConfig() as any).scriptVersion ?? 0);
  const onMenu = [...new Set(bakery.products.filter(p => p.active).flatMap(p => (p.kind === 'mixed' ? (p.options ?? []).map(o => o.recipeId) : [p.recipeId])))];
  const formOrders = bakery.orders.filter(o => o.source === 'form');

  const steps: Step[] = [
    { id: 'sheet', title: 'Bakery sheet connected', how: 'Orders and the freezer are shared through your Google Sheet.', done: !!cfg.url, auto: true, action: { label: 'Sheet settings', to: 'sheet' } },
    { id: 'script', title: `Google script updated to version ${APPS_SCRIPT_VERSION}`, how: 'Sheet settings → Copy the new script → paste & save → Deploy → Manage deployments → ✏️ → New version → Check again.', done: !!cfg.url && v >= APPS_SCRIPT_VERSION, auto: true, action: { label: 'Update the script', to: 'sheet' } },
    { id: 'menu', title: 'Menu has prices', how: 'At least one box on the menu with a price.', done: bakery.products.some(p => p.active && p.price > 0), auto: true, action: { label: 'Menu', to: 'orders/menu' } },
    { id: 'describe', title: 'Each flavour has a short description', how: 'Menu → tap a picture → “Short description”.', done: onMenu.length > 0 && onMenu.every(id => !!bakery.looks[id]?.blurb), auto: true, action: { label: 'Menu', to: 'orders/menu' } },
    { id: 'pictures', title: 'Realistic pictures uploaded', how: 'Menu → Pictures customers see → Create in ChatGPT → Upload. The drawings work fine until then.', done: onMenu.length > 0 && onMenu.every(id => !!bakery.looks[id]?.photo), auto: true, optional: true, action: { label: 'Pictures', to: 'orders/menu' } },
    { id: 'pickup', title: 'Pickup options added', how: 'e.g. Work (Fridays after 3), Mom & Dad’s.', done: bakery.pickups.some(p => p.active), auto: true, optional: true, action: { label: 'Pickup & form', to: 'orders/form' } },
    { id: 'payment', title: 'Payment checked', how: '“Cash at pickup” is fine for now. Add Venmo etc. whenever you set one up.', done: !!st.ticks.payment, auto: false, action: { label: 'Payment', to: 'orders/form' } },
    { id: 'testorder', title: 'Placed a real test order through the form', how: 'Open your customer link on your phone and order with your personal email (Testing mode OFF for this test).', done: formOrders.length > 0 || !!st.ticks.testorder, auto: false, action: { label: 'Customer link', to: 'orders/form' } },
    { id: 'emails', title: 'All four emails arrived', how: 'Confirm → Baked & ready → Picked up on the test order. Check your personal inbox (and spam): received, confirmed, ready, “How were they?”. Your business inbox gets the new-order alert.', done: !!st.ticks.emails, auto: false, action: { label: 'Orders', to: 'orders' } },
    { id: 'cleared', title: 'Test orders cleared', how: 'Orders → Clear orders… (bottom of the list).', done: !!st.ticks.cleared, auto: false, action: { label: 'Orders', to: 'orders' } },
    { id: 'testing', title: 'Testing mode is off', how: 'Orders → Pickup & form → Emails. Customers only get emails when it’s off.', done: !!cfg.url && !bakery.shop.emailsPaused, auto: true, action: { label: 'Emails', to: 'orders/form' } },
    { id: 'backup', title: 'Backed up', how: 'Automatic GitHub backup (PC) or a downloaded backup file.', done: !!getHubConfig().lastCloudBackupAt || !!lastBackupAt, auto: true, action: { label: 'Backup', to: 'backup' } },
    { id: 'cards', title: 'Order cards printed', how: '🖨 Order cards → Print 10 cards, tuck one in every box.', done: !!st.ticks.cards, auto: false, action: { label: 'Order cards', to: 'cards' } },
    { id: 'share', title: 'Link shared', how: 'Pickup & form → Copy link or Share. Send it to family, friends and coworkers.', done: !!st.ticks.share, auto: false, action: { label: 'Customer link', to: 'orders/form' } },
  ];
  const required = steps.filter(s => !s.optional);
  const doneCount = required.filter(s => s.done).length;
  const pct = Math.round((doneCount / required.length) * 100);
  const all = doneCount === required.length;
  // remember the test order once seen (clearing test orders afterwards shouldn't un-tick it)
  useEffect(() => { if (formOrders.length && !st.ticks.testorder) save({ ...st, ticks: { ...st.ticks, testorder: true } }); }, [formOrders.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (all && !st.celebrated) { const r = ring.current?.getBoundingClientRect(); celebrate(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined, 'big'); save({ ...st, celebrated: true }); }
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  if (st.hidden) return <div className="btn-row launch-show"><button className="small-btn" onClick={() => save({ ...st, hidden: false })}><Rocket size={14} /> Show launch checklist</button></div>;
  const next = steps.find(s => !s.done && !s.optional);
  return (
    <section className={'card launch' + (all ? ' ready' : '')}>
      <div className="launch-head">
        <div className="launch-ring" ref={ring} style={{ ['--p' as any]: pct }} aria-label={`${pct}% done`}><span>{all ? '🚀' : `${pct}%`}</span></div>
        <div className="launch-title">
          <h3><Rocket size={18} /> {all ? 'Ready to launch!' : 'Launch checklist'}</h3>
          <p className="small">{all ? 'Everything’s been tried for real. Share your link and start handing out boxes!' : <>{doneCount} of {required.length} done{next ? <> · Next: <b>{next.title}</b></> : null}</>}</p>
        </div>
        <button className="small-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
      </div>
      {open && (
        <>
          <ol className="launch-steps">
            {steps.map(s => (
              <li key={s.id} className={(s.done ? 'done' : '') + (s.optional ? ' optional' : '') + (next?.id === s.id ? ' next' : '')}>
                <button className="launch-check" disabled={s.auto} aria-pressed={s.done} aria-label={`${s.done ? 'Done' : 'Not done'}: ${s.title}`} title={s.auto ? 'Ticks itself when the app sees it’s done' : 'Tap when done'} onClick={() => tick(s.id)}>{s.done && <Check size={18} strokeWidth={3} />}</button>
                <div className="launch-body">
                  <strong>{s.title}{s.optional && <span className="pill small">optional</span>}{s.auto && <span className="auto-tag" title="Checked automatically">auto</span>}</strong>
                  {!s.done && <span className="muted small">{s.how}</span>}
                </div>
                {s.action && !s.done && <button className="small-btn" onClick={() => go(s.action!.to)}>{s.action.label}</button>}
              </li>
            ))}
          </ol>
          <p className="muted small">Steps marked “auto” tick themselves. Tap the circle for the others. {all && <button className="link" onClick={() => save({ ...st, hidden: true })}>Hide this checklist</button>}</p>
        </>
      )}
    </section>
  );
}
