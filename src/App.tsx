import { notePage } from './components/Cookbook';
import { HistoryButton } from './components/HistoryButton';
import { ShoppingCart } from 'lucide-react';
import { DisplayMenu } from './components/DisplayMenu';
import { useAutoCloudBackup } from './cloudBackup';
import { HolidayLights } from './components/Holiday';
import { holidayOn, useDisplay } from './display';
import { ShoppingView } from './views/ShoppingView';
import { BakeDayView } from './views/BakeDayView';
import { CardsView } from './views/CardsView';
import { BellRing, BookOpen, Database, Home as HomeIcon, Snowflake, X } from 'lucide-react';
import { FreezerView } from './views/FreezerView';
import { OrdersView } from './views/OrdersView';
import { OrderForm } from './views/OrderForm';
import { FeedbackPage } from './views/FeedbackPage';
import { UnsubscribePage } from './views/UnsubscribePage';
import { ReviewPage } from './views/ReviewPage';
import { ShoppingBag } from 'lucide-react';
import { NewOrderBanner, useRequests } from './components/OrderAlerts';
import { SheetSetup } from './views/SheetSetup';
import { useAutoLedgerSync } from './ledgerState';
import { useEffect } from 'react';
import { go, useApp, useRoute } from './app-context';
import { CompactLogo } from './components/Logo';
import { APP_VERSION } from './backup';
import { Home } from './views/Home';
import { Library } from './views/Library';
import { RecipeView } from './views/RecipeView';
import { RecipeEditor } from './views/RecipeEditor';
import { BakingMode } from './views/BakingMode';
import { ImportView } from './views/ImportView';
import { Catalog } from './views/Catalog';
import { BackupView } from './views/BackupView';
import { useOnline } from './useOnline';
import { SyncView, useHubConfig } from './views/SyncView';
import { useAutoCheck, useHubActions, usePendingChoice, useAutoSend } from './hubState';
import { Send } from 'lucide-react';
import { useAllergenSync } from './allergenSync';
import { KitchenRail, SideArt } from './components/KitchenRail';

