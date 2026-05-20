#!/usr/bin/env node
/**
 * Imports DELIVERYBOOK_SSP.xlsx → sales_transactions (with payment fields).
 *
 * Reads the "Deliveries" sheet, parses each row's bill + payment data,
 * matches customers by phone (auto-creates new ones), and upserts rows
 * by feed_no.
 *
 * Run AFTER applying migration 003.
 *   node scripts/import-delivery-book.mjs
 */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Excel 1900 date system → JS Date (replaces xlsx.SSF.parse_date_code).
function excelSerialToDate(serial) {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

// ExcelJS cell.value → Date | number | string. Unwraps formulas.
function readCell(cell) {
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

const FILE = 'C:/Users/nares/OneDrive/Documents/Shyam/DELIVERYBOOK_SSP.xlsx';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function loadEnv() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env.local');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseRupees(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[₹,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDate(raw) {
  if (raw instanceof Date && !isNaN(+raw)) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number') {
    return excelSerialToDate(raw).toISOString().slice(0, 10);
  }
  if (!raw) return null;
  const s = String(raw).trim();
  // "3-May-26"
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const d = parseInt(m[1], 10);
    const mo = months[m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()];
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10);
  }
  // "M/D/YY" or "M/D/YYYY"
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m2) {
    let y = parseInt(m2[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(parseInt(m2[1])).padStart(2, '0')}-${String(parseInt(m2[2])).padStart(2, '0')}`;
  }
  return null;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  return null;
}

function titleCase(s) {
  return String(s || '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function deriveFeedNo(billLabel, phone, deliveryDateISO) {
  const cleanLabel = String(billLabel || '').trim();
  // If it looks like a real bill number (has digits + letters), use it
  if (/^[A-Z]{1,4}\d{3,}$/i.test(cleanLabel)) return cleanLabel;
  // Otherwise (OLD or blank), generate stable synthetic key
  const stamp = (deliveryDateISO || '').replace(/-/g, '');
  return `OLD-${phone}-${stamp}`;
}

// ---------------------------------------------------------------------------
// Read the sheet — header is at row 3 (1-indexed); data starts row 4
// ---------------------------------------------------------------------------
async function readDeliverySheet() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('Deliveries');
  if (!sheet) throw new Error('Sheet "Deliveries" not found');

  // Read all rows as an array-of-arrays (1-indexed, like exceljs).
  // Header banner spans rows 1-2; the real column header is row 3; data starts row 4.
  // Column layout (1-indexed): 1:S.No 2:Date 3:Bill No 4:Customer Name 5:Unique Key
  // 6:Phone 7:Bill Amt 8:Prev Pending 9:Total Due 10:Change to Give Boy 11:Mode
  // 12:Customer Pays 13:Balance Left 14:Payment Date 15:PendingMark 16:RunCount
  const rowCount = sheet.rowCount;

  const out = [];
  for (let i = 4; i <= rowCount; i++) {
    const row = sheet.getRow(i);
    if (!row || row.cellCount === 0) continue;
    const sno = readCell(row.getCell(1));
    const dateRaw = readCell(row.getCell(2));
    const billLabel = String(readCell(row.getCell(3)) || '').trim();
    const customerNameRaw = String(readCell(row.getCell(4)) || '').trim();
    const uniqueKey = String(readCell(row.getCell(5)) || '').trim();
    const phoneRaw = String(readCell(row.getCell(6)) || '').trim();
    const billAmt = parseRupees(readCell(row.getCell(7)));
    const prevPending = parseRupees(readCell(row.getCell(8)));
    const totalDue = parseRupees(readCell(row.getCell(9)));
    const changeGiven = parseRupees(readCell(row.getCell(10)));
    const modeRaw = String(readCell(row.getCell(11)) || '').trim().toLowerCase();
    const customerPaid = parseRupees(readCell(row.getCell(12)));
    const balanceLeft = parseRupees(readCell(row.getCell(13)));
    const paymentDateRaw = readCell(row.getCell(14));

    if (sno === 'TOTALS' || customerNameRaw === '' || customerNameRaw === 'TOTALS') continue;

    const phone = normalizePhone(phoneRaw || uniqueKey);
    if (!phone) continue;

    const deliveryDate = parseDate(dateRaw);
    if (!deliveryDate) continue;

    const paymentMode =
      modeRaw === 'cash' ? 'cash' :
      modeRaw === 'online' ? 'online' :
      modeRaw === '' || modeRaw === '-' || modeRaw === '—' ? null :
      modeRaw === 'credit' ? 'credit' : null;

    const explicitPayDate = parseDate(paymentDateRaw);
    // If money was paid but no explicit payment_date column, default to delivery_date.
    const paymentDate = explicitPayDate || (customerPaid > 0 ? deliveryDate : null);

    out.push({
      feed_no:           deriveFeedNo(billLabel, phone, deliveryDate),
      bill_no_label:     billLabel || null,
      delivery_date:     deliveryDate,
      feed_date:         deliveryDate,                  // alias (compute reminder etc.)
      customer_phone:    phone,
      customer_name_raw: titleCase(customerNameRaw),
      net_amount:        billAmt || 0,
      prev_pending:      prevPending || 0,
      total_due:         totalDue || (billAmt + prevPending),
      change_given:      changeGiven || 0,
      payment_mode:      paymentMode,
      customer_paid:     customerPaid || 0,
      balance_left:      balanceLeft != null ? balanceLeft : (totalDue - customerPaid),
      payment_date:      paymentDate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Match customers by phone, auto-create new ones
// ---------------------------------------------------------------------------
async function resolveCustomers(rows) {
  const phones = Array.from(new Set(rows.map((r) => r.customer_phone)));
  const { data: existing, error } = await sb
    .from('customers')
    .select('id, phone, name')
    .in('phone', phones)
    .eq('is_active', true);
  if (error) throw error;

  const phoneToId = new Map((existing || []).map((c) => [c.phone, c.id]));

  // Find phones not in master → auto-create
  const missing = phones.filter((p) => !phoneToId.has(p));
  if (missing.length) {
    const newRows = missing.map((p) => {
      const sample = rows.find((r) => r.customer_phone === p);
      return {
        phone: p,
        name: sample.customer_name_raw,
        source: 'sale_import',
        notes: `auto-created from delivery book`,
      };
    });
    console.log(`🆕  Auto-creating ${newRows.length} new customers from delivery book…`);
    const { data: inserted, error: insErr } = await sb
      .from('customers').insert(newRows).select('id, phone');
    if (insErr) throw insErr;
    for (const c of inserted || []) phoneToId.set(c.phone, c.id);

    // Tag with 'regular' group
    const { data: regGroup } = await sb.from('groups').select('id').eq('slug', 'regular').single();
    if (regGroup) {
      const links = (inserted || []).map((c) => ({ customer_id: c.id, group_id: regGroup.id }));
      await sb.from('customer_groups').upsert(links, {
        onConflict: 'customer_id,group_id', ignoreDuplicates: true,
      });
    }
  }

  return phoneToId;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═'.repeat(70));
  console.log('  Shree Shyam Pharmacy — Delivery Book Import');
  console.log('═'.repeat(70));

  // 1. Smoke-test that migration 003 has been applied
  const { error: probeErr } = await sb
    .from('sales_transactions').select('customer_paid', { head: true, count: 'exact' });
  if (probeErr) {
    console.error('❌ Migration 003 not applied:', probeErr.message);
    console.error('   Paste supabase/migrations/003_deliveries_and_payments.sql first.');
    process.exit(1);
  }

  // 2. Read sheet
  console.log(`📂  Reading ${FILE}`);
  const rows = await readDeliverySheet();
  console.log(`   → ${rows.length} delivery rows parsed`);

  if (!rows.length) {
    console.log('No rows to import.');
    return;
  }

  // 3. Resolve customers
  const phoneToId = await resolveCustomers(rows);

  // 4. Track this batch
  const { data: batch } = await sb.from('import_batches').insert({
    filename: 'DELIVERYBOOK_SSP.xlsx',
    source_type: 'daily_sales',
    row_count: rows.length,
  }).select().single();

  // 5. Upsert sales_transactions
  const records = rows.map((r) => ({
    feed_no:             r.feed_no,
    feed_date:           r.feed_date,
    delivery_date:       r.delivery_date,
    bill_no_label:       r.bill_no_label,
    customer_phone:      r.customer_phone,
    customer_id:         phoneToId.get(r.customer_phone) || null,
    customer_name_raw:   r.customer_name_raw,
    net_amount:          r.net_amount,
    prev_pending:        r.prev_pending,
    total_due:           r.total_due,
    customer_paid:       r.customer_paid,
    change_given:        r.change_given,
    balance_left:        r.balance_left,
    payment_mode:        r.payment_mode,
    payment_date:        r.payment_date,
    match_confidence:    'exact',
    import_batch_id:     batch?.id || null,
  }));

  console.log(`💾  Upserting ${records.length} sales_transactions…`);
  let saved = 0, errored = 0;
  for (let i = 0; i < records.length; i += 50) {
    const chunk = records.slice(i, i + 50);
    const { error } = await sb.from('sales_transactions').upsert(chunk, {
      onConflict: 'feed_no', ignoreDuplicates: false,
    });
    if (error) { errored += chunk.length; console.error('   chunk error:', error.message); }
    else saved += chunk.length;
  }

  if (batch?.id) {
    await sb.from('import_batches').update({
      success_count: saved, error_count: errored,
    }).eq('id', batch.id);
  }

  console.log(`\n✓ Saved: ${saved}`);
  if (errored) console.log(`⚠ Errored: ${errored}`);

  // 6. Quick verification
  const { count: totalSales } = await sb.from('sales_transactions').select('*', { count: 'exact', head: true });
  const { data: pending } = await sb.from('pending_dues').select('outstanding');
  const totalOutstanding = (pending || []).reduce((s, r) => s + Number(r.outstanding || 0), 0);
  console.log(`\nDB now has ${totalSales} sales_transactions.`);
  console.log(`Total outstanding across all customers: ₹${totalOutstanding.toLocaleString('en-IN')}`);
  console.log(`Pending customer count: ${(pending || []).length}`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
