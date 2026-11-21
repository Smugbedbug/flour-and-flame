// Shopping page intro: a shopping cart rolls in from the left, the groceries drop in, and it rolls on. Tap to skip.
import { useEffect, useState } from 'react';
import { cameFrom } from './Cookbook';

import { introOn } from '../intros';

export function ShoppingIntro() {
  const [on, setOn] = useState(() => introOn('shopping') && cameFrom() !== 'shopping');
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 2300); return () => clearTimeout(t); }, [on]);
  if (!on) return null;
  const wheel = (cx: number) => (
    <g className="cart-wheel" style={{ transformOrigin: `${cx}px 196px` }}>
      <circle cx={cx} cy="196" r="13" fill="#2b2420" stroke="#8d97a0" strokeWidth="3" />
      <circle cx={cx} cy="196" r="4" fill="#c9d1d8" />
      <line x1={cx - 9} y1="196" x2={cx + 9} y2="196" stroke="#8d97a0" strokeWidth="2" /><line x1={cx} y1="187" x2={cx} y2="205" stroke="#8d97a0" strokeWidth="2" />
    </g>
  );
  return (
    <div className="cart-intro" onClick={() => setOn(false)} aria-hidden="true">
      <svg viewBox="0 0 420 240" className="cart-svg">
        <ellipse cx="210" cy="214" rx="150" ry="9" fill="#000" opacity=".4" className="cart-shadow" />
        <g className="cart-roll">
          {/* groceries (drop in one by one) */}
          <g className="drop d1"><rect x="150" y="58" width="44" height="62" rx="6" fill="#f3e6cf" stroke="#c9b48f" strokeWidth="2" /><rect x="150" y="58" width="44" height="14" rx="4" fill="#c9b48f" /><text x="172" y="100" textAnchor="middle" fontSize="11" fontWeight="700" fill="#7a5a33" fontFamily="system-ui">FLOUR</text></g>
          <g className="drop d2"><rect x="200" y="84" width="54" height="22" rx="4" fill="#fff4c2" stroke="#e1c96a" strokeWidth="2" /><rect x="200" y="84" width="54" height="8" fill="#f2d76b" /><text x="227" y="102" textAnchor="middle" fontSize="8" fontWeight="700" fill="#8a6d1a" fontFamily="system-ui">BUTTER</text></g>
          <g className="drop d3"><rect x="258" y="80" width="46" height="26" rx="5" fill="#d9c3a1" stroke="#a88a5f" strokeWidth="2" />{[266, 280, 294].map(x => <ellipse key={x} cx={x} cy="80" rx="6" ry="7" fill="#fbf3e6" stroke="#dac9ae" />)}</g>
          <g className="drop d4"><rect x="196" y="66" width="22" height="40" rx="3" fill="#4a2a17" transform="rotate(-14 207 86)" /><rect x="196" y="66" width="22" height="12" rx="2" fill="#b35a2a" transform="rotate(-14 207 86)" /></g>
          {/* cart */}
          <path d="M70 70 L96 70 L120 164 L300 164" fill="none" stroke="#8d97a0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M104 96 L330 96 L312 152 L118 152 Z" fill="#c76b3a" fillOpacity=".18" stroke="#c9d1d8" strokeWidth="4" strokeLinejoin="round" />
          {[140, 175, 210, 245, 280].map(x => <line key={x} x1={x} y1="98" x2={x - 6} y2="150" stroke="#c9d1d8" strokeWidth="2" opacity=".75" />)}
          <line x1="110" y1="124" x2="321" y2="124" stroke="#c9d1d8" strokeWidth="2" opacity=".75" />
          <rect x="60" y="62" width="26" height="12" rx="6" fill="#c76b3a" />
          <path d="M126 164 L136 182 M290 164 L280 182" stroke="#8d97a0" strokeWidth="5" strokeLinecap="round" />
          {wheel(140)}{wheel(278)}
          <g className="cart-check"><circle cx="330" cy="62" r="16" fill="#3f8f5b" /><path d="M322 62 l6 6 l11 -12" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>
        </g>
      </svg>
    </div>
  );
}
