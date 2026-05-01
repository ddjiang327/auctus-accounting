import { BarChart3, BookOpenText, Home, List, Plus, ReceiptText, Settings, ShoppingCart, Users, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';

export type ViewKey = 'dashboard' | 'activity' | 'sales' | 'purchases' | 'contacts' | 'accounts' | 'reports' | 'journals' | 'settings';

interface ShellProps {
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  onAdd: () => void;
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

export function Shell({ view, onViewChange, onAdd, children }: ShellProps) {
  const active = navItems.find((item) => item.key === view) || navItems[0];
  return (
    <div className="viewport">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">A</span>
          <span>
            <b>Auctus</b>
            <small>AUD workspace</small>
          </span>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item.key} className={`side-nav-item ${view === item.key ? 'active' : ''}`} onClick={() => onViewChange(item.key)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <section className="app-frame">
        <header className="top-bar">
          <div>
            <span className="top-kicker">Auctus Web</span>
            <h2>{active.label}</h2>
          </div>
          <button className="top-add" onClick={onAdd}>
            <Plus size={18} />
            <span>New Transaction</span>
          </button>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
