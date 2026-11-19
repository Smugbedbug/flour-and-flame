// The Google Apps Script that turns a private Google Sheet into the shared "bakery sheet".
// The script lives in src/apps-script/Code.gs; the app fills in your secret key and the version.
// Design: an append-only list of events (freezer, products, orders…). Each device sends its new events
// and receives everyone's; unique event ids mean sending twice never duplicates anything.
import code from './apps-script/Code.gs?raw';

export const APPS_SCRIPT_VERSION = 13; // v2: menu + customer orders + owner email; v3: pickup options, shop note/closed, customer emails; v4: email required, custom sizes, mixed boxes; v5: pictures on the order form; v6: order emails read well as phone notifications; v7: feedback, optional order limit, flavour descriptions, holiday look; v8: clear orders, email switches and testing mode; v9: payment links, gifts, order again, announcement emails with unsubscribe; v10: public reviews from the card QR code; v11: owner test orders; v12: loyalty (free half dozen) and the private pickup address emailed after payment; v13: instant phone alerts (ntfy) and numbering by the highest number.

export function buildAppsScript(key: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(key)) throw Error('Invalid key');
  return code.replace("'__APP_KEY__'", `'${key}'`).replace(/__VERSION__/g, String(APPS_SCRIPT_VERSION));
}

/** A strong random key (letters/digits, 24 chars). */
export function newSheetKey(): string {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(a, b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[b % 56]).join('');
}
