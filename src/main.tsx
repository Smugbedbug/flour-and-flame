import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './app-context';
import { App } from './App';
import './style.css';
import { applyDisplay } from './display';
applyDisplay();
// Always start on the dashboard (customer pages and pairing links keep their own address).
// A tapped new-order notification arrives with ?go=1 and keeps its Orders address.
{ const first = location.hash.replace(/^#\/?/, '').split('/')[0];
  const fromNotice = new URLSearchParams(location.search).has('go');
  if (fromNotice) history.replaceState(null, '', location.pathname + location.hash);
  else if (!['order-form', 'feedback', 'review', 'unsubscribe', 'pair', 'track'].includes(first) && first !== 'home' && first !== '') history.replaceState(null, '', location.pathname + '#/home'); }

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {}); });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider><App /></AppProvider>
  </React.StrictMode>,
);
