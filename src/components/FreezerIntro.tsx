// Freezer page intro (v0.29): an illustrated chest freezer seen from slightly above. The lid swings up on its back
// hinge, the inside light comes on and shows your real inventory (frosted bags labelled "BBCC · 132"),
// cold mist spills over the rim, then the view dips in. Tap to skip. Off with reduced motion / Animations off.
import '@fontsource/caveat/latin-600.css';
import { useEffect, useMemo, useState } from 'react';
import { cameFrom } from './Cookbook';

import { introOn } from '../intros';
export type IntroItem = { short: string; count: number };

// Geometry (viewBox units). The top of the freezer is a trapezoid: narrow back edge, wide front edge.
const BACK_Y = 96, FRONT_Y = 200, BOTTOM_Y = 332;
const IN = { by: 108, fy: 192, bl: 104, br: 296, fl: 58, fr: 342 }; // inside opening
const xAt = (y: number, left: boolean) => { const t = (y - IN.by) / (IN.fy - IN.by); return left ? IN.bl + (IN.fl - IN.bl) * t : IN.br + (IN.fr - IN.br) * t; };

/** Up to 6 bags in two rows (back row smaller, as it's further away). */
function bagLayout(n: number) {
  const rows = n <= 3 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
  const out: { x: number; y: number; w: number; h: number; rot: number; s: number }[] = [];
  const rowY = rows.length === 1 ? [150] : [128, 166];
  rows.forEach((count, r) => {
    const y = rowY[r], l = xAt(y, true) + 8, rr = xAt(y, false) - 8, s = 0.8 + (y - IN.by) / (IN.fy - IN.by) * 0.35;
    const w = Math.min(92 * s, (rr - l) / count - 6), h = 30 * s;
    for (let i = 0; i < count; i++) out.push({ x: l + (i + 0.5) * ((rr - l) / count), y, w, h, rot: [-5, 3, -2, 6, -4, 2][out.length % 6], s });
  });
  return out;
}