export function App() {
  const { ready, fatal, toast, clearToast, notify, refresh } = useApp();
  const route = useRoute();
  const online = useOnline();
  const hubCfg = useHubConfig();
  const pendingChoice = usePendingChoice();
  const { send, sending, unsent, checking } = useHubActions();
  useAutoSend(unsent, send);
  useAutoCheck(ready);
  useAutoCloudBackup(ready, notify, refresh);
  useAutoLedgerSync(ready);
  useAllergenSync(ready);
  const { requests } = useRequests();
  const display = useDisplay();
  const [page, arg] = route;

  useEffect(() => { if (!toast || toast.error) return; const h = setTimeout(clearToast, Math.min(16000, 5000 + toast.message.length * 45)); return () => clearTimeout(h); }, [toast, clearToast]); // longer messages stay up longer

  const nav = [{ to: 'home', label: 'Dashboard', icon: HomeIcon, match: ['home', 'backup', 'sync'] }, { to: 'orders', label: 'Orders', icon: ShoppingBag, match: ['orders', 'bakeday', 'cards'] }, { to: 'freezer', label: 'Freezer', icon: Snowflake, match: ['freezer', 'sheet'] }, { to: 'recipes', label: 'Recipes', icon: BookOpen, match: ['recipes', 'recipe', 'edit', 'new', 'import', 'bake'] }, { to: 'shopping', label: 'Shopping', icon: ShoppingCart, match: ['shopping'] }, { to: 'ingredients', label: 'Prices', icon: Database, match: ['ingredients'] }];

  notePage(page || 'home'); // remembered so the cookbook doesn't replay when you go back from a recipe
  let view;
  if (fatal) view = <div className="page"><div className="banner error"><strong>Can't open local storage.</strong><p>{fatal}</p><p>Private/incognito windows and some browser settings block storage. Try a normal window.</p></div></div>;
  else if (!ready) view = <div className="page loading">Opening your recipes…</div>;
  else switch (page) {
    case 'recipes': view = <Library />; break;
    case 'recipe': view = <RecipeView id={arg} />; break;
    case 'edit': view = <RecipeEditor key={arg} id={arg} />; break;
    case 'new': view = <RecipeEditor key="new" />; break;
    case 'bake': view = <BakingMode key={arg} id={arg} />; break;
    case 'import': view = <ImportView />; break;
    case 'ingredients': view = <Catalog id={arg} />; break;
    case 'backup': view = <BackupView />; break;
    case 'sync': view = <SyncView />; break;
    case 'freezer': view = <FreezerView />; break;
    case 'orders': view = <OrdersView />; break;
    case 'sheet': view = <SheetSetup />; break;
    case 'shopping': view = <ShoppingView />; break;
    case 'bakeday': view = <BakeDayView />; break;
    case 'cards': view = <CardsView key={arg ?? ''} autoPrint={arg === 'print'} />; break;
    case 'pair': view = <SyncView key={arg} pairId={arg} />; break;
    default: view = <Home />;
  }
  const baking = page === 'bake';

  if (page === 'order-form') return <OrderForm deploymentId={arg ?? ''} again={route[2] === 'again' ? route[3] : undefined} from={route[2] === 'from' ? route[3] : undefined} />;
  if (page === 'review') return <ReviewPage deploymentId={arg ?? ''} />;
  if (page === 'unsubscribe') return <UnsubscribePage deploymentId={route[1] ?? ''} b64={route[2] ?? ''} token={route[3] ?? ''} />;
  if (page === 'feedback') { const [, dep = '', oid = '', tok = ''] = route; return <FeedbackPage deploymentId={dep} orderId={oid} token={tok} />; }

  return (
    <div className={'layout' + (baking ? ' baking' : '')}>
    {!baking && ready && <KitchenRail />}
    <div className={'shell' + (baking ? ' baking' : '') + (holidayOn(display) && !baking ? ' holiday' : '')}>
      {holidayOn(display) && !baking && <HolidayLights count={18} />}
      <header className="topbar">
        <button className="logo-btn" onClick={() => go('home')} aria-label="Flour and Flame home"><CompactLogo /></button>
        <HistoryButton />
        <DisplayMenu />
        {requests.length > 0 && <button className="requests-pill needs-look" onClick={() => go('orders')}><BellRing size={16} /> {requests.length}<span className="rp-word"> request{requests.length > 1 ? "s" : ""}</span></button>}
        {hubCfg.role === 'hub' && hubCfg.lastPublishedAt
          ? <button className={'send-btn' + (unsent ? ' unsent' : '')} disabled={sending || !online} onClick={() => void send(false)} title={unsent ? 'You have changes not sent to your phone' : 'Phone is up to date'}><Send size={16} /><span>{sending ? 'Sending…' : 'Send to phone'}</span>{unsent && <i className="dot" aria-label="unsent changes" />}</button>
          : <button className={'sync-state ' + (online ? '' : 'offline')} title="PC → phone updates" onClick={() => go('sync')}>{online ? '● Saved locally' : '● Offline · saved locally'}<small>{hubCfg.role === 'receiver' && hubCfg.gistId ? (checking ? 'Checking for PC updates…' : 'Linked to your PC') : hubCfg.role === 'hub' ? 'Finish PC setup' : 'PC → phone: set up'}</small></button>}
      </header>
      <nav className="nav" aria-label="Main">
        {nav.map(n => { const Icon = n.icon; const active = n.match.includes(page || 'home'); const waiting = n.to === 'orders' && requests.length > 0; return <button key={n.to} className={(active ? 'active' : '') + (waiting ? ' needs-look' : '') + (n.to === 'freezer' ? ' nav-freezer' : '')} aria-current={active ? 'page' : undefined} aria-label={waiting ? `${n.label}, ${requests.length} waiting` : undefined} onClick={() => go(n.to)}><Icon size={20} /><span>{n.label}</span>{waiting && <b className="nav-badge">{requests.length}</b>}</button>; })}
      </nav>
      {pendingChoice && page !== 'sync' && <div className="page-banner"><div className="banner warn"><div><strong>An update from your PC needs your choice.</strong><p>Some recipes were changed on both devices.</p></div><button className="primary" onClick={() => go('sync')}>Review</button></div></div>}
      {ready && <NewOrderBanner />}
      <main>{view}</main>
      <footer className="foot">Flour and Flame Bakery · v{APP_VERSION} · data stored on this device</footer>
      {toast && <div role="status" className={'toast' + (toast.error ? ' error' : '')}><span>{toast.message}</span><button aria-label="Dismiss" onClick={clearToast}><X size={16} /></button></div>}
    </div>
    {!baking && <SideArt />}
    </div>
  );
}
