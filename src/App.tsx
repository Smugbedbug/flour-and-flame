import { BookOpen, Briefcase, ChefHat, Database, HardDriveDownload, Home as HomeIcon, X } from 'lucide-react';
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
import { useAutoCheck, useHubActions, usePendingChoice } from './hubState';
import { Send } from 'lucide-react';

export function App() {
  const { ready, fatal, mode, setMode, toast, clearToast } = useApp();
  const route = useRoute();
  const online = useOnline();
  const hubCfg = useHubConfig();
  const pendingChoice = usePendingChoice();
  const { send, sending, unsent, checking } = useHubActions();
  useAutoCheck(ready);
  const [page, arg] = route;

  useEffect(() => { if (!toast || toast.error) return; const h = setTimeout(clearToast, 5000); return () => clearTimeout(h); }, [toast, clearToast]);

  const nav = mode === 'personal'
    ? [{ to: 'home', label: 'Home', icon: HomeIcon, match: ['home'] }, { to: 'recipes', label: 'Recipes', icon: BookOpen, match: ['recipes', 'recipe', 'edit', 'new', 'import', 'bake'] }, { to: 'backup', label: 'Backup', icon: HardDriveDownload, match: ['backup'] }]
    : [{ to: 'home', label: 'Dashboard', icon: HomeIcon, match: ['home'] }, { to: 'recipes', label: 'Recipes', icon: BookOpen, match: ['recipes', 'recipe', 'edit', 'new', 'import', 'bake'] }, { to: 'ingredients', label: 'Prices', icon: Database, match: ['ingredients'] }, { to: 'backup', label: 'Backup', icon: HardDriveDownload, match: ['backup'] }];

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
    case 'pair': view = <SyncView key={arg} pairId={arg} />; break;
    default: view = <Home />;
  }
  const baking = page === 'bake';

  return (
    <div className={'shell' + (baking ? ' baking' : '')}>
      <header className="topbar">
        <button className="logo-btn" onClick={() => go('home')} aria-label="Flour and Flame home"><CompactLogo /></button>
        <div className="mode-switch" role="group" aria-label="Mode">
          <button className={mode === 'personal' ? 'on' : ''} aria-pressed={mode === 'personal'} onClick={() => setMode('personal')}><ChefHat size={15} /> <span>Baking</span></button>
          <button className={mode === 'business' ? 'on' : ''} aria-pressed={mode === 'business'} onClick={() => setMode('business')}><Briefcase size={15} /> <span>Business</span></button>
        </div>
        {hubCfg.role === 'hub' && hubCfg.lastPublishedAt
          ? <button className={'send-btn' + (unsent ? ' unsent' : '')} disabled={sending || !online} onClick={() => void send()} title={unsent ? 'You have changes not sent to your phone' : 'Phone is up to date'}><Send size={16} /><span>{sending ? 'Sending…' : 'Send to phone'}</span>{unsent && <i className="dot" aria-label="unsent changes" />}</button>
          : <button className={'sync-state ' + (online ? '' : 'offline')} title="PC → phone updates" onClick={() => go('sync')}>{online ? '● Saved locally' : '● Offline · saved locally'}<small>{hubCfg.role === 'receiver' && hubCfg.gistId ? (checking ? 'Checking for PC updates…' : 'Linked to your PC') : hubCfg.role === 'hub' ? 'Finish PC setup' : 'PC → phone: set up'}</small></button>}
      </header>
      <nav className="nav" aria-label="Main">
        {nav.map(n => { const Icon = n.icon; const active = n.match.includes(page || 'home'); return <button key={n.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => go(n.to)}><Icon size={20} /><span>{n.label}</span></button>; })}
      </nav>
      {pendingChoice && page !== 'sync' && <div className="page-banner"><div className="banner warn"><div><strong>An update from your PC needs your choice.</strong><p>Some recipes were changed on both devices.</p></div><button className="primary" onClick={() => go('sync')}>Review</button></div></div>}
      <main>{view}</main>
      <footer className="foot">Flour and Flame Bakery · v{APP_VERSION} · data stored on this device</footer>
      {toast && <div role="status" className={'toast' + (toast.error ? ' error' : '')}><span>{toast.message}</span><button aria-label="Dismiss" onClick={clearToast}><X size={16} /></button></div>}
    </div>
  );
}
