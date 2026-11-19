// Payment links (optional): Venmo / Cash App / PayPal open with the amount filled in; Zelle shows the address.
import type { PaymentInfo } from './freezer';

export type PayOption = { key: string; label: string; url?: string; detail?: string };
export function payOptions(p: PaymentInfo | undefined, amount: number, note: string): PayOption[] {
  const out: PayOption[] = [];
  const amt = amount.toFixed(2);
  if (p?.venmo) out.push({ key: 'venmo', label: 'Venmo', url: `https://venmo.com/${encodeURIComponent(p.venmo.replace(/^@/, ''))}?txn=pay&amount=${amt}&note=${encodeURIComponent(note)}`, detail: '@' + p.venmo.replace(/^@/, '') });
  if (p?.cashapp) out.push({ key: 'cashapp', label: 'Cash App', url: `https://cash.app/$${encodeURIComponent(p.cashapp.replace(/^\$/, ''))}/${amt}`, detail: '$' + p.cashapp.replace(/^\$/, '') });
  if (p?.paypal) out.push({ key: 'paypal', label: 'PayPal', url: `https://paypal.me/${encodeURIComponent(p.paypal.replace(/^@/, ''))}/${amt}`, detail: p.paypal });
  if (p?.zelle) out.push({ key: 'zelle', label: 'Zelle', detail: p.zelle });
  if (p?.cash !== false) out.push({ key: 'cash', label: 'Cash at pickup' });
  return out;
}
export const hasOnlinePay = (p?: PaymentInfo) => !!(p?.venmo || p?.cashapp || p?.paypal || p?.zelle);
