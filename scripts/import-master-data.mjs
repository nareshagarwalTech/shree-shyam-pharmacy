#!/usr/bin/env node
/**
 * One-time import:
 *   - CUSCELLDATA.xlsx              → customers master (404 rows)
 *   - CUSTOMERREMINDER.DATA.xlsx    → sales_transactions (85 rows)
 *   - REMINDER DATA.xlsx             → sales_transactions (74 rows, deduped by feed_no)
 *
 * Phone is the natural key. Fuzzy name matching when a phone matches master
 * but name differs; unknown phones auto-create a customer (source='sale_import').
 * Every imported customer is tagged into the 'regular' group.
 *
 * Prerequisites:
 *   - Supabase schema already migrated (run supabase/migrations/001_groups_and_sales.sql first)
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *     (service_role is required to bypass RLS and bulk-insert)
 *
 * Run:   node scripts/import-master-data.mjs
 */

import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ONEDRIVE_DIR = 'C:/Users/nares/OneDrive/Documents/Shyam';
const MASTER_FILE  = path.join(ONEDRIVE_DIR, 'CUSCELLDATA.xlsx');
const SALES_FILES  = [
    path.join(ONEDRIVE_DIR, 'CUSTOMERREMINDER.DATA.xlsx'),
    path.join(ONEDRIVE_DIR, 'REMINDER DATA.xlsx'),
];

const FUZZY_THRESHOLD = 0.80;  // 0-1; names above this are considered the same person

// ---------------------------------------------------------------------------
// Env loading (tiny, no dep)
// ---------------------------------------------------------------------------
function loadEnv() {
    const p = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(p)) return;
    const content = fs.readFileSync(p, 'utf8');
    for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        const [, key, valRaw] = m;
        const val = valRaw.replace(/^["'](.*)["']$/, '$1');
        if (!process.env[key]) process.env[key] = val;
    }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}
if (SUPABASE_URL.includes('placeholder')) {
    console.error('❌ .env.local still has placeholder Supabase URL. Set real values first.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizePhone(raw) {
    if (raw == null) return null;
    const digits = String(raw).replace(/\D/g, '');
    // Strip leading country code (91) if present
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0'))  return digits.slice(1);
    if (digits.length === 10) return digits;
    return null;  // invalid
}

function normalizeName(raw) {
    if (raw == null) return '';
    return String(raw).trim().replace(/\s+/g, ' ');
}

function titleCase(s) {
    return s.toLowerCase().split(' ')
        .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)
        .join(' ')
        .replace(/\bJi\b/g, 'ji')
        .replace(/\bDr\b/g, 'Dr.');
}

// Levenshtein distance (iterative, memory-efficient)
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        let curr = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i-1] === b[j-1] ? 0 : 1;
            curr[j] = Math.min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + cost);
        }
        for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
}

function similarity(a, b) {
    const A = a.toUpperCase().replace(/[^A-Z ]/g, '').trim();
    const B = b.toUpperCase().replace(/[^A-Z ]/g, '').trim();
    if (!A || !B) return 0;
    const maxLen = Math.max(A.length, B.length);
    const dist = levenshtein(A, B);
    return 1 - (dist / maxLen);
}

