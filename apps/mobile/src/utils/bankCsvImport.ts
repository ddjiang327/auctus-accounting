import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export interface ParsedBankCsvRow {
  date: string;
  description: string;
  amount: number;
  reference?: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fieldIndex(headers: string[], names: string[]) {
  const normalized = headers.map(normalizeHeader);
  return names.map(normalizeHeader).map((name) => normalized.indexOf(name)).find((idx) => idx >= 0) ?? -1;
}

function parseAmount(value: string) {
  const cleaned = value.replace(/\$/g, '').replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim();
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function parseDate(value: string) {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export function parseBankCsv(text: string): ParsedBankCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const dateIdx = fieldIndex(headers, ['date', 'transaction date', 'effective date', 'posted date']);
  const descIdx = fieldIndex(headers, ['description', 'narrative', 'details', 'transaction description', 'particulars']);
  const refIdx = fieldIndex(headers, ['reference', 'ref', 'code', 'transaction id']);
  const amountIdx = fieldIndex(headers, ['amount', 'transaction amount']);
  const debitIdx = fieldIndex(headers, ['debit', 'withdrawal', 'debits']);
  const creditIdx = fieldIndex(headers, ['credit', 'deposit', 'credits']);
  if (dateIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) return [];
  return rows.slice(1).map((row) => {
    const debit = debitIdx >= 0 ? parseAmount(row[debitIdx] || '') : 0;
    const credit = creditIdx >= 0 ? parseAmount(row[creditIdx] || '') : 0;
    const amount = amountIdx >= 0 ? parseAmount(row[amountIdx] || '') : credit - debit;
    return {
      date: parseDate(row[dateIdx] || ''),
      description: (descIdx >= 0 ? row[descIdx] : '') || (refIdx >= 0 ? row[refIdx] : '') || 'Bank transaction',
      amount,
      reference: refIdx >= 0 ? row[refIdx] : undefined,
    };
  }).filter((row) => row.date && Math.abs(row.amount) > 0.005);
}

export async function importBankStatementCsv() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
  return parseBankCsv(raw);
}
