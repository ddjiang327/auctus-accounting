import { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../api/supabaseClient';
import { devAutoSignIn } from '../api/auctusApi';

type AuthMode = 'login' | 'signup';

interface AuthScreenProps {
  onAuthenticated: () => void;
  notice?: string | null;
}

function isDevAutoLoginDisabled() {
  return import.meta.env.VITE_AUCTUS_DISABLE_DEV_AUTO_LOGIN === 'true'
    || localStorage.getItem('auctus_disable_dev_auto_login') === 'true';
}

export function AuthScreen({ onAuthenticated, notice }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDevLogin() {
    setError(null);
    setLoading(true);
    try {
      const session = await devAutoSignIn();
      if (session) {
        onAuthenticated();
      } else {
        setError('Dev credentials not configured or invalid.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo-full.png" className="auth-logo-full" alt="Auctus" />
          <small>Sign in to your workspace</small>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              disabled={loading}
            />
          </div>

          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          {notice ? <div className="auth-error">{notice}</div> : null}
          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button className="link" onClick={() => setMode('signup')}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button className="link" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </div>

        {import.meta.env.DEV && !isDevAutoLoginDisabled() ? (
          <div className="auth-dev">
            <button className="btn-secondary" onClick={handleDevLogin} disabled={loading}>
              Dev Auto-Login
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
