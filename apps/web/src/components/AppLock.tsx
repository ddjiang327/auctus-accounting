import { useState } from 'react';

interface AppLockProps {
  onUnlock: (pin: string) => boolean;
}

export function AppLock({ onUnlock }: AppLockProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (onUnlock(pin)) return;
    setError('Wrong PIN');
    setPin('');
  }

  return (
    <div className="lock-screen">
      <div className="lock-panel">
        <div className="lock-icon">A</div>
        <h1>Auctus Locked</h1>
        <p>Enter your app PIN to continue.</p>
        <input
          value={pin}
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="PIN"
          onChange={(event) => setPin(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        {error ? <span className="lock-error">{error}</span> : null}
        <button className="primary wide" onClick={submit}>Unlock</button>
      </div>
    </div>
  );
}
