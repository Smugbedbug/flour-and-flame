// Page intro animations: each one can be switched off on its own (Aa menu → Page intros).
// All of them also stay off when Animations are off or the device asks for reduced motion.
export const INTROS = {
  recipes: 'Recipes: the cookbook opens',
  recipe: 'Opening a recipe: pages flip',
  orders: 'Orders: order sheet on a clipboard',
  freezer: 'Freezer: chest freezer opens',
  shopping: 'Shopping: cart rolls in',
  import: 'Importing: recipe written into the cookbook',
} as const;
export type IntroKey = keyof typeof INTROS;
const KEY = 'ff-intros-off';

export const motionOk = () => document.documentElement.dataset.anim !== 'off' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function introsOff(): IntroKey[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } }
export function setIntroOn(key: IntroKey, on: boolean) {
  const off = new Set(introsOff()); if (on) off.delete(key); else off.add(key);
  try { localStorage.setItem(KEY, JSON.stringify([...off])); } catch { /* private mode */ }
}
export function setAllIntros(on: boolean) { try { localStorage.setItem(KEY, JSON.stringify(on ? [] : Object.keys(INTROS))); } catch { /* ignore */ } }
/** Should this page's intro play right now? */
export const introOn = (key: IntroKey) => motionOk() && !introsOff().includes(key);
