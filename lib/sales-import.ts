import * as XLSX from 'xlsx';

export interface ParsedSale {
  feed_no: string;
  feed_date: string | null;
  customer_phone: string | null;
  customer_name_raw: string;
  address_raw: string | null;
  net_amount: number | null;
  for_days: number | null;
  raw_row: number;
}

export interface SalesParseResult {
  rows: ParsedSale[];
  errors: Array<{ row: number; message: string }>;
  fileName: string;
  totalRowsInSheet: number;
}

// Column-name aliases (case-insensitive) from various billing system exports
const ALIASES: Record<keyof Omit<ParsedSale, 'raw_row'>, string[]> = {
  feed_no:           ['feedno', 'feed_no', 'bill_no', 'billno', 'receipt', 'invoice_no'],
  feed_date:         ['feeddate', 'feed_date', 'bill_date', 'billdate', 'date', 'invoice_date'],
  customer_phone:    ['phone', 'mobile', 'cell', 'contact', 'mobile_no'],
  customer_name_raw: ['cust', 'customer', 'customer_name', 'name', 'party'],
  address_raw:       ['custad4', 'cust_ad4', 'address', 'addr', 'custaddress'],
  net_amount:        ['netamt', 'net_amt', 'net_amount', 'amount', 'total', 'bill_amount'],
  for_days:          ['fordays', 'for_days', 'days', 'daycount', 'duration', 'daysupply'],
};

function normKey(s: string) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
}

function mapHeader(rawHeader: string[]): Record<keyof Omit<ParsedSale, 'raw_row'>, string | null> {
  const lookup: Record<string, string> = {};
  rawHeader.forEach((h) => (lookup[normKey(h)] = h));
  const out: any = {};
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    out[canonical] = null;
    for (const alias of aliases) {
      if (lookup[alias]) {
        out[canonical] = lookup[alias];
        break;
      }
    }
  }
  return out;
}

export function normalizePhone(raw: any): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  return null;
}

export function parseFeedDate(raw: any): string | null {
  if (raw instanceof Date && !isNaN(+raw)) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString().slice(0, 10);
  }
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const mo = String(parseInt(m[1])).padStart(2, '0');
    const d = String(parseInt(m[2])).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return s.slice(0, 10);
  const m3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m3) {
    let y = parseInt(m3[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(parseInt(m3[2])).padStart(2, '0')}-${String(parseInt(m3[1])).padStart(2, '0')}`;
  }
  return null;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export async function parseSalesFile(file: File): Promise<SalesParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: '',
    raw: false,
  });

  if (rawRows.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'Sheet is empty' }], fileName: file.name, totalRowsInSheet: 0 };
  }

  const header = Object.keys(rawRows[0]);
  const headerMap = mapHeader(header);

  // Required
  const missing = (['feed_no', 'feed_date', 'customer_phone'] as const).filter(
    (k) => !headerMap[k],
  );
  if (missing.length) {
    return {
      rows: [],
      errors: [{
        row: 0,
        message: `Missing required columns: ${missing.join(', ')}. Found: ${header.join(', ')}`,
      }],
      fileName: file.name,
      totalRowsInSheet: rawRows.length,
    };
  }

  const rows: ParsedSale[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  rawRows.forEach((r, idx) => {
    const rowNum = idx + 2;   // + header
    const feedNo = String(r[headerMap.feed_no!] || '').trim();
    if (!feedNo) {
      errors.push({ row: rowNum, message: 'Missing feed / bill number' });
      return;
    }
    const feedDate = parseFeedDate(r[headerMap.feed_date!]);
    if (!feedDate) {
      errors.push({ row: rowNum, message: `Could not parse feed date: "${r[headerMap.feed_date!]}"` });
      return;
    }
    const phone = normalizePhone(r[headerMap.customer_phone!]);
    if (!phone) {
      errors.push({ row: rowNum, message: `Invalid phone: "${r[headerMap.customer_phone!]}"` });
      return;
    }
    rows.push({
      feed_no: feedNo,
      feed_date: feedDate,
      customer_phone: phone,
      customer_name_raw: titleCase(String(r[headerMap.customer_name_raw!] || '').trim()),
      address_raw: headerMap.address_raw ? String(r[headerMap.address_raw] || '').trim() || null : null,
      net_amount: headerMap.net_amount ? parseFloat(r[headerMap.net_amount]) || null : null,
      for_days: headerMap.for_days ? parseInt(r[headerMap.for_days], 10) || null : null,
      raw_row: rowNum,
    });
  });

  return { rows, errors, fileName: file.name, totalRowsInSheet: rawRows.length };
}

// --- Fuzzy matching ------------------------------------------------------
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const A = a.toUpperCase().replace(/[^A-Z ]/g, '').trim();
  const B = b.toUpperCase().replace(/[^A-Z ]/g, '').trim();
  if (!A || !B) return 0;
  const maxLen = Math.max(A.length, B.length);
  return 1 - levenshtein(A, B) / maxLen;
}

export const FUZZY_THRESHOLD = 0.8;

export type MatchConfidence = 'exact' | 'fuzzy' | 'auto_created';

export interface MatchedSale extends ParsedSale {
  resolved_customer_id: string | null;
  match_confidence: MatchConfidence;
  fuzzy_match_score: number | null;
  matched_customer_name: string | null;    // name we matched against (if any)
}

export function matchSales(
  parsed: ParsedSale[],
  customers: Array<{ id: string; phone: string; name: string }>,
): MatchedSale[] {
  const byPhone = new Map(customers.map((c) => [c.phone, c]));
  return parsed.map((s) => {
    const phone = s.customer_phone!;
    const exact = byPhone.get(phone);
    if (exact) {
      return {
        ...s,
        resolved_customer_id: exact.id,
        match_confidence: 'exact',
        fuzzy_match_score: null,
        matched_customer_name: exact.name,
      };
    }
    // Fuzzy against all customers
    let best: { c: typeof customers[number]; score: number } | null = null;
    for (const c of customers) {
      const sim = nameSimilarity(c.name, s.customer_name_raw);
      if (sim >= FUZZY_THRESHOLD && (!best || sim > best.score)) {
        best = { c, score: sim };
      }
    }
    if (best) {
      return {
        ...s,
        resolved_customer_id: best.c.id,
        match_confidence: 'fuzzy',
        fuzzy_match_score: +best.score.toFixed(2),
        matched_customer_name: best.c.name,
      };
    }
    return {
      ...s,
      resolved_customer_id: null,
      match_confidence: 'auto_created',
      fuzzy_match_score: null,
      matched_customer_name: null,
    };
  });
}
