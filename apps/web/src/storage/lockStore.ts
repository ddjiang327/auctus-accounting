const LOCK_KEY = 'auctus_app_lock_v1';

interface LockState {
  enabled: boolean;
  pin: string;
}

export function loadLockState(): LockState {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return { enabled: false, pin: '' };
    const parsed = JSON.parse(raw) as Partial<LockState>;
    return { enabled: !!parsed.enabled, pin: parsed.pin || '' };
  } catch {
    return { enabled: false, pin: '' };
  }
}

export function saveLockState(state: LockState) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(state));
}

export function clearLockState() {
  localStorage.removeItem(LOCK_KEY);
}
