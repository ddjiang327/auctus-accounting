import { useState } from 'react';
import { Plus, Building2, ChevronRight, LogOut } from 'lucide-react';
import type { BusinessSummary } from '../api/auctusApi';
import { createBusiness } from '../api/auctusApi';

interface WorkspaceSelectorProps {
  businesses: BusinessSummary[];
  onSelect: (business: BusinessSummary) => void;
  onLogout?: () => void;
}

export function WorkspaceSelector({ businesses, onSelect, onLogout }: WorkspaceSelectorProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const business = await createBusiness(newName.trim());
      setCreating(false);
      setNewName('');
      onSelect(business);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card workspace-card">
        <div className="auth-brand">
          <span className="brand-mark">A</span>
          <div>
            <b>Auctus</b>
            <small>Select a workspace</small>
          </div>
          {onLogout ? (
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          ) : null}
        </div>

        <div className="workspace-list">
          {businesses.length ? businesses.map((business) => (
            <button
              key={business.id}
              className="workspace-item"
              onClick={() => onSelect(business)}
            >
              <div className="workspace-icon">
                <Building2 size={20} />
              </div>
              <div className="workspace-info">
                <span className="workspace-name">{business.name}</span>
                <span className="workspace-meta">
                  {business.role} · {business.currency}
                </span>
              </div>
              <ChevronRight size={18} className="workspace-arrow" />
            </button>
          )) : (
            <div className="empty-card flat">
              No workspaces yet. Create one to start a cloud ledger.
            </div>
          )}
        </div>

        {creating ? (
          <form onSubmit={handleCreate} className="auth-form">
            <div className="field">
              <label htmlFor="ws-name">New workspace name</label>
              <input
                id="ws-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Business"
                required
                disabled={loading}
                autoFocus
              />
            </div>
            {error ? <div className="auth-error">{error}</div> : null}
            <div className="workspace-actions">
              <button type="button" className="btn-secondary" onClick={() => setCreating(false)} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        ) : (
          <button className="workspace-create" onClick={() => setCreating(true)}>
            <Plus size={18} />
            <span>Create new workspace</span>
          </button>
        )}
      </div>
    </div>
  );
}
