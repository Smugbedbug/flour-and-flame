// Public unsubscribe page (link at the bottom of announcement emails).
import { useState } from 'react';
import { FullLogo, PhoenixSmolder } from '../components/Logo';

export function UnsubscribePage({ deploymentId, b64, token }: { deploymentId: string; b64: string; token: string }) {
  const email = (() => { try { return decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return ''; } })();
  const [state, setState] = useState<'ask' | 'sending' | 'done' | 'error'>('ask');
  const go = async () => {
    setState('sending');
    try {
      const r = await fetch(`https://script.google.com/macros/s/${deploymentId}/exec`, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'unsubscribe', email, token }) });
      const d = await r.json(); setState(d.ok ? 'done' : 'error');
    } catch { setState('error'); }
  };
  return (
    <div className="order-form-page">
      <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder></div>
      <section className="card done">
        {!email || !/^[A-Za-z0-9_-]{20,}$/.test(deploymentId) ? <p>This link is incomplete.</p>
          : state === 'done' ? <><h2>You’re unsubscribed</h2><p className="muted">{email} won’t get announcement emails any more. You’ll still get emails about orders you place.</p></>
          : <>
              <h2>Unsubscribe?</h2>
              <p className="muted">Stop announcement emails from Flour and Flame Bakery to <b>{email}</b>.</p>
              <button className="primary big" disabled={state === 'sending'} onClick={() => void go()}>{state === 'sending' ? 'One moment…' : 'Unsubscribe'}</button>
              {state === 'error' && <p className="banner error">That didn’t work. Please try again in a moment.</p>}
            </>}
      </section>
    </div>
  );
}
