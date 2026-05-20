'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Account,
  ExpenseCategory,
  SaleChannel,
  DailyEntry,
} from '@/lib/supabase';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { parseDailyBookFile, DailyBookParseResult } from '@/lib/daily-book-import';

interface ImportSummary {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export default function ImportPage() {
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<DailyBookParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);

  const onFile = useCallback(async (file: File) => {
    setParsing(true);
    setResult(null);
    try {
      const p = await parseDailyBookFile(file);
      setParsed(p);
    } catch (e: any) {
      setParsed({
        entries: [], denominations: [], denomination_date: null,
        errors: [{ row: 0, message: e?.message || 'Parse failed' }],
        warnings: [], fileName: file.name,
      });
    } finally {
      setParsing(false);
    }
  }, []);

  const doImport = useCallback(async () => {
    if (!parsed) return;
    setImporting(true);
    setResult(null);
    const errors: string[] = [];
    let inserted = 0, skipped = 0, failed = 0;

    // Load lookup tables once
    const [aRes, cRes, scRes] = await Promise.all([
      supabase.from('accounts').select('id, name').eq('is_active', true),
      supabase.from('expense_categories').select('id, slug').eq('is_active', true),
      supabase.from('sale_channels').select('id, slug, default_account_id').eq('is_active', true),
    ]);
    const accountByName = new Map<string, string>((aRes.data ?? []).map((a: Pick<Account, 'id' | 'name'>) => [a.name, a.id]));
    const categoryBySlug = new Map<string, string>((cRes.data ?? []).map((c: Pick<ExpenseCategory, 'id' | 'slug'>) => [c.slug, c.id]));
    const channelBySlug = new Map<string, Pick<SaleChannel, 'id' | 'default_account_id'>>(
      (scRes.data ?? []).map((c: Pick<SaleChannel, 'id' | 'slug' | 'default_account_id'>) => [c.slug, c])
    );

    // Build rows and insert in batches of 100
    type Row = Omit<DailyEntry, 'id' | 'created_at' | 'updated_at' | 'created_by'>;
    const rows: Row[] = [];
    for (const p of parsed.entries) {
      const row: Partial<DailyEntry> = {
        entry_date: p.entry_date,
        entry_type: p.entry_type,
        narration: p.narration,
        txn_amount: p.txn_amount,
        settled_amount: p.settled_amount,
        account_id: null,
        transfer_to_account_id: null,
        expense_category_id: null,
        sale_channel_id: null,
      };

      const accountId = p.account_name ? accountByName.get(p.account_name) ?? null : null;

      if (p.entry_type === 'sale' && p.sale_channel_slug) {
        const ch = channelBySlug.get(p.sale_channel_slug);
        row.sale_channel_id = ch?.id ?? null;
        row.account_id = accountId ?? ch?.default_account_id ?? null;
        // CREDIT may legitimately have no account
        if (!row.sale_channel_id) {
          failed++; errors.push(`Row ${p.raw_row}: sale channel "${p.sale_channel_slug}" not found`);
          continue;
        }
      } else if (p.entry_type === 'expense' && p.expense_category_slug) {
        row.expense_category_id = categoryBySlug.get(p.expense_category_slug) ?? null;
        row.account_id = accountId;
        if (!row.expense_category_id || !row.account_id) {
          failed++; errors.push(`Row ${p.raw_row}: expense missing category or account`);
          continue;
        }
      } else if (p.entry_type === 'cash_count') {
        row.account_id = accountByName.get('CASH') ?? null;
        if (!row.account_id) { failed++; errors.push(`Row ${p.raw_row}: CASH account missing`); continue; }
      } else if (p.entry_type === 'bank_transfer' || p.entry_type === 'cash_deposit') {
        row.account_id = accountId;
        row.transfer_to_account_id = p.transfer_to_account_name
          ? accountByName.get(p.transfer_to_account_name) ?? null
          : null;
        if (!row.account_id || !row.transfer_to_account_id) {
          failed++; errors.push(`Row ${p.raw_row}: transfer missing source/destination`);
          continue;
        }
      } else {
        failed++; errors.push(`Row ${p.raw_row}: unhandled entry type`); continue;
      }

      rows.push(row as Row);
    }

    // Insert in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from('daily_entries').insert(chunk);
      if (error) {
        failed += chunk.length;
        errors.push(`Batch ${i / 100 + 1}: ${error.message}`);
      } else {
        inserted += chunk.length;
      }
    }

    // Denominations — if any, upsert as a single CASH COUNT entry for the date
    if (parsed.denominations.length && parsed.denomination_date) {
      const cashAccountId = accountByName.get('CASH');
      if (cashAccountId) {
        const total = parsed.denominations.reduce((s, d) => s + d.denomination * d.count, 0);
        // Check if a CASH COUNT already exists today (from the import above); if so reuse it
        const { data: existing } = await supabase
          .from('daily_entries')
          .select('id')
          .eq('entry_date', parsed.denomination_date)
          .eq('entry_type', 'cash_count')
          .limit(1)
          .maybeSingle();
        let cashEntryId = (existing as { id: string } | null)?.id ?? null;
        if (!cashEntryId) {
          const { data: created, error: ccErr } = await supabase
            .from('daily_entries')
            .insert({
              entry_date: parsed.denomination_date,
              entry_type: 'cash_count',
              narration: 'CLOSING BALANCE',
              txn_amount: total,
              account_id: cashAccountId,
            })
            .select('id').single();
          if (ccErr) { errors.push(`Denomination cash_count: ${ccErr.message}`); }
          else cashEntryId = (created as { id: string }).id;
        }
        if (cashEntryId) {
          await supabase.from('cash_denominations').delete().eq('count_date', parsed.denomination_date);
          await supabase.from('cash_denominations').insert(
            parsed.denominations.map((d) => ({
              count_date: parsed.denomination_date!,
              denomination: d.denomination,
              count: d.count,
              daily_entry_id: cashEntryId!,
            })),
          );
        }
      }
    }

    setResult({ inserted, skipped, failed, errors });
    setImporting(false);
  }, [parsed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50/40 via-white to-teal-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-cyan-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-cyan-600" /> Import Excel
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Drop zone */}
        <label className="block bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-cyan-400 transition p-8 text-center cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="font-semibold text-gray-900">Choose a DAILYBOOK_SSP_*.xlsx file</div>
          <div className="text-sm text-gray-500 mt-1">
            We&apos;ll parse the DAILY ENTRY and DENOMINATION sheets.
          </div>
        </label>

