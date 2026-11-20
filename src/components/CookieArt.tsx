// Illustrated cookies (and brownies / crispy treats) drawn from a recipe's name and ingredients.
// A stand-in until you have real photos: same recipe → same picture every time.
import { useId } from 'react';

export type ArtSpec = {
  shape: 'cookie' | 'bar' | 'crispy' | 'cupcake';
  dough: string;      // base colour
  edge: string;       // darker rim
  toppings: ('chips' | 'white' | 'sprinkles' | 'candy' | 'nuts' | 'salt' | 'drizzle' | 'oats' | 'berries' | 'sugar' | 'cinnamon' | 'swirl' | 'crackle')[];
};

const has = (t: string, ...w: string[]) => w.some(x => t.includes(x));

/** Works from the title plus ingredient names (the order form only knows the title). */
export function artFor(title: string, category?: string, ingredients: string[] = []): ArtSpec {
  const t = (title + ' ' + ingredients.join(' ')).toLowerCase();
  const tt = title.toLowerCase();
  const shape: ArtSpec['shape'] = category === 'Cupcakes' || has(tt, 'cupcake') ? 'cupcake' : category === 'Crispy Treats' || has(tt, 'krispie', 'crispy', 'rice cereal') ? 'crispy' : category === 'Brownies' || has(tt, 'brownie', 'blondie', 'bar') ? 'bar' : 'cookie';
  let dough = '#d8a35e', edge = '#a96e33';
  if (has(tt, 'red velvet')) { dough = '#a8343a'; edge = '#6e1f25'; }
  else if (has(tt, 'matcha', 'pistachio', 'mint')) { dough = '#9fb46a'; edge = '#6c7d40'; }
  else if (has(tt, 'double chocolate', 'triple chocolate', 'cocoa', 'brownie', 'devil', 'dark chocolate', 'chocolate cookie', 'espresso')) { dough = '#5a3622'; edge = '#3a2214'; }
  else if (has(tt, 'blondie', 'brown butter', 'butterscotch', 'toffee')) { dough = '#c99350'; edge = '#94632b'; }
  else if (has(tt, 'peanut butter')) { dough = '#c8904d'; edge = '#8f5f2c'; }
  else if (has(tt, 'oat')) { dough = '#c49158'; edge = '#8d6131'; }
  else if (has(tt, 'snickerdoodle', 'cinnamon')) { dough = '#e0b77a'; edge = '#b07f45'; }
  else if (has(tt, 'sugar cookie', 'vanilla', 'shortbread', 'butter cookie', 'lemon')) { dough = '#efcf8f'; edge = '#c99a55'; }
  if (shape === 'crispy') { dough = has(t, 'chocolate', 'cocoa') ? '#7a4f30' : '#f1dfae'; edge = has(t, 'chocolate', 'cocoa') ? '#4e311d' : '#cdb57a'; }
  if (shape === 'cupcake') {
    // dough = frosting colour, edge = liner colour
    dough = has(tt, 'chocolate', 'cocoa', 'mocha', 'espresso') ? '#6b4029' : has(tt, 'strawberr', 'raspberr', 'pink', 'cherry') ? '#f2a7b8' : has(tt, 'lemon') ? '#f6e48c' : has(tt, 'pumpkin', 'orange', 'carrot') ? '#f0b46c' : has(tt, 'mint', 'matcha', 'pistachio') ? '#a9d4a0' : has(tt, 'caramel', 'salted', 'toffee', 'maple') ? '#d9a35f' : has(tt, 'blueberr', 'lavender', 'ube') ? '#b9a6e0' : '#f7efe2';
    edge = has(tt, 'red velvet') ? '#a8343a' : has(tt, 'chocolate', 'cocoa', 'devil') ? '#5a3622' : has(tt, 'pumpkin', 'spice', 'carrot', 'gingerbread') ? '#c0703a' : has(tt, 'lemon') ? '#e6c75a' : '#e7a25a';
  }
  const tops: ArtSpec['toppings'] = [];
  const noWhite = t.replace(/white chocolate( chips?| chunks?)?|white chips?/g, '');
  if (has(noWhite, 'chocolate chip', 'chocolate chunk', 'semisweet', 'semi-sweet', 'chips', 'dark chocolate', 'chunks')) tops.push('chips');
  if (has(t, 'white chocolate', 'white chip')) tops.push('white');
  if (has(t, 'sprinkle', 'funfetti', 'birthday', 'jimmies', 'nonpareil')) tops.push('sprinkles');
  if (has(t, 'm&m', 'm & m', 'candy-coated', 'candy coated', 'smarties')) tops.push('candy');
  if (has(t, 'walnut', 'pecan', 'almond', 'hazelnut', 'macadamia', 'peanuts')) tops.push('nuts');
  if (has(t, 'sea salt', 'flaky salt', 'maldon', 'salted')) tops.push('salt');
  if (has(t, 'caramel', 'drizzle', 'glaze', 'icing')) tops.push('drizzle');
  if (has(tt, 'oat')) tops.push('oats');
  if (has(t, 'cranberr', 'raisin', 'cherr', 'blueberr', 'raspberr')) tops.push('berries');
  if (has(tt, 'snickerdoodle', 'cinnamon sugar')) tops.push('cinnamon');
  else if (has(tt, 'sugar cookie', 'crinkle')) tops.push('sugar');
  if (has(t, 'cream cheese swirl', 'swirl', 'marble')) tops.push('swirl');
  if (shape === 'bar' && dough === '#5a3622') tops.push('crackle');
  if (shape === 'cookie' && has(tt, 'crinkle')) tops.push('crackle');
  return { shape, dough, edge, toppings: [...new Set(tops)].slice(0, 4) };
}

