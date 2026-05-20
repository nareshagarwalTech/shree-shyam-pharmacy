import ExcelJS from 'exceljs';
import { DailyEntryType } from './supabase';

export interface ParsedDailyEntry {
  entry_date: string;             // ISO YYYY-MM-DD
  entry_type: DailyEntryType;
  narration: string | null;
  txn_amount: number;
  settled_amount: number | null;
  account_name: string | null;          // 'CASH' | 'HDFC' | 'MAHESH BANK' — resolved to id on insert
  transfer_to_account_name: string | null;
  expense_category_slug: string | null; // resolved on insert
  sale_channel_slug: string | null;     // resolved on insert
  raw_row: number;
}

export interface ParsedDenomination {
  denomination: 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1;
  count: number;
}

export interface DailyBookParseResult {
  entries: ParsedDailyEntry[];
  denominations: ParsedDenomination[];
  /** Date used for DENOMINATION rows. Best-guess: the max entry_date in entries. */
  denomination_date: string | null;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  fileName: string;
}

// Excel 1900 serial → JS Date
function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

function readCell(cell: ExcelJS.Cell): Date | number | string {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'object' && 'result' in v && v.result != null) {
    const r = v.result;
    if (r instanceof Date || typeof r === 'number') return r;
    return String(r);
  }
  return cell.text ?? '';
}

