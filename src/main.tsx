import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './app-context';
import { App } from './App';
import './style.css';
import { applyDisplay } from './display';
applyDisplay();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {}); });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider><App /></AppProvider>
  </React.StrictMode>,
);
