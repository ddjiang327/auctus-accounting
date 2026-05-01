import { normalizeData, loadLedgerData, resetLedgerData, saveLedgerData } from './ledgerStore';
import type { LedgerData } from '../domain/models';

export interface LedgerDataAdapter {
  load(): LedgerData;
  save(data: LedgerData): void;
  normalize(data: Partial<LedgerData> | null | undefined): LedgerData;
  reset(): LedgerData;
  exportBackup(data: LedgerData): Blob;
  importBackup(raw: string): LedgerData;
}

export const localLedgerDataAdapter: LedgerDataAdapter = {
  load: loadLedgerData,
  save: saveLedgerData,
  normalize: normalizeData,
  reset: resetLedgerData,
  exportBackup(data) {
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  },
  importBackup(raw) {
    return normalizeData(JSON.parse(raw) as Partial<LedgerData>);
  },
};

export const ledgerDataAdapter = localLedgerDataAdapter;
