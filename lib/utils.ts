import { format, parseISO, differenceInDays, isValid, parse } from 'date-fns';
import { DATE_FORMAT, DATE_FORMAT_SHORT } from './constants';

/**
 * Format date for display
 */
export function formatDate(date: Date | string, formatStr: string = DATE_FORMAT): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format date short (for mobile) — month as text to avoid dd/mm vs mm/dd confusion
 */
export function formatDateShort(date: Date | string): string {
  return formatDate(date, DATE_FORMAT_SHORT);
}

/**
 * Convert "YYYY-MM" (used in monthly_collection.month_label) into a readable
 * month name like "Apr 2026". Always uses month-as-text to avoid the dd/mm
 * vs mm/dd ambiguity between Indian and US numeric formats.
 */
export function formatMonthLabel(yyyymm: string): string {
  if (!yyyymm) return '';
  const [yearStr, monthStr] = yyyymm.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month || month < 1 || month > 12) return yyyymm;
  // parse to a real date so date-fns handles locale + format consistently
  return format(new Date(year, month - 1, 1), 'MMM yyyy'); // -> "Apr 2026"
}

/**
 * Compact month for narrow chart axes — "Apr '26".
 */
export function formatMonthShort(yyyymm: string): string {
  if (!yyyymm) return '';
  const [yearStr, monthStr] = yyyymm.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month || month < 1 || month > 12) return yyyymm;
  return format(new Date(year, month - 1, 1), "MMM ''yy"); // -> "Apr '26"
}

/**
 * Get days until a date (negative if past)
 */
export function getDaysUntil(date: Date | string): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return differenceInDays(d, today);
}

/**
 * Get human-readable days text
 */
export function getDaysText(days: number): string {
  if (days < 0) {
    const overdue = Math.abs(days);
    return `${overdue} day${overdue > 1 ? 's' : ''} overdue`;
  }
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/**
 * Parse date from various formats (for import)
 */
export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Try ISO format first
  const isoDate = parseISO(dateStr);
  if (isValid(isoDate)) return isoDate;
  
  // Try common Indian formats
  const formats = [
    'dd-MM-yyyy',
    'dd/MM/yyyy',
    'dd-MM-yy',
    'dd/MM/yy',
    'yyyy-MM-dd',
    'd-M-yyyy',
    'd/M/yyyy',
  ];
  
  for (const fmt of formats) {
    try {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Format date for database (ISO string, date only)
 */
export function toISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get today's date as ISO string
 */
export function todayISO(): string {
  return toISODateString(new Date());
}

/**
 * Debounce function for search
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate a simple unique ID (for temporary use)
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: any): boolean {
  if (!obj) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}
