import { HardDrive, Cloud } from 'lucide-react';

interface ModeSelectorProps {
  onChooseLocal: () => void;
  onChooseCloud: () => void;
}

export function ModeSelector({ onChooseLocal, onChooseCloud }: ModeSelectorProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card workspace-card">
        <div className="auth-brand">
          <img src="/logo-mark.svg" className="brand-mark" alt="Auctus" />
          <div>
            <b>Auctus</b>
            <small>Choose how to use the app</small>
          </div>
        </div>

        <div className="mode-option-list">
          <button className="mode-option" onClick={onChooseLocal}>
            <span className="workspace-icon"><HardDrive size={20} /></span>
            <div className="workspace-info">
              <span className="workspace-name">Use locally</span>
              <span className="workspace-meta">Free · No account · Data stays on this device</span>
            </div>
          </button>
          <button className="mode-option" onClick={onChooseCloud}>
            <span className="workspace-icon"><Cloud size={20} /></span>
            <div className="workspace-info">
              <span className="workspace-name">Sign in</span>
              <span className="workspace-meta">Cloud sync · Multi-device · Team access</span>
            </div>
          </button>
        </div>

        <p className="mode-selector-note">You can switch modes later in Settings.</p>
      </div>
    </div>
  );
}
