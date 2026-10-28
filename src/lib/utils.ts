/**
 * Utility functions for formatting and values.
 */

/**
 * Formats a cent value (integer) to Brazilian Real currency (R$).
 */
export function formatCurrency(cents: number): string {
  const isNegative = cents < 0;
  const absValue = Math.abs(cents) / 100;
  const formatted = absValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}R$ ${formatted}`;
}

/**
 * Formats a YYYY-MM-DD date to DD/MM/YYYY.
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Parses a currency input string (e.g. "1.234,56" or "1234.56" or "100") into integer cents.
 */
export function parseAmountToCents(val: string): number {
  if (!val) return 0;
  let clean = val.replace(/[^\d.,-]/g, '');
  if (clean.includes(',')) {
    // pt-BR: "." is the thousands separator and "," the decimal separator
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = clean.split('.').length - 1;
    // "1.234.567" or "1.234" are thousands; "1234.56" or "12.5" are decimals
    if (dots > 1 || (dots === 1 && /\.\d{3}$/.test(clean))) {
      clean = clean.replace(/\./g, '');
    }
  }
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Merges class names helper.
 */
export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
