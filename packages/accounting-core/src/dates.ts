import type { PaymentTerms, Period, RecurringFrequency } from '@auctus/shared-types';

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr || todayStr());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dueDateForTerms(dateStr: string, terms: PaymentTerms) {
  const days: Record<PaymentTerms, number> = { due_on_receipt: 0, net_7: 7, net_14: 14, net_30: 30, net_60: 60, custom: 0 };
  return addDays(dateStr, days[terms]);
}

export function periodRange(period: Period, ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  let start: Date;
  let end: Date;
  if (period === 'today') {
    start = new Date(d);
    end = addDate(start, 1);
  } else if (period === 'week') {
    start = new Date(d);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = addDate(start, 7);
  } else if (period === 'month') {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  } else if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3);
    start = new Date(d.getFullYear(), q * 3, 1);
    end = new Date(d.getFullYear(), q * 3 + 3, 1);
  } else if (period === 'year') {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear() + 1, 0, 1);
  } else {
    start = new Date(0);
    end = new Date(8640000000000000);
  }
  return [start, end] as const;
}

function addDate(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function inRange(dateStr: string, range: readonly [Date, Date]) {
  const t = new Date(dateStr).getTime();
  return t >= range[0].getTime() && t < range[1].getTime();
}

export function advanceRecurringDate(dateStr: string, frequency: RecurringFrequency): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'fortnightly') d.setDate(d.getDate() + 14);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
