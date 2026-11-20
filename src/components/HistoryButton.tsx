// Bell-with-clock button next to the logo: reopen any pop-up you missed.
import { History, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clearHistory, getHistory, lastSeen, markHistorySeen, type HistoryEntry } from '../history';
import { focusOrder } from './OrderAlerts';
import { useRoute } from '../app-context';

const when = (iso: string) => {
  const d = new Date(iso), today = new Date();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return t;
  const y = new Date(today); y.setDate(y.getDate() - 1);
  return (d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + ' ' + t;
};

export function HistoryButton() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<HistoryEntry[]>(getHistory);
  const [seen, setSeen] = useState(lastSeen);
  const [page] = useRoute();
  useEffect(() => { const f = () => { setList(getHistory()); setSeen(lastSeen()); }; window.addEventListener('ff-history', f); return () => window.removeEventListener('ff-history', f); }, []);
  const unread = list.filter(e => e.at > seen).length;
  const toggle = () => { if (!open) markHistorySeen(); setOpen(!open); };
  return (
    <div className="history-wrap">
      <button className={'history-btn' + (unread ? ' has-new' : '')} onClick={toggle} aria-expanded={open} aria-label={`Notification history${unread ? `, ${unread} new` : ''}`} title="Notification history">
        <History size={18} />{unread > 0 && <b className="history-badge">{unread > 9 ? '9+' : unread}</b>}
      </button>
      {open && (
        <div className="history-panel" role="dialog" aria-label="Notification history">
          <div className="history-head">
            <button className="small-btn" onClick={() => setOpen(false)} aria-label="Close history"><X size={16} /></button>
            <strong>Notifications</strong>
            {list.length > 0 && <button className="small-btn" onClick={() => { if (window.confirm('Clear the notification history on this device?')) clearHistory(); }}><Trash2 size={14} /> Clear</button>}
          </div>
          {!list.length ? <p className="muted small">Nothing yet. Pop-up messages and new-order alerts will be kept here.</p> : (
            <ul className="history-list">
              {list.map(e => (
                <li key={e.id} className={'h-' + e.kind + (e.at > seen ? ' new' : '')}>
                  <span className="h-time">{when(e.at)}</span>
                  <span className="h-text">{e.text}</span>
                  {e.orderId && <button className="small-btn" onClick={() => { setOpen(false); focusOrder(e.orderId!, page === 'orders'); }}>Open</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