function rnd(seedStr: string) { let h = 2166136261; for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

export function CookieArt({ spec, seed, size = 96, title }: { spec: ArtSpec; seed: string; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const r = rnd(seed + spec.shape);
  const C = 50;
  // irregular rim for cookies
  const pts = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2, rad = 40 + (r() - 0.5) * 4.5; return [C + Math.cos(a) * rad, C + Math.sin(a) * rad]; });
  const mid = (a: number[], b: number[]) => `${((a[0] + b[0]) / 2).toFixed(1)},${((a[1] + b[1]) / 2).toFixed(1)}`;
  const path = `M${mid(pts[pts.length - 1], pts[0])} ` + pts.map((p, i) => `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${mid(p, pts[(i + 1) % pts.length])}`).join(' ') + ' Z';
  const inside = (fn: (x: number, y: number, i: number) => JSX.Element, n: number, spread = 30) => Array.from({ length: n }, (_, i) => {
    let x = 0, y = 0;
    if (spec.shape === 'cookie') { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread; x = C + Math.cos(a) * d; y = C + Math.sin(a) * d; } else if (spec.shape === 'cupcake') { x = 28 + r() * 44; y = 20 + r() * 28; } else { x = 18 + r() * 64; y = 22 + r() * 56; }
    return fn(x, y, i);
  });
  const sprinkleCols = ['#ff6f91', '#ffd166', '#06d6a0', '#4cc9f0', '#f8f9fa', '#c77dff'];
  return (
    <svg className="cookie-art" width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <radialGradient id={`g${id}`} cx="42%" cy="38%" r="70%"><stop offset="0" stopColor={spec.dough} stopOpacity="1" /><stop offset=".75" stopColor={spec.dough} /><stop offset="1" stopColor={spec.edge} /></radialGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={spec.dough} /><stop offset="1" stopColor={spec.edge} /></linearGradient>
        <filter id={`s${id}`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000" floodOpacity=".45" /></filter>
      </defs>
      <g filter={`url(#s${id})`}>
        {spec.shape === 'cookie' && <path d={path} fill={`url(#g${id})`} />}
        {spec.shape === 'bar' && <rect x="12" y="16" width="76" height="68" rx="6" fill={`url(#b${id})`} />}
        {spec.shape === 'crispy' && <rect x="12" y="16" width="76" height="68" rx="9" fill={`url(#b${id})`} />}
        {spec.shape === 'cupcake' && <g>
          <path d="M24 56 L76 56 L69 90 Q50 94 31 90 Z" fill={spec.edge} />
          {[30, 38, 46, 54, 62, 70].map(x => <path key={x} d={`M${x} 57 L${x + (x - 50) * -0.12} 90`} stroke="#0003" strokeWidth="1.6" />)}
          <path d="M20 58 Q18 46 30 44 Q28 30 42 30 Q44 16 56 20 Q68 18 68 32 Q82 32 80 46 Q86 56 74 60 Q50 66 26 60 Q20 60 20 58 Z" fill={`url(#g${id})`} />
          <path d="M34 40 Q48 34 62 40 M30 50 Q50 44 70 50" stroke="#fff" strokeOpacity=".28" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx="56" cy="16" r="5" fill="#c8102e" /><path d="M56 11 q3 -6 7 -7" stroke="#3a6b2a" strokeWidth="1.6" fill="none" />
        </g>}
      </g>
      {spec.shape === 'cookie' && <g stroke={spec.edge} strokeOpacity=".35" strokeWidth="1.2" fill="none" strokeLinecap="round">{Array.from({ length: 4 }, (_, i) => { const a = r() * 6.28, d = 8 + r() * 16; const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d; return <path key={i} d={`M${x} ${y} q${(r() - .5) * 14} ${(r() - .5) * 8} ${(r() - .5) * 16} ${(r() - .5) * 12}`} />; })}</g>}
      {spec.shape === 'crispy' && <g fill="#fff" fillOpacity=".25">{inside((x, y, i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="1.6" transform={`rotate(${r() * 180} ${x} ${y})`} />, 70)}</g>}
      {spec.toppings.includes('crackle') && <g stroke="#fff" strokeOpacity=".22" strokeWidth="1" fill="none">{inside((x, y, i) => <path key={i} d={`M${x} ${y} l${(r() - .5) * 18} ${(r() - .5) * 10} l${(r() - .5) * 10} ${(r() - .5) * 10}`} />, 7, 26)}</g>}
      {spec.toppings.includes('cinnamon') && <g fill="#8a4b22" fillOpacity=".55">{inside((x, y, i) => <circle key={i} cx={x} cy={y} r=".9" />, 60, 34)}</g>}
      {spec.toppings.includes('sugar') && <g fill="#fff" fillOpacity=".7">{inside((x, y, i) => <circle key={i} cx={x} cy={y} r=".8" />, 55, 34)}</g>}
      {spec.toppings.includes('oats') && <g fill="#e9d3a4" fillOpacity=".8">{inside((x, y, i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="1.4" transform={`rotate(${r() * 180} ${x} ${y})`} />, 14)}</g>}
      {spec.toppings.includes('swirl') && <path d="M30 50 C40 30, 60 70, 70 48" stroke="#f6ead8" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".85" />}
      {spec.toppings.includes('chips') && <g fill="#2b170c">{inside((x, y, i) => { const w = 3 + r() * 1.6; return <path key={i} d={`M${x - w} ${y + 1.5} Q${x - w} ${y - w} ${x} ${y - w - 0.6} Q${x + w} ${y - w} ${x + w} ${y + 1.5} Q${x} ${y + w * 0.9} ${x - w} ${y + 1.5} Z`} transform={`rotate(${r() * 70 - 35} ${x} ${y})`} />; }, 10)}</g>}
      {spec.toppings.includes('white') && <g fill="#f8efdf">{inside((x, y, i) => { const w = 2.8 + r(); return <path key={i} d={`M${x - w} ${y + 1.4} Q${x - w} ${y - w} ${x} ${y - w - 0.5} Q${x + w} ${y - w} ${x + w} ${y + 1.4} Q${x} ${y + w * 0.9} ${x - w} ${y + 1.4} Z`} transform={`rotate(${r() * 70 - 35} ${x} ${y})`} />; }, 7)}</g>}
      {spec.toppings.includes('candy') && <g>{inside((x, y, i) => <circle key={i} cx={x} cy={y} r="3.1" fill={['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#ffd166'][i % 5]} stroke="#0003" strokeWidth=".6" />, 7)}</g>}
      {spec.toppings.includes('berries') && <g fill="#9b1d34">{inside((x, y, i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="2" />, 7)}</g>}
      {spec.toppings.includes('nuts') && <g fill="#b5763d" stroke="#7a4a20" strokeWidth=".5">{inside((x, y, i) => <path key={i} d={`M${x - 3} ${y} q3 -4 6 0 q-3 4 -6 0`} transform={`rotate(${r() * 180} ${x} ${y})`} />, 6)}</g>}
      {spec.toppings.includes('sprinkles') && <g strokeLinecap="round" strokeWidth="1.6">{inside((x, y, i) => { const a = r() * 3.14; return <line key={i} x1={x} y1={y} x2={x + Math.cos(a) * 3.5} y2={y + Math.sin(a) * 3.5} stroke={sprinkleCols[i % sprinkleCols.length]} />; }, 24)}</g>}
      {spec.toppings.includes('drizzle') && <path d={spec.shape === 'cookie' ? 'M22 40 q8 -8 14 0 t14 0 t14 0 t14 0 M24 58 q8 -8 14 0 t14 0 t14 0 t12 0' : 'M16 38 q8 -8 14 0 t14 0 t14 0 t14 0 t12 0 M16 62 q8 -8 14 0 t14 0 t14 0 t14 0 t12 0'} stroke="#c47a2c" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".9" />}
      {spec.toppings.includes('salt') && <g fill="#fff">{inside((x, y, i) => <rect key={i} x={x} y={y} width="1.8" height="1.8" transform={`rotate(${r() * 90} ${x} ${y})`} />, 9, 28)}</g>}
      {/* soft highlight */}
      
    </svg>
  );
}

/** Convenience: art for a recipe object. */
export function RecipeArt({ recipe, size }: { recipe: { id: string; title: string; category?: string; ingredients?: { name: string }[] }; size?: number }) {
  return <CookieArt spec={artFor(recipe.title, recipe.category, (recipe.ingredients ?? []).map(i => i.name))} seed={recipe.id || recipe.title} size={size} />;
}
