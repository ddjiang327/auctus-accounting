import { BarChart3, BookOpenText, Home, List, LogOut, Plus, ReceiptText, Settings, ShoppingCart, SwitchCamera, Users, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';

type SyncState = 'idle' | 'syncing' | 'error';

export type ViewKey = 'dashboard' | 'activity' | 'sales' | 'purchases' | 'contacts' | 'accounts' | 'reports' | 'journals' | 'settings';

interface ShellProps {
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onAdd?: () => void;
  onAiEntry?: () => void;
  mode?: 'local' | 'cloud';
  businessName?: string;
  userRole?: string;
  syncState?: SyncState;
  syncError?: string | null;
  busyLabel?: string | null;
  onDismissSyncError?: () => void;
  onRetrySync?: () => void;
  onLogout?: () => void;
  onSwitchWorkspace?: () => void;
  children: ReactNode;
}

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: 'dashboard', label: 'Home', icon: <Home size={23} /> },
  { key: 'activity', label: 'Activity', icon: <List size={23} /> },
  { key: 'sales', label: 'Sales', icon: <ReceiptText size={23} /> },
  { key: 'purchases', label: 'Purchases', icon: <ShoppingCart size={23} /> },
  { key: 'contacts', label: 'Contacts', icon: <Users size={23} /> },
  { key: 'accounts', label: 'Accounts', icon: <WalletCards size={23} /> },
  { key: 'reports', label: 'Reports', icon: <BarChart3 size={23} /> },
  { key: 'journals', label: 'Journals', icon: <BookOpenText size={23} /> },
  { key: 'settings', label: 'Settings', icon: <Settings size={23} /> },
];

export function Shell({ view, onViewChange, onAdd, onAiEntry, mode, businessName, userRole, syncState, syncError, busyLabel, onDismissSyncError, onRetrySync, onLogout, onSwitchWorkspace, children }: ShellProps) {
  const active = navItems.find((item) => item.key === view) || navItems[0];
  return (
    <div className="viewport">
      <aside className="sidebar">
        <div className="brand-block">
          <img src="/logo-mark.svg" className="brand-mark" alt="Auctus" />
          <span>
            <b>Auctus</b>
            {mode !== 'local' && <small>{businessName ?? 'Cloud workspace'}{userRole ? ` · ${userRole}` : ''}</small>}
          </span>
          {mode === 'local' && <span className="mode-badge">Local</span>}
        </div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item.key} className={`side-nav-item ${view === item.key ? 'active' : ''}`} onClick={() => onViewChange(item.key)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {(onSwitchWorkspace || onLogout) && (
          <div className="side-nav" style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
            {onSwitchWorkspace && (
              <button className="side-nav-item" onClick={onSwitchWorkspace}>
                <SwitchCamera size={23} />
                <span>Switch workspace</span>
              </button>
            )}
            {onLogout && (
              <button className="side-nav-item" onClick={onLogout}>
                <LogOut size={23} />
                <span>Sign out</span>
              </button>
            )}
          </div>
        )}
      </aside>
      <section className="app-frame">
        <header className="top-bar">
          <div>
            <span className="top-kicker">Auctus Web</span>
            <h2>{active.label}</h2>
          </div>
          <div className="top-bar-end">
            {busyLabel ? <span className="sync-chip busy"><span className="inline-spinner" />{busyLabel}</span> : null}
            {syncState === 'syncing' && !busyLabel && <span className="sync-chip syncing">Syncing…</span>}
            {syncState === 'error' && syncError && (
              <button className="sync-chip error" onClick={onDismissSyncError} title={syncError}>
                Sync error ×
              </button>
            )}
            {onAiEntry ? (
              <button className="top-ai" onClick={onAiEntry} disabled={!!busyLabel} title="AI Quick Entry">
                ✨
              </button>
            ) : null}
            {onAdd ? (
              <button className="top-add" onClick={onAdd} disabled={!!busyLabel}>
                <Plus size={18} />
                <span>New Transaction</span>
              </button>
            ) : null}
          </div>
        </header>
        {syncState === 'error' && syncError ? (
          <div className="app-alert">
            <span>{syncError}</span>
            <div>
              {onRetrySync ? <button onClick={onRetrySync}>Retry</button> : null}
              {onDismissSyncError ? <button onClick={onDismissSyncError}>Dismiss</button> : null}
            </div>
          </div>
        ) : null}
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
