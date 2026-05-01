export function uid(prefix = 't') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function fmt(n: number) {
  const num = Number(n) || 0;
  return Math.abs(num).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMoney(n: number) {
  const num = Number(n) || 0;
  return (num < 0 ? '-$' : '$') + fmt(num);
}
