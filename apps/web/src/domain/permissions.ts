export type WorkspaceRole = 'owner' | 'admin' | 'bookkeeper' | 'viewer';

export type UiPermissions = {
  canWriteAccounting: boolean;
  canManageSettings: boolean;
  canManagePeriodLocks: boolean;
  canManageLedgerData: boolean;
};

const adminRoles = new Set<WorkspaceRole>(['owner', 'admin']);
const accountingWriteRoles = new Set<WorkspaceRole>(['owner', 'admin', 'bookkeeper']);

export function permissionsForRole(role: WorkspaceRole | null | undefined, mode: 'local' | 'cloud'): UiPermissions {
  const effectiveRole = mode === 'local' ? 'owner' : role;

  return {
    canWriteAccounting: !!effectiveRole && accountingWriteRoles.has(effectiveRole),
    canManageSettings: !!effectiveRole && adminRoles.has(effectiveRole),
    canManagePeriodLocks: !!effectiveRole && adminRoles.has(effectiveRole),
    canManageLedgerData: !!effectiveRole && adminRoles.has(effectiveRole),
  };
}
