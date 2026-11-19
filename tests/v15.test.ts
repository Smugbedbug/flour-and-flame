import { describe, expect, test, beforeEach } from 'vitest';
import { payOptions, hasOnlinePay } from '../src/payment';
import { decodeAgain, orderAgainLink } from '../src/feedback';
import { setSheetConfig } from '../src/ledger';
import { customerList } from '../src/reports';
import { computeBakery } from '../src/bakery';

describe('payments (optional)', () => {
  test('nothing set up → cash at pickup only; handles become one-tap links with the amount', () => {
    expect(payOptions(undefined, 28, 'x')).toEqual([{ key: 'cash', label: 'Cash at pickup' }]);
    expect(hasOnlinePay(undefined)).toBe(false);
    const o = payOptions({ venmo: '@Flour-Flame', cashapp: '$FlourFlame', paypal: 'flourflame', zelle: 'me@x.com', cash: false }, 30, 'Order #12');
    expect(o.map(x => x.url ?? x.detail)).toEqual([
      'https://venmo.com/Flour-Flame?txn=pay&amount=30.00&note=Order%20%2312',
      'https://cash.app/$FlourFlame/30.00',
      'https://paypal.me/flourflame/30.00',
      'me@x.com',
    ]);
  });
});

describe('order again', () => {
  beforeEach(() => { localStorage.clear(); setSheetConfig({ url: 'https://script.google.com/macros/s/AKfycbTESTDEPLOYMENT1234567890/exec', key: 'k' }); });
  test('the link carries the boxes (including mixed-box flavours) and nothing personal', () => {
    const o: any = { orderId: 'o1', customer: { name: 'Sue', contact: 'sue@x.com' }, items: [
      { productId: 'c12', name: 'Dozen: Cocoa', recipeId: 'cocoa', recipeTitle: 'Cocoa', pieces: 12, qty: 2, unitPrice: 28 },
      { productId: 'mix', name: 'Mixed dozen', recipeId: 'mixed', recipeTitle: 'Mixed dozen', pieces: 12, qty: 1, unitPrice: 30, mix: [{ recipeId: 'cocoa', recipeTitle: 'Cocoa', count: 6 }, { recipeId: 'van', recipeTitle: 'Vanilla', count: 6 }] }] };
    const link = orderAgainLink(o)!;
    expect(link).toMatch(/#\/order-form\/AKfycbTESTDEPLOYMENT1234567890\/again\/[A-Za-z0-9_-]+$/);
    expect(link).not.toMatch(/sue/i);
    expect(decodeAgain(link.split('/again/')[1])).toEqual([{ productId: 'c12', qty: 2 }, { productId: 'mix', qty: 1, mix: [['cocoa', 6], ['van', 6]] }]);
    expect(decodeAgain('not-base64!!')).toEqual([]);
  });
});

describe('subscribers and notes', () => {
  test('opted-in customers are subscribed until they unsubscribe; notes are shared and can be cleared', () => {
    const o = (id: string, email: string, news?: boolean) => ({ orderId: id, customer: { name: email, contact: email }, items: [], total: 0, status: 'pending', createdAt: id, updatedAt: id, source: 'form', ...(news ? { news } : {}) }) as any;
    const list = customerList([o('1', 'a@x.com', true), o('2', 'b@x.com'), o('3', 'c@x.com', true)], ['c@x.com']);
    expect(Object.fromEntries(list.map(c => [c.email, c.subscribed]))).toEqual({ 'a@x.com': true, 'b@x.com': false, 'c@x.com': false });
    let n = 0; const ev = (e: any) => ({ eventId: 'e' + ++n, at: 'x', device: 'd', seq: n, ...e });
    expect(computeBakery([ev({ type: 'customer.note', key: 'a@x.com', note: 'nut allergy' })]).notes).toEqual({ 'a@x.com': 'nut allergy' });
    expect(computeBakery([ev({ type: 'customer.note', key: 'a@x.com', note: 'nut allergy' }), ev({ type: 'customer.note', key: 'a@x.com', note: '' })]).notes).toEqual({});
  });
});
