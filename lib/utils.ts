import { format, parseISO, differenceInDays, addDays, isValid, parse } from 'date-fns';
import { DATE_FORMAT, DATE_FORMAT_SHORT } from './constants';

/**
 * Calculate refill date based on quantity and daily dosage
 */
export function calculateRefillDate(
  startDate: Date | string,
  quantity: number,
  dailyDosage: number,
  bufferDays: number = 3
): Date {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const daysSupply = Math.floor(quantity / dailyDosage);
  const refillDate = addDays(start, daysSupply - bufferDays);
  return refillDate;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, formatStr: string = DATE_FORMAT): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format date short (for mobile)
 */
export function formatDateShort(date: Date | string): string {
  return formatDate(date, DATE_FORMAT_SHORT);
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
