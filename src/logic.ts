import type {Ingredient,Recipe} from './types';

export function normalizeIngredientName(name:string):string{return name.trim().toLowerCase().replace(/\s+/g,' ').replace(/[’]/g,"'")}
export function stableCatalogId(name:string):string {let hash=2166136261;for(const c of normalizeIngredientName(name)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}return 'ing-'+(hash>>>0).toString(36)}
// Only conversions within the same physical dimension. Never guess ingredient density.
export function convert(value:number,from:string,to:string):number|null {
  const weight:Record<string,number>={g:1,gram:1,grams:1,kg:1000,oz:28.349523125,lb:453.59237,lbs:453.59237};
  const volume:Record<string,number>={ml:1,l:1000,tsp:4.92892159,teaspoon:4.92892159,tbsp:14.7867648,tablespoon:14.7867648,cup:236.5882365,cups:236.5882365};
  const count:Record<string,number>={each:1,item:1,items:1,egg:1,eggs:1,pinch:1};
  const f=from.trim().toLowerCase(),t=to.trim().toLowerCase();
  if(f===t)return value;
  for(const group of [weight,volume,count])if(f in group&&t in group)return value*group[f]/group[t];
  return null;
}
export function scaleAmount(amount:number,factor:number):number {if(!Number.isFinite(factor)||factor<=0)throw Error('Invalid factor');return Math.round((amount*factor+Number.EPSILON)*1000)/1000}
export function eggGuidance(line:Ingredient,factor:number):string|null{
  const name=normalizeIngredientName(line.name);
  if(!['each','egg','eggs','large','whole'].includes(line.unit.trim().toLowerCase())||!(name.includes('egg')||name.includes('yolk')))return null;
  const n=line.amount*factor;
  if(Math.abs(n-Math.round(n))<0.000001)return null;
  const yolk=name.includes('yolk');
  const est=yolk?18:50;
  return `${Math.round(n*100)/100} ${yolk?'yolks':'eggs'}: lightly beat ${yolk?'the yolks':'whole eggs'} and weigh about ${Math.round(n*est)} g (≈${est} g per large ${yolk?'yolk':'egg'}; eggs vary).`;
}

/** Find minute/hour durations in a method step, e.g. "Bake 10–12 minutes" → [{min:10,max:12}]. */
export function findDurations(step:string):{label:string;minutes:number;maxMinutes:number}[]{
  const out:{label:string;minutes:number;maxMinutes:number}[]=[];
  const re=/(\d+(?:\.\d+)?)(?:\s*(?:–|-|to)\s*(\d+(?:\.\d+)?))?\s*(minutes?|mins?|hours?|hrs?)\b/gi;
  for(const m of step.matchAll(re)){
    const mult=/^h/i.test(m[3])?60:1;const a=Number(m[1])*mult,b=m[2]?Number(m[2])*mult:a;
    if(a>0&&a<=72*60)out.push({label:m[0],minutes:a,maxMinutes:b});
  }
  return out;
}

/** Ratio of pan areas (and optional thickness) used as a temporary scaling factor. */
export function panArea(p:{shape:'rect';widthIn:number;lengthIn:number}|{shape:'round';diameterIn:number}):number{
  return p.shape==='rect'?p.widthIn*p.lengthIn:Math.PI*(p.diameterIn/2)**2;
}
export function panFactor(from:Parameters<typeof panArea>[0],to:Parameters<typeof panArea>[0],thicknessRatio=1):number{
  const a=panArea(from),b=panArea(to);if(!(a>0&&b>0&&thicknessRatio>0))throw Error('Pan sizes must be positive');
  return (b/a)*thicknessRatio;
}

/** A recipe is treated as a brown-butter recipe only if its own text says so. */
export function usesBrownButter(r:Recipe):boolean{
  const text=[r.title,...r.steps,...r.ingredients.map(i=>i.name)].join(' ').toLowerCase();
  return /brown(ed|ing)?\s+(the\s+)?butter/.test(text);
}
