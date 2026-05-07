'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { parseSalesFile, ParsedSale, SalesParseResult, titleCase } from '@/lib/sales-import';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowLeft,
  UserPlus,
  Users,
  Calendar,
  RefreshCcw,
} from 'lucide-react';

type Step = 'upload' | 'preview' | 'importing' | 'complete';

interface ReminderRow {
  phone: string;
  customer_name_raw: string;
  last_purchase_date: string;
  for_days: number;
  source_rows: number;       // how many Excel rows collapsed into this one
  customer_id?: string;       // resolved from DB if customer exists
  is_new: boolean;            // will be auto-created
  /** Existing date already on the customer record — only set when we'd skip this row. */
  existing_date?: string;
  /** True if this row would move the customer's date BACKWARD — we skip these. */
  is_stale: boolean;
}

export default function ReminderUploadPage() {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<SalesParseResult | null>(null);
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [staleCount, setStaleCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setParsed(null);
    setRows([]);
    setProgress(0);
    setUpdatedCount(0);
    setCreatedCount(0);
    setSkippedCount(0);
    setStaleCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const result = await parseSalesFile(file);
    setParsed(result);

    if (!result.rows.length) {
      setStep('preview');
      return;
    }

    // Aggregate by phone — latest date wins, take that row's for_days
    const agg = new Map<string, ReminderRow>();
    let skipped = 0;
    for (const r of result.rows) {
      if (!r.customer_phone || !r.feed_date || r.for_days == null) {
        skipped += 1;
        continue;
      }
      const existing = agg.get(r.customer_phone);
      if (!existing || r.feed_date > existing.last_purchase_date) {
        agg.set(r.customer_phone, {
          phone:               r.customer_phone,
          customer_name_raw:   r.customer_name_raw || '',
          last_purchase_date:  r.feed_date,
          for_days:            r.for_days,
          source_rows:         (existing?.source_rows ?? 0) + 1,
          is_new:              true,    // flipped after DB lookup
          is_stale:            false,   // flipped after DB lookup
        });
      } else {
        existing.source_rows += 1;
      }
    }

    // Look up which phones already exist + their current reminder dates so
    // we can flag rows that would move a customer's date BACKWARDS.
    const phones = Array.from(agg.keys());
    const { data: existing } = await supabase
      .from('customers')
      .select('id,phone,name,reminder_last_purchase_date')
      .in('phone', phones);
    const phoneMap = new Map(
      (existing || []).map((c) => [c.phone, {
        id:                          c.id,
        name:                        c.name,
        reminder_last_purchase_date: c.reminder_last_purchase_date as string | null,
      }]),
    );

    const list: ReminderRow[] = Array.from(agg.values()).map((r) => {
      const match = phoneMap.get(r.phone);
      const existingDate = match?.reminder_last_purchase_date ?? null;
      // A row is "stale" if the existing customer already has a NEWER reminder
      // date — uploading would move them backwards, which is almost always wrong.
      const isStale = !!existingDate && existingDate >= r.last_purchase_date;
      return {
        ...r,
        customer_id:   match?.id,
        is_new:        !match,
        existing_date: existingDate ?? undefined,
        is_stale:      isStale,
      };
    });
    list.sort((a, b) => b.last_purchase_date.localeCompare(a.last_purchase_date));
    const stale = list.filter((r) => r.is_stale).length;
    setRows(list);
    setSkippedCount(skipped);
    setStaleCount(stale);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setStep('importing');
    setProgress(0);

    // 1. Create new customers
    const newCustomers = rows
      .filter((r) => r.is_new)
      .map((r) => ({
        phone: r.phone,
        name: titleCase(r.customer_name_raw || 'Unknown'),
        source: 'sale_import' as const,
        notes: 'auto-created from reminder upload',
        reminder_last_purchase_date: r.last_purchase_date,
        reminder_for_days: r.for_days,
      }));

    let created = 0;
    if (newCustomers.length) {
      // Filter against any phones that snuck in between preview and import
      const newPhones = newCustomers.map((c) => c.phone);
      const { data: nowExisting } = await supabase
        .from('customers')
        .select('phone')
        .in('phone', newPhones);
      const nowExistingSet = new Set((nowExisting || []).map((c) => c.phone));
      const safeToInsert = newCustomers.filter((c) => !nowExistingSet.has(c.phone));
      if (safeToInsert.length) {
        const { error } = await supabase.from('customers').insert(safeToInsert);
        if (!error) created = safeToInsert.length;
        else setToast({ message: `Insert error: ${error.message}`, type: 'error' });
      }
    }
    setProgress(30);

    // 2. Auto-tag new customers with the 'regular' group
    if (created > 0) {
      const newPhones = newCustomers.map((c) => c.phone);
      const [{ data: regGroup }, { data: insertedCusts }] = await Promise.all([
        supabase.from('groups').select('id').eq('slug', 'regular').single(),
        supabase.from('customers').select('id,phone').in('phone', newPhones),
      ]);
      if (regGroup && insertedCusts?.length) {
        const links = insertedCusts.map((c) => ({ customer_id: c.id, group_id: regGroup.id }));
        await supabase
          .from('customer_groups')
          .upsert(links, { onConflict: 'customer_id,group_id', ignoreDuplicates: true });
      }
    }
    setProgress(50);

    // 3. Update reminder fields for existing customers (NAME left untouched).
    // Skip "stale" rows — those would push a customer's date backwards, which
    // would re-trigger reminders we already handled. The user can still see
    // them in the preview as "stale" and decide whether to re-upload a fresh
    // file.
    let updated = 0;
    const existingRows = rows.filter((r) => !r.is_new && !r.is_stale);
    for (let i = 0; i < existingRows.length; i += 50) {
      const chunk = existingRows.slice(i, i + 50);
      // Bulk update via individual calls — Supabase doesn't have a multi-row UPDATE
      // with different values per row in a single call. 50 in parallel is fine.
      const results = await Promise.all(
        chunk.map((r) =>
          supabase
            .from('customers')
            .update({
              reminder_last_purchase_date: r.last_purchase_date,
              reminder_for_days: r.for_days,
            })
            .eq('phone', r.phone),
        ),
      );
      updated += results.filter((res) => !res.error).length;
      setProgress(50 + Math.round(((i + chunk.length) / existingRows.length) * 50));
    }

    setUpdatedCount(updated);
    setCreatedCount(created);
    setProgress(100);
    setStep('complete');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <Link
            href="/dashboard/whatsapp"
            className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to WhatsApp Center
          </Link>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <RefreshCcw className="w-6 h-6 text-emerald-600" />
            Reminder Upload
          </h1>
          <p className="text-sm text-gray-500">
            Upload your sales register Excel — we use it to set each customer&apos;s last
            purchase date + how many days the medicines will last, then schedule the refill
            reminder. We do <strong>not</strong> create bills or payments.
          </p>
        </div>

        {/* Step 1 — file picker */}
        {step === 'upload' && (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-400 p-8 sm:p-12 text-center transition-colors">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-display font-semibold text-gray-900 mb-1">
              Choose an Excel or CSV file
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Expected columns: FeedNo · FeedDate · Cust · Phone · CustAd4 · NetAmt ·
              <strong> ForDays</strong>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block mx-auto"
            />
            <div className="flex items-start gap-2 p-3 mt-6 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 text-left max-w-2xl mx-auto">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-0.5">How dedup works</p>
                <p>
                  If the same phone appears more than once, we keep only the row with the
                  latest <strong>FeedDate</strong> and use that row&apos;s <strong>ForDays</strong>.
                  Rows with no phone or no date are skipped.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — preview */}
        {step === 'preview' && parsed && (
          <PreviewStep
            parsed={parsed}
            rows={rows}
            skippedCount={skippedCount}
            staleCount={staleCount}
            onCancel={reset}
            onConfirm={handleImport}
          />
        )}

        {/* Step 3 — importing */}
        {step === 'importing' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <Loader2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 animate-spin" />
            <p className="font-display font-semibold text-gray-900 mb-1">Updating reminders…</p>
            <div className="max-w-sm mx-auto bg-gray-100 rounded-full h-2 mt-4">
              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">{progress}%</p>
          </div>
        )}

        {/* Step 4 — done */}
        {step === 'complete' && (
          <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="font-display font-semibold text-gray-900 mb-1">All done!</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto mt-4 text-sm">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <div className="text-2xl font-display font-bold text-emerald-700">{updatedCount}</div>
                <div className="text-xs text-emerald-700">existing customers updated</div>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="text-2xl font-display font-bold text-blue-700">{createdCount}</div>
                <div className="text-xs text-blue-700">new customers created</div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3" title="Already have a newer reminder date — would have moved them backwards">
                <div className="text-2xl font-display font-bold text-amber-700">{staleCount}</div>
                <div className="text-xs text-amber-700">stale rows skipped</div>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <div className="text-2xl font-display font-bold text-gray-700">{skippedCount}</div>
                <div className="text-xs text-gray-700">no phone / no date</div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={reset}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 text-sm"
              >
                Upload another file
              </button>
              <Link
                href="/dashboard/whatsapp"
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
              >
                Open WhatsApp Center →
              </Link>
            </div>
          </div>
        )}
      </main>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function PreviewStep({
  parsed, rows, skippedCount, staleCount, onCancel, onConfirm,
}: {
  parsed: SalesParseResult;
  rows: ReminderRow[];
  skippedCount: number;
  staleCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const newCount      = rows.filter((r) => r.is_new).length;
  const existingFresh = rows.filter((r) => !r.is_new && !r.is_stale).length;
  const willImport    = newCount + existingFresh;

  if (!rows.length) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-8 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h3 className="font-display font-semibold text-gray-900 mb-1">Nothing to import</h3>
        <p className="text-sm text-gray-500">
          We could not find any rows with both a phone and a date in the file.
          {parsed.errors.length > 0 && ` (${parsed.errors.length} parse errors)`}
        </p>
        {parsed.errors.length > 0 && (
          <ul className="text-xs text-red-600 mt-3 max-h-40 overflow-y-auto text-left max-w-md mx-auto">
            {parsed.errors.slice(0, 10).map((e, i) => (
              <li key={i}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
        )}
        <button
          onClick={onCancel}
          className="mt-6 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
        >
          Try another file
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <Tile label="To create"      value={String(newCount)}      icon={UserPlus} color="blue" />
        <Tile label="To update"      value={String(existingFresh)} icon={RefreshCcw} color="emerald" />
        <Tile label="Stale (skip)"   value={String(staleCount)}    icon={AlertCircle} color="amber" />
        <Tile label="No phone/date"  value={String(skippedCount + parsed.errors.length)} icon={AlertCircle} color="gray" />
      </div>
      {staleCount > 0 && (
        <div className="flex items-start gap-2 p-3 mb-6 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-0.5">{staleCount} row{staleCount === 1 ? '' : 's'} will be skipped — already have a newer purchase date</p>
            <p>
              These customers already have a purchase date in the system that&apos;s the same or newer than what&apos;s in the file. We won&apos;t move them backwards (that would make them re-appear as overdue when they&apos;re not).
            </p>
          </div>
        </div>
      )}

      {/* Preview table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold text-gray-900 text-sm">
            Preview — {rows.length} customer{rows.length === 1 ? '' : 's'}
          </h3>
          <span className="text-xs text-gray-500 truncate">{parsed.fileName}</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Last purchase</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">For days</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.slice(0, 100).map((r) => (
                <tr key={r.phone} className={`hover:bg-gray-50 ${r.is_stale ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                  <td className="px-3 py-2 text-gray-900 truncate max-w-[200px]">{r.customer_name_raw}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">
                    {r.last_purchase_date}
                    {r.is_stale && r.existing_date && (
                      <div className="text-[10px] text-amber-700">already on file: {r.existing_date}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.for_days}</td>
                  <td className="px-3 py-2">
                    {r.is_stale ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 uppercase">
                        <AlertCircle className="w-3 h-3" /> stale · skip
                      </span>
                    ) : r.is_new ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 uppercase">
                        <UserPlus className="w-3 h-3" /> new
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 uppercase">
                        <RefreshCcw className="w-3 h-3" /> update
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && (
            <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
              Showing first 100 of {rows.length}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 text-sm">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={willImport === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          Import {willImport} reminder{willImport === 1 ? '' : 's'}
        </button>
      </div>
    </>
  );
}

function Tile({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof Users;
  color: 'emerald' | 'blue' | 'amber' | 'gray';
}) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    gray:    'bg-gray-50 border-gray-200 text-gray-700',
  };
  return (
    <div className={`rounded-xl border p-3 ${map[color]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-70 leading-tight">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
    </div>
  );
}