// Parse various Indian date formats from Excel: "1/28/26", "2/4/26", Date objects
function parseFeedDate(raw) {
    if (raw instanceof Date && !isNaN(raw)) {
        return raw.toISOString().slice(0, 10);
    }
    if (typeof raw === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(raw);
        if (d) {
            const iso = new Date(Date.UTC(d.y, d.m - 1, d.d));
            return iso.toISOString().slice(0, 10);
        }
    }
    if (!raw) return null;
    const s = String(raw).trim();
    // M/D/YY or M/D/YYYY — pharmacy files use this
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        let [, mo, d, y] = m;
        y = parseInt(y, 10);
        if (y < 100) y += 2000;
        const iso = `${y}-${String(parseInt(mo)).padStart(2, '0')}-${String(parseInt(d)).padStart(2, '0')}`;
        return iso;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Read Excel files
// ---------------------------------------------------------------------------
function readMaster() {
    console.log(`📂  Reading master: ${MASTER_FILE}`);
    const wb = XLSX.read(fs.readFileSync(MASTER_FILE), { cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    const out = [];
    const seen = new Set();
    for (const r of rows) {
        const name  = normalizeName(r.tcName);
        const phone = normalizePhone(r.Cell);
        if (!name || !phone) continue;
        if (seen.has(phone)) continue;   // drop dup phones in master
        seen.add(phone);
        out.push({ name: titleCase(name), phone });
    }
    console.log(`   → ${out.length} unique customers`);
    return out;
}

function readSales() {
    const all = new Map();   // feed_no → sale
    for (const file of SALES_FILES) {
        console.log(`📂  Reading sales:  ${file}`);
        const wb = XLSX.read(fs.readFileSync(file), { cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
        for (const r of rows) {
            const feedNo = String(r.FeedNo || '').trim();
            if (!feedNo) continue;
            if (all.has(feedNo)) continue;   // dedup across files
            const sale = {
                feed_no:            feedNo,
                feed_date:          parseFeedDate(r.FeedDate),
                customer_phone:     normalizePhone(r.Phone),
                customer_name_raw:  normalizeName(r.Cust),
                address_raw:        normalizeName(r.CustAd4) || null,
                net_amount:         parseFloat(r.NetAmt) || null,
                for_days:           parseInt(r.ForDays, 10) || null,
            };
            if (!sale.feed_date || !sale.customer_phone) continue;
            all.set(feedNo, sale);
        }
    }
    console.log(`   → ${all.size} unique sales (deduped by FeedNo)`);
    return [...all.values()];
}

// ---------------------------------------------------------------------------
// Import master customers
// ---------------------------------------------------------------------------
async function importMaster(masterRows, batchId) {
    console.log(`\n🧑‍🤝‍🧑  Importing ${masterRows.length} master customers…`);

    // Fetch existing to detect duplicates (safe re-run)
    const { data: existing } = await supabase
        .from('customers')
        .select('id,phone,name')
        .eq('is_active', true);
    const existingByPhone = new Map((existing || []).map(c => [c.phone, c]));

    const toInsert = [];
    const toUpdate = [];
    for (const r of masterRows) {
        const prev = existingByPhone.get(r.phone);
        if (prev) {
            // keep existing id; update name if master has a better one and prev is shorter/simpler
            if (prev.name !== r.name && r.name.length > 2) {
                toUpdate.push({ id: prev.id, name: r.name });
            }
        } else {
            toInsert.push({
                name:   r.name,
                phone:  r.phone,
                source: 'master_import',
            });
        }
    }

    let inserted = 0;
    if (toInsert.length) {
        // Chunk to stay under payload limits
        for (let i = 0; i < toInsert.length; i += 200) {
            const chunk = toInsert.slice(i, i + 200);
            const { error } = await supabase.from('customers').insert(chunk);
            if (error) {
                console.error('   ⚠️ insert error:', error.message);
                break;
            }
            inserted += chunk.length;
            process.stdout.write(`   ↳ ${inserted}/${toInsert.length}\r`);
        }
    }
    console.log(`\n   ✓ Inserted ${inserted} new customers.`);
    console.log(`   ✓ Skipped ${masterRows.length - toInsert.length} existing (${toUpdate.length} names refreshed).`);

    for (const u of toUpdate) {
        await supabase.from('customers').update({ name: u.name }).eq('id', u.id);
    }
    return { inserted, skipped: masterRows.length - toInsert.length };
}

// ---------------------------------------------------------------------------
// Assign all active customers to 'regular' group
// ---------------------------------------------------------------------------
async function assignRegularGroup() {
    console.log(`\n🏷️   Assigning 'regular' group to all active customers…`);

    const { data: reg, error: gErr } = await supabase
        .from('groups').select('id').eq('slug', 'regular').single();
    if (gErr || !reg) {
        console.error('   ⚠️ "regular" group missing — did migration seed run?');
        return;
    }
    const regularId = reg.id;

    // Fetch all active customer ids NOT already in 'regular'
    const { data: missing } = await supabase.rpc('customers_missing_group', { p_group_id: regularId });

    if (missing && Array.isArray(missing) && missing.length) {
        const rows = missing.map(r => ({ customer_id: r.id, group_id: regularId }));
        for (let i = 0; i < rows.length; i += 500) {
            await supabase.from('customer_groups').insert(rows.slice(i, i + 500));
        }
        console.log(`   ✓ Tagged ${rows.length} customers as 'regular'.`);
    } else {
        // Fallback: brute force (will throw on duplicate, but ON CONFLICT at PK handles it)
        const { data: all } = await supabase.from('customers').select('id').eq('is_active', true);
        const rows = (all || []).map(c => ({ customer_id: c.id, group_id: regularId }));
        let tagged = 0;
        for (let i = 0; i < rows.length; i += 500) {
            const { error } = await supabase.from('customer_groups').upsert(rows.slice(i, i + 500), {
                onConflict: 'customer_id,group_id',
                ignoreDuplicates: true,
            });
            if (!error) tagged += Math.min(500, rows.length - i);
        }
        console.log(`   ✓ Tagged (upsert) ~${tagged} customers as 'regular'.`);
    }
}

// ---------------------------------------------------------------------------
// Import sales — resolve customers by phone (exact), then fuzzy-name
// ---------------------------------------------------------------------------
async function importSales(salesRows, batchId) {
    console.log(`\n💰  Importing ${salesRows.length} sales transactions…`);

    // Load all customers for resolution (small enough: ~400)
    const { data: customers } = await supabase
        .from('customers').select('id,phone,name').eq('is_active', true);
    const byPhone = new Map(customers.map(c => [c.phone, c]));
    const customerList = customers.slice();

    const salesToInsert = [];
    const newCustomers  = [];
    const stats = { exact: 0, fuzzy: 0, auto_created: 0, unmatched: 0 };

    for (const s of salesRows) {
        let customerId = null;
        let confidence = 'exact';
        let score      = null;

        const exact = byPhone.get(s.customer_phone);
        if (exact) {
            customerId = exact.id;
            confidence = 'exact';
            stats.exact++;

            // Fuzzy name check — log if master and bill disagree significantly
            if (s.customer_name_raw) {
                const sim = similarity(exact.name, s.customer_name_raw);
                if (sim < FUZZY_THRESHOLD) {
                    score = sim;   // record the divergence, still considered exact because phone matched
                }
            }
        } else {
            // Phone not in master — try fuzzy name on entire list
            let best = null;
            if (s.customer_name_raw) {
                for (const c of customerList) {
                    const sim = similarity(c.name, s.customer_name_raw);
                    if (sim >= FUZZY_THRESHOLD && (!best || sim > best.score)) {
                        best = { customer: c, score: sim };
                    }
                }
            }
            if (best) {
                customerId = best.customer.id;
                confidence = 'fuzzy';
                score      = best.score;
                stats.fuzzy++;
            } else {
                // Auto-create
                newCustomers.push({
                    phone:  s.customer_phone,
                    name:   titleCase(s.customer_name_raw || 'Unknown'),
                    source: 'sale_import',
                    notes:  `auto-created from sale ${s.feed_no}`,
                });
                confidence = 'auto_created';
                stats.auto_created++;
            }
        }

        salesToInsert.push({
            feed_no:             s.feed_no,
            feed_date:           s.feed_date,
            customer_phone:      s.customer_phone,
            customer_id:         customerId,   // null for now; will resolve after new-customer inserts
            customer_name_raw:   s.customer_name_raw || null,
            address_raw:         s.address_raw,
            net_amount:          s.net_amount,
            for_days:            s.for_days,
            match_confidence:    confidence,
            fuzzy_match_score:   score,
            import_batch_id:     batchId,
            _pending_phone:      confidence === 'auto_created' ? s.customer_phone : null,
        });
    }

    // Insert any new customers; use upsert in case two sales in this batch share a new phone
    if (newCustomers.length) {
        const deduped = [...new Map(newCustomers.map(c => [c.phone, c])).values()];
        console.log(`   ↳ auto-creating ${deduped.length} new customers (unknown phones)…`);
        for (let i = 0; i < deduped.length; i += 200) {
            await supabase.from('customers').upsert(deduped.slice(i, i + 200), {
                onConflict: 'phone', ignoreDuplicates: true,
            });
        }
    }

    // Re-fetch to resolve the auto-created ids
    const { data: refreshed } = await supabase
        .from('customers').select('id,phone').eq('is_active', true);
    const resolveMap = new Map(refreshed.map(c => [c.phone, c.id]));
    for (const s of salesToInsert) {
        if (s._pending_phone) s.customer_id = resolveMap.get(s._pending_phone) || null;
        if (!s.customer_id) stats.unmatched++;
        delete s._pending_phone;
    }

    // Insert sales — use upsert on feed_no to make re-runs safe
    console.log(`   ↳ inserting ${salesToInsert.length} sales…`);
    let saved = 0;
    for (let i = 0; i < salesToInsert.length; i += 200) {
        const chunk = salesToInsert.slice(i, i + 200);
        const { error } = await supabase.from('sales_transactions').upsert(chunk, {
            onConflict: 'feed_no', ignoreDuplicates: false,
        });
        if (error) {
            console.error('   ⚠️ sales insert error:', error.message);
            break;
        }
        saved += chunk.length;
        process.stdout.write(`   ↳ ${saved}/${salesToInsert.length}\r`);
    }

    console.log(`\n   ✓ Sales imported. Breakdown:`);
    console.log(`      exact phone match        : ${stats.exact}`);
    console.log(`      fuzzy name match         : ${stats.fuzzy}`);
    console.log(`      auto-created new customer: ${stats.auto_created}`);
    console.log(`      unmatched (review)       : ${stats.unmatched}`);
    return { saved, ...stats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log('═'.repeat(60));
    console.log('  Shree Shyam Pharmacy — one-time data import');
    console.log('═'.repeat(60));

    // Smoke test connection
    const { error: probeErr } = await supabase.from('groups').select('id').limit(1);
    if (probeErr) {
        console.error('❌ Cannot reach Supabase:', probeErr.message);
        console.error('   Make sure the migration (001_groups_and_sales.sql) has been applied.');
        process.exit(1);
    }

    const masterBatch = await supabase.from('import_batches').insert({
        filename: 'CUSCELLDATA.xlsx', source_type: 'master_customers',
    }).select().single();

    const masterRows = readMaster();
    const mStats = await importMaster(masterRows, masterBatch.data?.id);
    await supabase.from('import_batches').update({
        row_count:     masterRows.length,
        success_count: mStats.inserted,
        skipped_count: mStats.skipped,
    }).eq('id', masterBatch.data?.id);

    await assignRegularGroup();

    const salesBatch = await supabase.from('import_batches').insert({
        filename: 'CUSTOMERREMINDER + REMINDER DATA.xlsx', source_type: 'daily_sales',
    }).select().single();

    const salesRows = readSales();
    const sStats = await importSales(salesRows, salesBatch.data?.id);
    await supabase.from('import_batches').update({
        row_count:     salesRows.length,
        success_count: sStats.saved,
        error_count:   sStats.unmatched,
        notes:         `exact=${sStats.exact} fuzzy=${sStats.fuzzy} auto=${sStats.auto_created}`,
    }).eq('id', salesBatch.data?.id);

    console.log('\n🎉  Done.\n');
}

main().catch(err => {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
});
