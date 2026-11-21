import { beforeEach, describe, expect, test } from 'vitest';
import { introOn, introsOff, setAllIntros, setIntroOn } from '../src/intros';

describe('page intro switches', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.dataset.anim = 'on'; });
  test('each intro can be turned off and on; all at once too', () => {
    expect(introOn('orders')).toBe(true);
    setIntroOn('orders', false);
    expect(introOn('orders')).toBe(false); expect(introOn('freezer')).toBe(true);
    setAllIntros(false); expect(introsOff()).toHaveLength(6); expect(introOn('recipes')).toBe(false);
    setAllIntros(true); expect(introsOff()).toEqual([]);
  });
  test('Animations off stops every intro', () => {
    document.documentElement.dataset.anim = 'off';
    expect(introOn('shopping')).toBe(false);
  });
});
