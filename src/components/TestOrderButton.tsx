// "🧪 Test order": sends pretend orders through the shared sheet so you can watch the alerts arrive.
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../app-context';
import { getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';
import { APPS_SCRIPT_VERSION } from '../appsScript';
import { sendTestOrders, type TestSendResult } from '../testOrders';

const COUNTS = [1, 3, 5, 10];

export function TestOrderButton() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="cards-btn test-btn" onClick={() => setOpen(true)} title="Send pretend orders to try the new-order alerts"><FlaskConical size={18} /> Test order</button>
    {open && <TestOrderDialog onClose={() => setOpen(false)} />}
  </>;
}

function TestOrderDialog({ onClose }: { onClose: () => void }) {
  const { bakery } = useLedger();
  const { notify } = useApp();
  const [count, setCount] = useState(1);
  const [emailMe, setEmailMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestSendResult | null>(null);
  const cfg = getSheetConfig();
  const connected = !!(cfg.url && cfg.key);
  const onMenu = bakery.products.some(p => p.active);
  const oldScript = (cfg.scriptVersion ?? 1) < APPS_SCRIPT_VERSION;

  const send = async () => {
    setBusy(true); setResult(null);
    const r = await sendTestOrders(count, bakery.products, bakery.pickups, emailMe);
    setBusy(false); setResult(r);
    // no instant sync on purpose: the regular check picks them up, just like a real customer's order
    if (!r.sent.length) notify(r.reason === 'unknown-action' ? 'Your sheet script is too old for test orders. Update it in Settings → Shared sheet.' : 'No test orders went through.', true);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="test-title">
      <div className="modal test-modal">
        <h3 id="test-title"><FlaskConical size={20} /> Send test orders</h3>
        <p className="small">Pretend customers order random things from your menu, through your bakery sheet, exactly like a real order. You get the same banner, whoosh, phone/Windows notification{emailMe ? ' and Gmail email' : ''}.</p>
        <ul className="small test-facts">
          <li>No email address needed, and no customer emails are sent.</li>
          <li>Marked <span className="pill small warn">🧪 Test order</span> and kept out of sales, Reports, Customers and the launch checklist. They don’t count toward an order limit.</li>
          <li>When you’re done: <b>Clear orders… → Test orders</b> at the bottom of the Orders list.</li>
        </ul>
        {!connected ? <p className="warn-text">Connect the shared bakery sheet first (Settings → Shared sheet). Test orders travel through it.</p>
          : !onMenu ? <p className="warn-text">Nothing is on the menu yet. Add at least one product on the Menu tab.</p>
          : <>
            <p className="small"><b>How many at once?</b> More than one is the stress test: they all arrive at the same moment.</p>
            <div className="seg" role="radiogroup" aria-label="How many test orders">
              {COUNTS.map(n => <button key={n} role="radio" aria-checked={count === n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>)}
            </div>
            <label className="agree"><input type="checkbox" checked={emailMe} onChange={e => setEmailMe(e.target.checked)} /> Also send the new-order email to the bakery Gmail{count > 1 ? ` (${count} emails)` : ''}</label>
            {bakery.shop.emailsPaused && emailMe && <p className="muted small">Testing mode is on, so emails are paused. Turn it off on Pickup &amp; form to get the Gmail email too.</p>}
            {oldScript && <p className="warn-text small">Your sheet script may be older than version {APPS_SCRIPT_VERSION}. If sending fails, update it in Settings → Shared sheet.</p>}
            <div className="btn-row">
              <button className="primary big" disabled={busy} onClick={send}><FlaskConical size={18} /> {busy ? 'Sending…' : `Send ${count} test order${count > 1 ? 's' : ''}`}</button>
            </div>
          </>}
        {result && result.sent.length > 0 && (
          <div className="test-result" role="status">
            <p><b>✓ Sent {result.sent.length} test order{result.sent.length > 1 ? 's' : ''}</b> ({result.sent.map(n => '#' + n).join(', ')}){result.failed ? `; ${result.failed} didn’t go through` : ''}.</p>
            <p className="small">The banner usually appears within 30 seconds, the same as a real order. To see the phone or Windows notification, switch to another app or tab now and wait.</p>
          </div>
        )}
        <div className="btn-row"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