        {parsing && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500">
            Parsing…
          </div>
        )}

        {parsed && !parsing && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-cyan-600" />
              <div className="font-semibold text-gray-900">{parsed.fileName}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Entries parsed" value={parsed.entries.length} color="cyan" />
              <Stat label="Warnings" value={parsed.warnings.length} color="amber" />
              <Stat label="Errors" value={parsed.errors.length} color="rose" />
            </div>

            {parsed.errors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700 space-y-1 max-h-40 overflow-y-auto">
                <div className="font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Errors:</div>
                {parsed.errors.slice(0, 20).map((e, i) => (
                  <div key={i}>Row {e.row}: {e.message}</div>
                ))}
              </div>
            )}
            {parsed.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-0.5 max-h-32 overflow-y-auto">
                <div className="font-semibold">Warnings:</div>
                {parsed.warnings.slice(0, 10).map((w, i) => (
                  <div key={i}>Row {w.row}: {w.message}</div>
                ))}
                {parsed.warnings.length > 10 && <div>… and {parsed.warnings.length - 10} more</div>}
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600">Preview first 5 entries</summary>
              <pre className="bg-gray-50 p-3 rounded mt-2 overflow-x-auto text-xs">
                {JSON.stringify(parsed.entries.slice(0, 5), null, 2)}
              </pre>
            </details>

            <button
              onClick={doImport}
              disabled={importing || parsed.entries.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Database className="w-4 h-4" />
              {importing ? `Importing…` : `Import ${parsed.entries.length} entries into database`}
            </button>
          </div>
        )}

        {result && (
          <div className={`rounded-2xl border p-5 ${result.failed === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className={`flex items-center gap-2 font-semibold ${result.failed === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
              {result.failed === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              Import complete
            </div>
            <div className="mt-2 text-sm space-y-0.5">
              <div>✓ Inserted: <strong>{result.inserted}</strong></div>
              {result.skipped > 0 && <div>· Skipped: {result.skipped}</div>}
              {result.failed > 0 && <div>✗ Failed: <strong className="text-rose-700">{result.failed}</strong></div>}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 text-xs text-rose-700 max-h-32 overflow-y-auto">
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Link href="/manager/daily-book" className="text-cyan-700 hover:text-cyan-800 underline text-sm">
                View imported entries →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: 'cyan' | 'amber' | 'rose' }) {
  const cls = {
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    rose: 'bg-rose-50 border-rose-200 text-rose-900',
  }[color];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
