import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Auctus render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="auth-screen">
        <div className="auth-card recovery-card">
          <div className="auth-brand">
            <img src="/logo-mark.svg" className="brand-mark" alt="Auctus" />
            <div>
              <b>Auctus</b>
              <small>Something went wrong</small>
            </div>
          </div>
          <div className="auth-error">
            {this.state.error.message || 'The app hit an unexpected rendering error.'}
          </div>
          <div className="workspace-actions">
            <button className="btn-secondary" onClick={() => this.setState({ error: null })}>Try Again</button>
            <button className="btn-primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