export function FreezerIntro({ items = [] }: { items?: IntroItem[] }) {
  const [on, setOn] = useState(() => introOn('freezer') && !['sheet', 'freezer'].includes(cameFrom()));
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 2700); return () => clearTimeout(t); }, [on]);
  const bags = useMemo(() => { const top = [...items].filter(i => i.count > 0).map(i => ({ ...i, short: i.short.length > 7 ? i.short.slice(0, 5) + '.' : i.short })).sort((a, b) => b.count - a.count); return { shown: top.slice(0, 6), more: Math.max(0, top.length - 6) }; }, [items]);
  const layout = bagLayout(bags.shown.length);
  if (!on) return null;
  return (
    <div className="fz-intro" onClick={() => setOn(false)} role="img" aria-label={bags.shown.length ? `Freezer opening: ${bags.shown.map(b => `${b.short} ${b.count}`).join(', ')}` : 'Freezer opening: empty'}>
      <svg className="fz-svg" viewBox="0 -70 400 440" width="100%" height="100%">
        <defs>
          <linearGradient id="fzBody" x1="0" x2="1"><stop offset="0" stopColor="#c9d2d9" /><stop offset=".07" stopColor="#eef2f5" /><stop offset=".5" stopColor="#f8fafb" /><stop offset=".93" stopColor="#e8edf1" /><stop offset="1" stopColor="#bcc6ce" /></linearGradient>
          <linearGradient id="fzBodyV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".0" /><stop offset=".85" stopColor="#7d8b96" stopOpacity=".18" /><stop offset="1" stopColor="#5b6873" stopOpacity=".35" /></linearGradient>
          <linearGradient id="fzLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9eef2" /><stop offset=".6" stopColor="#f9fbfc" /><stop offset="1" stopColor="#dfe6eb" /></linearGradient>
          <linearGradient id="fzLidUnder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c4ced6" /><stop offset="1" stopColor="#e6ecf0" /></linearGradient>
          <linearGradient id="fzWell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dcebf5" /><stop offset=".35" stopColor="#b9cfde" /><stop offset="1" stopColor="#7f98ab" /></linearGradient>
          <linearGradient id="fzSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".45" stopColor="#fff" stopOpacity=".55" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id="fzBag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".92" /><stop offset="1" stopColor="#dfe9f0" stopOpacity=".86" /></linearGradient>
          <radialGradient id="fzLight" cx=".5" cy=".15" r=".8"><stop offset="0" stopColor="#f4fbff" stopOpacity=".95" /><stop offset=".6" stopColor="#d7ecfa" stopOpacity=".25" /><stop offset="1" stopColor="#d7ecfa" stopOpacity="0" /></radialGradient>
          <pattern id="fzFrost" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".8" fill="#fff" opacity=".7" /><circle cx="10" cy="9" r=".6" fill="#fff" opacity=".55" /><circle cx="7" cy="12" r=".4" fill="#fff" opacity=".6" /></pattern>
          <filter id="fzBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
          <filter id="fzSoft"><feGaussianBlur stdDeviation="1.2" /></filter>
          <clipPath id="fzOpening"><polygon points={`${IN.bl},${IN.by} ${IN.br},${IN.by} ${IN.fr},${IN.fy} ${IN.fl},${IN.fy}`} /></clipPath>
        </defs>

        <g className="fz-scene">
          <ellipse cx="200" cy={BOTTOM_Y + 10} rx="190" ry="16" fill="#000" opacity=".55" filter="url(#fzSoft)" />

          {/* body: front face */}
          <path d={`M40 ${FRONT_Y} H360 V${BOTTOM_Y - 10} Q360 ${BOTTOM_Y} 350 ${BOTTOM_Y} H50 Q40 ${BOTTOM_Y} 40 ${BOTTOM_Y - 10} Z`} fill="url(#fzBody)" />
          <path d={`M40 ${FRONT_Y} H360 V${BOTTOM_Y - 10} Q360 ${BOTTOM_Y} 350 ${BOTTOM_Y} H50 Q40 ${BOTTOM_Y} 40 ${BOTTOM_Y - 10} Z`} fill="url(#fzBodyV)" />
          <polygon points={`120,${FRONT_Y + 18} 175,${FRONT_Y + 18} 120,${BOTTOM_Y - 30} 65,${BOTTOM_Y - 30}`} fill="url(#fzSheen)" opacity=".5" />
          {/* kick plate + vent + feet */}
          <rect x="52" y={BOTTOM_Y - 24} width="296" height="16" rx="3" fill="#cfd7dd" />
          {Array.from({ length: 14 }, (_, i) => <rect key={i} x={238 + i * 7} y={BOTTOM_Y - 21} width="3.5" height="10" rx="1.5" fill="#8d9aa4" />)}
          <rect x="56" y={BOTTOM_Y - 2} width="22" height="8" rx="2" fill="#4a535a" /><rect x="322" y={BOTTOM_Y - 2} width="22" height="8" rx="2" fill="#4a535a" />
          {/* control panel: dial + power light + brand plate */}
          <circle cx="76" cy={BOTTOM_Y - 46} r="9" fill="#e4e9ed" stroke="#a9b5be" strokeWidth="1.5" /><line x1="76" y1={BOTTOM_Y - 46} x2="80" y2={BOTTOM_Y - 52} stroke="#5b6873" strokeWidth="2" strokeLinecap="round" />
          <circle className="fz-power" cx="96" cy={BOTTOM_Y - 46} r="3.2" fill="#5fd36b" />
          <rect x="146" y={BOTTOM_Y - 52} width="108" height="16" rx="8" fill="#1d3b52" />
          <text x="200" y={BOTTOM_Y - 40.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#d8efff" letterSpacing=".6" fontFamily="system-ui, sans-serif">❄ FLOUR &amp; FLAME</text>
          <line x1="40" y1={FRONT_Y + 14} x2="360" y2={FRONT_Y + 14} stroke="#aab6bf" strokeWidth="1" />

          {/* top rim + the cold well */}
          <polygon points={`90,${BACK_Y} 310,${BACK_Y} 360,${FRONT_Y} 40,${FRONT_Y}`} fill="#eef2f5" />
          <polygon points={`${IN.bl - 4},${IN.by - 3} ${IN.br + 4},${IN.by - 3} ${IN.fr + 5},${IN.fy + 3} ${IN.fl - 5},${IN.fy + 3}`} fill="#9aa7b1" />
          <g clipPath="url(#fzOpening)">
            <rect x="40" y={IN.by} width="320" height={IN.fy - IN.by} fill="url(#fzWell)" />
            <polygon points={`${IN.bl},${IN.by} ${IN.br},${IN.by} ${IN.br + 6},${IN.by + 16} ${IN.bl - 6},${IN.by + 16}`} fill="#eaf4fb" opacity=".8" />
            <rect x="40" y={IN.by} width="320" height={IN.fy - IN.by} fill="url(#fzFrost)" />
            {bags.shown.length === 0 && <text x="200" y="158" textAnchor="middle" className="fz-hand" fontSize="22" fill="#2f4a5e">Empty, time to bake!</text>}
            {bags.shown.map((b, i) => {
              const g = layout[i];
              return (
                <g key={b.short + i} className="fz-bag" transform={`translate(${g.x} ${g.y}) rotate(${g.rot})`} style={{ animationDelay: `${1.05 + i * 0.07}s` }}>
                  <rect x={-g.w / 2 + 2} y={-g.h / 2 + 4} width={g.w} height={g.h} rx="5" fill="#33485a" opacity=".35" filter="url(#fzSoft)" />
                  <rect x={-g.w / 2} y={-g.h / 2} width={g.w} height={g.h} rx="5" fill="url(#fzBag)" stroke="#c9d8e3" strokeWidth=".8" />
                  {[-0.3, 0, 0.3].map((f, k) => <circle key={k} cx={g.w * f} cy={g.h * 0.1} r={g.h * 0.24} fill="#d7b07a" opacity=".45" filter="url(#fzSoft)" />)}
                  <rect x={-g.w / 2} y={-g.h / 2 + 3} width={g.w} height="2.2" fill="#3f7fd0" opacity=".85" />
                  <rect x={-g.w * 0.36} y={-g.h * 0.18} width={g.w * 0.72} height={g.h * 0.56} rx="2" fill="#fffdf6" stroke="#e0d6c2" strokeWidth=".6" />
                  <text x="0" y={g.h * 0.24} textAnchor="middle" className="fz-hand" fontSize={11.5 * g.s * Math.min(1, 10 / `${b.short} · ${b.count}`.length)} fill="#1f2b6b">{b.short} · {b.count}</text>
                </g>
              );
            })}
            {bags.more > 0 && <text x={IN.fr - 30} y={IN.fy - 6} textAnchor="end" className="fz-hand" fontSize="13" fill="#1f2b6b">+{bags.more} more</text>}
            <rect className="fz-lightwash" x="40" y={IN.by} width="320" height={IN.fy - IN.by} fill="url(#fzLight)" />
          </g>

          {/* mist */}
          <g className="fz-mist" filter="url(#fzBlur)">
            {Array.from({ length: 12 }, (_, i) => <ellipse key={i} className={i % 2 ? 'spill' : 'rise'} cx={78 + i * 22} cy={FRONT_Y - 10 - (i % 3) * 22} rx={16 + (i % 3) * 5} ry={9 + (i % 2) * 3} fill="#f2f8fc" style={{ animationDelay: `${0.95 + (i % 4) * 0.12}s`, ['--dx' as any]: `${(i - 4) * 5}px` }} />)}
          </g>

          {/* lid, hinged along the back edge */}
          <g className="fz-lid">
            <g className="fz-lid-top">
              <polygon points={`86,${BACK_Y - 4} 314,${BACK_Y - 4} 365,${FRONT_Y} 35,${FRONT_Y}`} fill="url(#fzLid)" stroke="#c6d0d7" strokeWidth="1" />
              <polygon points={`104,${BACK_Y + 8} 296,${BACK_Y + 8} 336,${FRONT_Y - 14} 64,${FRONT_Y - 14}`} fill="none" stroke="#d6dee4" strokeWidth="2" />
              <polygon points={`96,${BACK_Y} 150,${BACK_Y} 90,${FRONT_Y - 4} 46,${FRONT_Y - 4}`} fill="#fff" opacity=".5" />
              <path d={`M35 ${FRONT_Y} H365 V${FRONT_Y + 14} Q365 ${FRONT_Y + 17} 361 ${FRONT_Y + 17} H39 Q35 ${FRONT_Y + 17} 35 ${FRONT_Y + 14} Z`} fill="#dfe6eb" stroke="#bcc7cf" strokeWidth="1" />
              <rect x="160" y={FRONT_Y + 5} width="80" height="6" rx="3" fill="#7e8c97" />
            </g>
            <g className="fz-lid-under">
              <polygon points={`86,${BACK_Y - 4} 314,${BACK_Y - 4} 365,${FRONT_Y} 35,${FRONT_Y}`} fill="url(#fzLidUnder)" stroke="#aebbc5" strokeWidth="1" />
              <polygon points={`100,${BACK_Y + 6} 300,${BACK_Y + 6} 342,${FRONT_Y - 10} 58,${FRONT_Y - 10}`} fill="#eef3f6" stroke="#9fb0bc" strokeWidth="3" />
              <rect x="186" y={BACK_Y + 26} width="28" height="9" rx="3" fill="#fffbe6" className="fz-bulb" />
              <path d={`M35 ${FRONT_Y} H365 V${FRONT_Y + 14} H35 Z`} fill="#c9d3da" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
