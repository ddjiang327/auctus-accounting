import type { LedgerData } from '@auctus/shared-types';

export function isDateLocked(data: LedgerData, dateStr: string) {
  return (data.periodLocks || []).some((lock) => dateStr <= lock.lockedThrough);
}

export function latestLockedThrough(data: LedgerData) {
  return (data.periodLocks || [])
    .map((lock) => lock.lockedThrough)
    .sort((a, b) => b.localeCompare(a))[0] || '';
}
