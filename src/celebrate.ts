// A small burst of copper sparks: for confirming an order, marking it ready, picking up.
// Skipped when animations are off or the device asks for reduced motion.
export function celebrate(from?: { x: number; y: number }, kind: 'spark' | 'big' = 'spark') {
  try {
    if (document.documentElement.dataset.anim === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = from?.x ?? window.innerWidth / 2, y = from?.y ?? window.innerHeight / 3;
    const wrap = document.createElement('div');
    wrap.className = 'spark-burst';
    wrap.style.left = `${x}px`; wrap.style.top = `${y}px`;
    const n = kind === 'big' ? 28 : 14;
    const colors = ['#f2b98a', '#d98a55', '#ffd7a8', '#fff3e0', '#e0a85c'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = (kind === 'big' ? 90 : 55) + Math.random() * 40;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`); s.style.setProperty('--dy', `${Math.sin(a) * d - 20}px`);
      s.style.background = colors[i % colors.length]; s.style.animationDelay = `${Math.random() * 0.08}s`;
      if (i % 4 === 0) s.className = 'star';
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1200);
  } catch { /* decorative only */ }
}
/** Burst from the centre of the button that was tapped. */
export const celebrateAt = (el: EventTarget | null, kind?: 'spark' | 'big') => {
  const r = el instanceof Element ? el.getBoundingClientRect() : null;
  celebrate(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined, kind);
};
