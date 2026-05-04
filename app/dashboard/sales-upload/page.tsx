'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  parseSalesFile,
  matchSales,
  MatchedSale,
  SalesParseResult,
  titleCase,
} from '@/lib/sales-import';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';

type Step = 'upload' | 'preview' | 'importing' | 'complete';

export default function SalesUploadPage() {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<SalesParseResult | null>(null);
  const [matched, setMatched] = useState<MatchedSale[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setParsed(null);
    setMatched([]);
    setProgress(0);
    setSavedCount(0);
    setCreatedCount(0);
    setSkippedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setParsed(null);
    const result = await parseSalesFile(file);
    setParsed(result);

    if (result.rows.length === 0) {
      setStep('preview');
      return;
    }

    // Load existing customers for matching
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id,phone,name')
      .eq('is_active', true);
    if (error) {
      setToast({ message: `Failed to load customers: ${error.message}`, type: 'error' });
      return;
    }
    const m = matchSales(result.rows, customers || []);
    setMatched(m);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!matched.length) return;
    setStep('importing');
    setImporting(true);
    setProgress(0);

    // Create a batch record
    const { data: batch } = await supabase
      .from('import_batches')
      .insert({
        filename: parsed?.fileName || 'upload.xlsx',
        source_type: 'daily_sales',
        row_count: matched.length,
      })
      .select()
      .single();
    const batchId = batch?.id || null;

    // 1) Create any auto-create new customers (dedupe by phone inside file)
    const newCustomers = matched
      .filter((m) => m.match_confidence === 'auto_created')
      .reduce((acc: Record<string, { phone: string; name: string; source: string; notes: string }>, m) => {
        if (!acc[m.customer_phone!]) {
          acc[m.customer_phone!] = {
            phone: m.customer_phone!,
            name: titleCase(m.customer_name_raw || 'Unknown'),
            source: 'sale_import',
            notes: `auto-created from sale ${m.feed_no}`,
          };
        }
        return acc;
      }, {});
    const newList = Object.values(newCustomers);
    let created = 0;
    if (newList.length) {
      // Plain INSERT — partial unique index on phone can't be used for ON CONFLICT.
      // Filter against existing phones first.
      const phonesToCheck = newList.map((c) => c.phone);
      const { data: existing } = await supabase
        .from('customers')
        .select('phone')
        .in('phone', phonesToCheck)
        .eq('is_active', true);
      const existingSet = new Set((existing || []).map((c) => c.phone));
      const toInsert = newList.filter((c) => !existingSet.has(c.phone));
      if (toInsert.length) {
        const { error } = await supabase.from('customers').insert(toInsert);
        if (!error) created = toInsert.length;
      }
    }

    // 2) Re-fetch id mapping for any auto-created or previously-known phones
    const phones = Array.from(new Set(matched.map((m) => m.customer_phone!).filter(Boolean)));
    const { data: custRows } = await supabase
      .from('customers')
      .select('id,phone')
      .in('phone', phones);
    const phoneToId = new Map((custRows || []).map((c) => [c.phone, c.id]));

    // 3) Also auto-tag new customers with 'regular' group
    const { data: regRow } = await supabase
      .from('groups')
      .select('id')
      .eq('slug', 'regular')
      .single();
    if (regRow && newList.length) {
      const tagLinks = newList
        .map((c) => phoneToId.get(c.phone))
        .filter(Boolean)
        .map((customer_id) => ({ customer_id, group_id: regRow.id }));
      if (tagLinks.length) {
        await supabase
          .from('customer_groups')
          .upsert(tagLinks, { onConflict: 'customer_id,group_id', ignoreDuplicates: true });
      }
    }

    // 4) Insert sales transactions (upsert on feed_no)
    const salesRows = matched.map((m) => ({
      feed_no: m.feed_no,
      feed_date: m.feed_date,
      customer_phone: m.customer_phone,
      customer_id: m.resolved_customer_id || phoneToId.get(m.customer_phone!) || null,
      customer_name_raw: m.customer_name_raw,
      address_raw: m.address_raw,
      net_amount: m.net_amount,
      for_days: m.for_days,
      match_confidence: m.match_confidence,
      fuzzy_match_score: m.fuzzy_match_score,
      import_batch_id: batchId,
    }));

    let saved = 0;
    let skipped = 0;
    for (let i = 0; i < salesRows.length; i += 100) {
      const chunk = salesRows.slice(i, i + 100);
      const { error } = await supabase.from('sales_transactions').upsert(chunk, {
        onConflict: 'feed_no',
        ignoreDuplicates: false,
      });
      if (error) {
        skipped += chunk.length;
      } else {
        saved += chunk.length;
      }
      setProgress(Math.round(((i + chunk.length) / salesRows.length) * 100));
    }

    // 5) Update batch stats
    if (batchId) {
      await supabase
        .from('import_batches')
        .update({
          success_count: saved,
          skipped_count: skipped,
          notes: `created ${created} new customers`,
        })
        .eq('id', batchId);
    }

    setSavedCount(saved);
    setCreatedCount(created);
    setSkippedCount(skipped);
    setImporting(false);
    setStep('complete');
  };

  const tally = matched.reduce(
    (a, m) => {
      a[m.match_confidence]++;
      return a;
    },
    { exact: 0, fuzzy: 0, auto_created: 0 } as Record<string, number>,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold text-gray-900">Upload Daily Sales</h1>
          <p className="text-sm text-gray-500">
            Export the sales register from your billing software as Excel or CSV, then drop it
            below. We&apos;ll match customers by phone, auto-create any new ones, and update
            reminder dates.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {step === 'upload' && (
            <div className="p-6">
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center hover:border-emerald-400 hover:bg-emerald-50/30 cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-14 h-14 text-gray-400 mx-auto mb-3" />
                <p className="text-lg font-medium text-gray-800 mb-1">
                  Drop your sales Excel / CSV file
                </p>
                <p className="text-sm text-gray-500 mb-4">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="hidden"
                />
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium">
                  <Upload className="w-4 h-4" /> Select File
                </span>
              </div>

              <div className="mt-6 text-sm text-gray-600">
                <p className="font-medium mb-2">Expected columns (case-insensitive):</p>
                <ul className="list-disc list-inside space-y-1 text-gray-500">
                  <li><code className="bg-gray-100 px-1 rounded">FeedNo</code> or BillNo — unique bill/receipt number</li>
                  <li><code className="bg-gray-100 px-1 rounded">FeedDate</code> or BillDate</li>
                  <li><code className="bg-gray-100 px-1 rounded">Phone</code> or Mobile</li>
                  <li>Optional: <code className="bg-gray-100 px-1 rounded">Cust</code>, <code className="bg-gray-100 px-1 rounded">NetAmt</code>, <code className="bg-gray-100 px-1 rounded">ForDays</code>, <code className="bg-gray-100 px-1 rounded">CustAd4</code></li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && parsed && (
            <div>
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                <FileSpreadsheet className="w-7 h-7 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{parsed.fileName}</p>
                  <p className="text-sm text-gray-500">
                    {matched.length} valid sales
                    {parsed.errors.length > 0 && ` · ${parsed.errors.length} skipped`}
                  </p>
                </div>
                <button onClick={reset} className="text-sm text-emerald-600 hover:underline">
                  Change file
                </button>
              </div>

              <div className="p-6 space-y-5">
                {parsed.errors.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <span className="font-medium text-red-700">
                        {parsed.errors.length} row(s) skipped
                      </span>
                    </div>
                    <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                      {parsed.errors.slice(0, 8).map((e, i) => (
                        <li key={i}>Row {e.row}: {e.message}</li>
                      ))}
                      {parsed.errors.length > 8 && <li>...and {parsed.errors.length - 8} more</li>}
                    </ul>
                  </div>
                )}

                {matched.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <TallyCard
                        icon={<Users className="w-5 h-5" />}
                        label="Exact match"
                        value={tally.exact}
                        color="emerald"
                      />
                      <TallyCard
                        icon={<Sparkles className="w-5 h-5" />}
                        label="Fuzzy match"
                        value={tally.fuzzy}
                        color="amber"
                      />
                      <TallyCard
                        icon={<UserPlus className="w-5 h-5" />}
                        label="New customers"
                        value={tally.auto_created}
                        color="blue"
                      />
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">Preview (first 10 rows)</h3>
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <Th>Bill #</Th>
                              <Th>Date</Th>
                              <Th>Phone</Th>
                              <Th>Name (bill)</Th>
                              <Th>Days</Th>
                              <Th>₹ Amt</Th>
                              <Th>Match</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {matched.slice(0, 10).map((r) => (
                              <tr key={r.feed_no}>
                                <Td>{r.feed_no}</Td>
                                <Td>{r.feed_date}</Td>
                                <Td>{r.customer_phone}</Td>
                                <Td>
                                  <div className="truncate max-w-[140px]">{r.customer_name_raw}</div>
                                  {r.matched_customer_name && r.match_confidence !== 'exact' && (
                                    <div className="text-[11px] text-gray-500">
                                      → {r.matched_customer_name}
                                    </div>
                                  )}
                                </Td>
                                <Td>{r.for_days ?? '—'}</Td>
                                <Td>{r.net_amount ?? '—'}</Td>
                                <Td>
                                  <MatchBadge
                                    confidence={r.match_confidence}
                                    score={r.fuzzy_match_score}
                                  />
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {matched.length > 10 && (
                        <p className="text-sm text-gray-500 mt-2">
                          …and {matched.length - 10} more
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!matched.length}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  Import {matched.length} Sales
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="p-10 text-center">
              <Loader2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 animate-spin" />
              <p className="text-lg font-medium text-gray-700 mb-2">Importing sales…</p>
              <div className="w-full bg-gray-200 rounded-full h-3 max-w-xs mx-auto">
                <div
                  className="bg-emerald-500 h-3 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">{progress}%</p>
            </div>
          )}

          {step === 'complete' && (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-xl font-display font-bold text-gray-900 mb-2">Import complete</p>
              <div className="text-sm text-gray-600 space-y-1 mb-6">
                <div>Saved: <strong className="text-gray-900">{savedCount}</strong> sales</div>
                {createdCount > 0 && (
                  <div>
                    New customers auto-created: <strong className="text-gray-900">{createdCount}</strong>
                  </div>
                )}
                {skippedCount > 0 && (
                  <div className="text-amber-600">Skipped: {skippedCount}</div>
                )}
              </div>
              <div className="flex justify-center gap-2">
                <button
                  onClick={reset}
                  className="px-4 py-2 border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
                >
                  Upload Another
                </button>
                <a
                  href="/dashboard"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg"
                >
                  Back to Dashboard
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium text-gray-600 text-xs">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-gray-800">{children}</td>;
}

function TallyCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'blue';
}) {
  const palette: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${palette[color]}`}>
      <div>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium opacity-80">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function MatchBadge({
  confidence,
  score,
}: {
  confidence: 'exact' | 'fuzzy' | 'auto_created';
  score: number | null;
}) {
  if (confidence === 'exact') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
        Exact
      </span>
    );
  }
  if (confidence === 'fuzzy') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
        Fuzzy{score ? ` ${Math.round(score * 100)}%` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
      New
    </span>
  );
}