function parseDate(raw: Date | number | string): string | null {
  if (raw instanceof Date && !isNaN(+raw)) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') return excelSerialToDate(raw).toISOString().slice(0, 10);
  if (!raw) return null;
  const s = String(raw).trim();
  // Pattern: "Wed May 13 2026 ..."
  const dateMatch = s.match(/[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}/);
  if (dateMatch) {
    const d = new Date(dateMatch[0]);
    if (!isNaN(+d)) return d.toISOString().slice(0, 10);
  }
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  // M/D/YYYY or M/D/YY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let y = parseInt(slash[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(parseInt(slash[1])).padStart(2, '0')}-${String(parseInt(slash[2])).padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(raw: Date | number | string): number | null {
  if (typeof raw === 'number') return raw;
  if (!raw) return null;
  const cleaned = String(raw).replace(/[₹,\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Map the ENTRY TYPE column value to our DailyEntryType
function mapEntryType(raw: string): DailyEntryType | null {
  const s = raw.trim().toUpperCase();
  if (s === 'SALE')          return 'sale';
  if (s === 'EXPENSE')       return 'expense';
  if (s === 'CASH COUNT')    return 'cash_count';
  if (s === 'BANK TRANSFER') return 'bank_transfer';
  if (s === 'CASH DEPOSIT')  return 'cash_deposit';
  return null;
}

// Map CATEGORY column value to either a sale channel slug or expense category slug
const SALE_CHANNEL_MAP: Record<string, string> = {
  POS: 'pos', QR: 'qr', ONLINE: 'online', CREDIT: 'credit', CASH: 'cash',
};
const EXPENSE_CATEGORY_MAP: Record<string, string> = {
  PURCHASE: 'purchase',
  SALARY: 'salary',
  RENT: 'rent',
  ELECTRICITY: 'electricity',
  TRANSPORT: 'transport',
  DIESEL: 'diesel',
  'HOME EXPENSES': 'home_expenses',
  'BANK CHARGES': 'bank_charges',
  OTHER: 'other',
  CLEARING: 'clearing',
  'CR.NOTE': 'cr_note',
  CRNOTE: 'cr_note',
};

// Normalize account name from PAYMENT MODE column ('CASH' | 'HDFC' | 'MAHESH BANK' | …)
const ACCOUNT_NAME_MAP: Record<string, string> = {
  CASH: 'CASH', HDFC: 'HDFC', 'MAHESH BANK': 'MAHESH BANK', MAHESH: 'MAHESH BANK',
};

export async function parseDailyBookFile(file: File): Promise<DailyBookParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const errors: DailyBookParseResult['errors'] = [];
  const warnings: DailyBookParseResult['warnings'] = [];

  // -----------------------------------------------------------------------
  // 1. DAILY ENTRY sheet
  // -----------------------------------------------------------------------
  const de = wb.getWorksheet('DAILY ENTRY');
  if (!de) {
    return {
      entries: [], denominations: [], denomination_date: null,
      errors: [{ row: 0, message: 'Sheet "DAILY ENTRY" not found' }],
      warnings: [], fileName: file.name,
    };
  }

  const entries: ParsedDailyEntry[] = [];
  for (let i = 4; i <= de.rowCount; i++) {
    const row = de.getRow(i);
    const rawType = String(readCell(row.getCell(2)) || '').trim();
    if (!rawType) continue;
    // Skip the legend / colour guide row
    if (rawType.length > 30 || rawType.startsWith('COLOUR') || rawType.includes('=')) continue;

    const entryType = mapEntryType(rawType);
    if (!entryType) {
      warnings.push({ row: i, message: `Unknown ENTRY TYPE "${rawType}" — skipped` });
      continue;
    }

    const date = parseDate(readCell(row.getCell(1)));
    if (!date) {
      errors.push({ row: i, message: `Bad date in column 1` });
      continue;
    }

    const narration = String(readCell(row.getCell(3)) || '').trim() || null;
    const txn = parseAmount(readCell(row.getCell(4)));
    if (txn == null || txn <= 0) {
      errors.push({ row: i, message: `Bad/zero TXN AMOUNT` });
      continue;
    }

    const settled = parseAmount(readCell(row.getCell(5)));
    const modeRaw = String(readCell(row.getCell(7)) || '').trim().toUpperCase();
    const catRaw  = String(readCell(row.getCell(8)) || '').trim().toUpperCase();

    const accountName = ACCOUNT_NAME_MAP[modeRaw] ?? (modeRaw || null);

    let saleChannelSlug: string | null = null;
    let expenseCategorySlug: string | null = null;
    if (entryType === 'sale') {
      saleChannelSlug = SALE_CHANNEL_MAP[catRaw] ?? null;
      if (!saleChannelSlug) {
        warnings.push({ row: i, message: `Unknown sale channel "${catRaw}" — defaulting to CASH` });
        saleChannelSlug = 'cash';
      }
    } else if (entryType === 'expense') {
      expenseCategorySlug = EXPENSE_CATEGORY_MAP[catRaw] ?? null;
      if (!expenseCategorySlug) {
        warnings.push({ row: i, message: `Unknown expense category "${catRaw}" — defaulting to OTHER` });
        expenseCategorySlug = 'other';
      }
    }

    entries.push({
      entry_date: date,
      entry_type: entryType,
      narration,
      txn_amount: txn,
      settled_amount: settled != null && settled !== txn ? settled : null,
      account_name: accountName,
      transfer_to_account_name: null,    // not separately specified in the source format
      expense_category_slug: expenseCategorySlug,
      sale_channel_slug: saleChannelSlug,
      raw_row: i,
    });
  }

  // -----------------------------------------------------------------------
  // 2. DENOMINATION sheet (optional)
  // -----------------------------------------------------------------------
  const denominations: ParsedDenomination[] = [];
  const dn = wb.getWorksheet('DENOMINATION');
  if (dn) {
    const denomValues: Record<string, 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1> = {
      '500': 500, '200': 200, '100': 100, '50': 50, '20': 20, '10': 10,
      '5': 5, '2': 2, '1': 1,
    };
    for (let i = 4; i <= 14; i++) {
      const row = dn.getRow(i);
      const labelRaw = String(readCell(row.getCell(1)) || '').trim();
      const numMatch = labelRaw.match(/\d+/);
      if (!numMatch) continue;
      const denom = denomValues[numMatch[0]];
      if (!denom) continue;
      const countRaw = readCell(row.getCell(2));
      const count = typeof countRaw === 'number' ? countRaw : parseInt(String(countRaw || '0'), 10);
      if (Number.isFinite(count) && count > 0) {
        denominations.push({ denomination: denom, count });
      }
    }
  }

  // Pick the latest date from entries as the denomination date
  const denominationDate = entries.length
    ? entries.reduce((max, e) => (e.entry_date > max ? e.entry_date : max), entries[0].entry_date)
    : null;

  return {
    entries,
    denominations,
    denomination_date: denominationDate,
    errors,
    warnings,
    fileName: file.name,
  };
}
