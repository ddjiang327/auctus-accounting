import { createContext, useContext, type ReactNode } from 'react';

type AppAlertsContextValue = {
  reportError: (error: unknown) => void;
};

const AppAlertsContext = createContext<AppAlertsContextValue | null>(null);

export function AppAlertsProvider({ reportError, children }: { reportError: (error: unknown) => void; children: ReactNode }) {
  return (
    <AppAlertsContext.Provider value={{ reportError }}>
      {children}
    </AppAlertsContext.Provider>
  );
}

export function useAppAlerts() {
  const ctx = useContext(AppAlertsContext);
  return ctx ?? { reportError: () => {} };
}

