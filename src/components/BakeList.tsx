import { CalendarClock, ChefHat, Flame, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { go, useApp } from '../app-context';
import { useLedger } from '../ledgerState';
import { orderCoverage, orderParts, RESERVES, type Order } from '../bakery';
import { prepareSession } from '../db';
import { useAllProduction } from '../sharedProduction';
import { factorLabel, suggestBatch, yieldPerBatch } from '../bakePlan';
import { todayLocal } from '../freezer';

const fmt = (d?: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No pickup date');

/** Dashboard: the clear to-do — what to bake for which pickup, how much dough to make, and requests to answer. */
export function BakeList() {
  const { recipes, run } = useApp();
  const { bakery } = useLedger();
  const records = useAllProduction(recipes);
  const coverage = useMemo(() => orderCoverage(bakery), [bakery]);
  const today = todayLocal();

  const toBake = bakery.orders.filter(o => RESERVES.includes(o.status));
  const byDate = new Map<string, Order[]>();
  for (const o of toBake) { const k = o.pickupDate ?? ''; byDate.set(k, [...(byDate.get(k) ?? []), o]); }
  const days = [...byDate.entries()].sort(([a], [b]) => (a || '9999').localeCompare(b || '9999'));
  const totalCookies = toBake.reduce((s, o) => s + orderParts(o.items).filter(p => p.dough).reduce((t, p) => t + p.count, 0), 0);
  const otherPieces = toBake.reduce((s, o) => s + orderParts(o.items).filter(p => !p.dough).reduce((t, p) => t + p.count, 0), 0);
  const short = bakery.plan.filter(r => r.makeMore > 0);
  const requests = bakery.orders.filter(o => o.status === 'pending');
  if (!toBake.length && !short.length && !requests.length) return null;

  return (
    <section className="card bake-list">
      <h3><ChefHat size={20} /> What to bake</h3>
      <p className="bake-headline">
        {(totalCookies > 0 || otherPieces > 0) && <>Bake {totalCookies > 0 && <><b>{totalCookies}</b> cookie{totalCookies !== 1 ? 's' : ''}</>}{totalCookies > 0 && otherPieces > 0 && ' + '}{otherPieces > 0 && <><b>{otherPieces}</b> other piece{otherPieces !== 1 ? 's' : ''}</>} for <b>{toBake.length}</b> order{toBake.length !== 1 ? 's' : ''}</>}
        {(totalCookies > 0 || otherPieces > 0) && short.length > 0 && ' · '}
        {short.length > 0 && <>make <b>{short.reduce((s, r) => s + r.makeMore, 0)}</b> more dough balls</>}
        {!totalCookies && !otherPieces && !short.length && <>{requests.length} request{requests.length !== 1 ? 's' : ''} waiting for your answer</>}
      </p>

      {short.length > 0 && (
        <div className="bake-block">
          <h4><Flame size={15} /> Make dough first</h4>
          {short.map(r => {
            const recipe = recipes.find(x => x.id === r.recipeId);
            const basis = recipe ? yieldPerBatch(recipe, records) : null;
            const s = basis ? suggestBatch(r.makeMore, basis) : null;
            return (
              <div key={r.recipeId} className="make-row">
                <div>
                  <strong>{r.makeMore} {r.recipeTitle}</strong> <span className="muted small">dough balls short (have {Math.max(0, r.inFreezer)}, orders need {r.reserved + r.pending})</span>
                  {s && basis && <p className="small suggest">→ Make a <b>{factorLabel(s.factor)} batch</b> ≈ {s.expected} dough balls{s.extra > 0 ? ` (${s.extra} extra)` : ''} · {basis.source === 'history' ? `based on your last ${basis.bakes} bake${basis.bakes > 1 ? 's' : ''} (${Math.round(basis.perBatch * 10) / 10} per batch)` : `based on the recipe's yield (${basis.perBatch}); record bakes to make this more accurate`}</p>}
                  {!s && <p className="muted small">Set the recipe's yield (or record a bake) to get a batch-size suggestion.</p>}
                </div>
                {recipe && <button className="primary small-btn" onClick={() => void run(async () => { await prepareSession(recipe, s?.factor ?? 1); go('bake/' + recipe.id); })}>Start {s ? factorLabel(s.factor) : ''} batch</button>}
              </div>
            );
          })}
        </div>
      )}

      {days.length > 0 && (
        <div className="bake-block">
          <h4><CalendarClock size={15} /> Bake for pickups</h4>
          {days.map(([d, list]) => {
            const per = new Map<string, number>();
            for (const o of list) for (const p of orderParts(o.items)) per.set(p.recipeTitle, (per.get(p.recipeTitle) ?? 0) + p.count);
            const late = d && d < today, isToday = d === today;
            const shortHere = list.some(o => coverage[o.orderId]);
            return (
              <div key={d} className={'pickup-row' + (late ? ' late' : '') + (isToday ? ' today' : '')}>
                <div className="pickup-date">{isToday ? 'Today' : fmt(d || undefined)}{late ? ' · overdue' : ''}</div>
                <div>
                  <div>{[...per.entries()].map(([t, n]) => <span key={t} className="bake-chip"><b>{n}</b> {t}</span>)}</div>
                  <span className="muted small">{list.map(o => o.customer.name + (o.pickupGroup ? ` (${o.pickupGroup})` : '')).join(', ')}{shortHere ? ' · needs more dough' : ' · dough ready in freezer'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {requests.length > 0 && (
        <button className="row-btn requests-row" onClick={() => go('orders')}><Inbox size={16} /> <span><b>{requests.length}</b> order request{requests.length !== 1 ? 's' : ''} waiting for your answer</span></button>
      )}
      <div className="btn-row"><button onClick={() => go('orders')}>Open orders</button><button onClick={() => go('orders/plan')}>Planning</button>{short.length > 0 && <button onClick={() => go('shopping')}>Shopping list</button>}</div>
    </section>
  );
}
