// Notification history: every pop-up message and new-order alert, kept on this device (last 80).
export type HistoryEntry = { id: string; at: string; text: string; kind: 'info' | 'error' | 'order'; orderId?: string };
const KEY = 'ff-history', SEEN = 'ff-history-seen', MAX = 80;

export function getHistory(): HistoryEntry[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function addHistory(text: string, kind: HistoryEntry['kind'] = 'info', orderId?: string) {
  const list = getHistory();
  // the same message twice within a few seconds is one entry
  if (list[0] && list[0].text === text && Date.now() - Date.parse(list[0].at) < 4000) return;
  list.unshift({ id: Math.random().toString(36).slice(2), at: new Date().toISOString(), text, kind, ...(orderId ? { orderId } : {}) });
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* full: skip */ }
  window.dispatchEvent(new Event('ff-history'));
}
export function clearHistory() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } window.dispatchEvent(new Event('ff-history')); }
export function lastSeen(): string { try { return localStorage.getItem(SEEN) || ''; } catch { return ''; } }
export function markHistorySeen() { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* ignore */ } window.dispatchEvent(new Event('ff-history')); }
