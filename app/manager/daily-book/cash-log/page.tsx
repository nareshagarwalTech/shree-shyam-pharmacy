'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Scale, Calendar, RefreshCw, CheckCircle2, AlertTriangle,
} from 'lucide-react';

interface CashRecon {
  entry_date: string;
  cash_account_id: string;
  opening: number | string;
  non_sale_in: number | string;
  cr_note_in: number | string;
  deposits_in: number | string;
  expenses: number | string;
  deposits_out: number | string;
  manual_sales: number | string;
  expected_closing: number | string;
  actual_closing: number | string | null;
  derived_sales: number | string;
  cash_diff: number | string;
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function isoNDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fmtINR(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}
function* dateRange(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  while (start <= end) {
    const tz = start.getTimezoneOffset() * 60_000;
    yield new Date(start.getTime() - tz).toISOString().slice(0, 10);
    start.setDate(start.getDate() + 1);
  }
}

export default function CashLogPage() {
  const [from, setFrom] = useState(isoNDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<CashRecon[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // The cash_day_reconciliation function takes a single date — we batch by
    // calling it for each date in the range. Range is capped at 366 days.
    const dates: string[] = [];
    for (const d of dateRange(from, to)) dates.push(d);
    if (dates.length > 366) dates.length = 366;
    const results: CashRecon[] = [];
    // Run in parallel batches of 10 to stay friendly to the API.
    for (let i = 0; i < dates.length; i += 10) {
      const batch = dates.slice(i, i + 10);
      const settled = await Promise.all(batch.map((d) =>
        supabase.rpc('cash_day_reconciliation', { p_date: d })
      ));
      for (const r of settled) {
        if (r.data && r.data[0]) results.push(r.data[0] as CashRecon);
      }
    }
    // Sort descending by date
    results.sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    setRows(results);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Only show dates that have ANY activity (any field non-zero or closing entered)
  const visibleRows = useMemo(() => rows.filter((r) => {
    return Number(r.opening) !== 0
      || Number(r.non_sale_in) !== 0
      || Number(r.cr_note_in) !== 0
      || Number(r.deposits_in) !== 0
      || Number(r.expenses) !== 0
      || Number(r.deposits_out) !== 0
      || Number(r.manual_sales) !== 0
      || Number(r.derived_sales) !== 0
      || r.actual_closing != null;
  }), [rows]);

  // Totals row (just summing the visible rows)
  const totals = useMemo(() => {
    const acc = {
      non_sale_in: 0, deposits_in: 0, expenses: 0, deposits_out: 0,
      manual_sales: 0, derived_sales: 0,
    };
    let firstOpening: number | null = null;
    let lastClosing: number | null = null;
    for (const r of [...visibleRows].reverse()) {  // oldest first for opening/closing range
      if (firstOpening == null) firstOpening = Number(r.opening);
      if (r.actual_closing != null) lastClosing = Number(r.actual_closing);
      acc.non_sale_in += Number(r.non_sale_in);
      acc.deposits_in += Number(r.deposits_in);
      acc.expenses += Number(r.expenses);
      acc.deposits_out += Number(r.deposits_out);
      acc.manual_sales += Number(r.manual_sales);
      acc.derived_sales += Number(r.derived_sales);
    }
    const totalSales = acc.manual_sales + acc.derived_sales;
    return { ...acc, firstOpening, lastClosing, totalSales };
  }, [visibleRows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager/daily-book" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-emerald-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-600" /> Cash Log
            </h1>
          </div>
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-50" title="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Date range */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          <div className="ml-auto text-xs text-gray-500">
            {visibleRows.length} {visibleRows.length === 1 ? 'day' : 'days'} with activity
          </div>
        </div>

        {/* Totals summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SumTile label="Range Open" value={totals.firstOpening ?? 0} accent="indigo" />
          <SumTile label="Total Cash Sales" value={totals.totalSales} accent="emerald" />
          <SumTile label="Total Cash Expenses" value={totals.expenses} accent="rose" />
          <SumTile label="Range Close" value={totals.lastClosing ?? 0} accent="emerald" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-2 py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-right px-2 py-2 font-semibold text-gray-700">Opening</th>
                  <th className="text-right px-2 py-2 font-semibold text-emerald-700">Manual Sales</th>
                  <th className="text-right px-2 py-2 font-semibold text-emerald-700">Derived Sales</th>
                  <th className="text-right px-2 py-2 font-semibold text-emerald-700">Non-Sale In</th>
                  <th className="text-right px-2 py-2 font-semibold text-emerald-700">Transfers In</th>
                  <th className="text-right px-2 py-2 font-semibold text-rose-700">Expenses</th>
                  <th className="text-right px-2 py-2 font-semibold text-rose-700">Transfers Out</th>
                  <th className="text-right px-2 py-2 font-semibold text-gray-700">Closing</th>
                  <th className="text-right px-2 py-2 font-semibold text-gray-700">Diff</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading…</td></tr>
                ) : visibleRows.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">No cash activity in this range.</td></tr>
                ) : visibleRows.map((r) => {
                  const diff = Number(r.cash_diff);
                  const cashShort = r.actual_closing != null && diff < -0.01;
                  const balanced = r.actual_closing != null && Math.abs(diff) < 0.01;
                  const total = Number(r.manual_sales) + Number(r.derived_sales);
                  return (
                    <tr key={r.entry_date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-2 py-1.5 font-medium text-gray-800">{r.entry_date}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.opening) !== 0 ? '₹' + fmtINR(Number(r.opening)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{Number(r.manual_sales) > 0 ? '+₹' + fmtINR(Number(r.manual_sales)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 font-semibold">{Number(r.derived_sales) > 0 ? '+₹' + fmtINR(Number(r.derived_sales)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{Number(r.non_sale_in) + Number(r.cr_note_in) > 0 ? '+₹' + fmtINR(Number(r.non_sale_in) + Number(r.cr_note_in)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{Number(r.deposits_in) > 0 ? '+₹' + fmtINR(Number(r.deposits_in)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{Number(r.expenses) > 0 ? '−₹' + fmtINR(Number(r.expenses)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{Number(r.deposits_out) > 0 ? '−₹' + fmtINR(Number(r.deposits_out)) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold">
                        {r.actual_closing != null ? '₹' + fmtINR(Number(r.actual_closing)) : <span className="text-amber-600">not set</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {r.actual_closing == null ? <span className="text-amber-600 text-xs">—</span>
                          : balanced ? <CheckCircle2 className="inline w-4 h-4 text-emerald-700" />
                          : <span className="text-rose-700 inline-flex items-center gap-0.5 text-xs font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" /> {cashShort ? '−' : '+'}₹{fmtINR(Math.abs(diff))}
                            </span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {visibleRows.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td className="px-2 py-2 font-bold text-gray-900">TOTALS</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-900">₹{fmtINR(totals.firstOpening ?? 0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-700">+₹{fmtINR(totals.manual_sales)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-700">+₹{fmtINR(totals.derived_sales)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-700">+₹{fmtINR(totals.non_sale_in)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-700">+₹{fmtINR(totals.deposits_in)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-rose-700">−₹{fmtINR(totals.expenses)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-rose-700">−₹{fmtINR(totals.deposits_out)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-900">₹{fmtINR(totals.lastClosing ?? 0)}</td>
                    <td className="px-2 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function SumTile({ label, value, accent }: { label: string; value: number; accent: 'indigo' | 'emerald' | 'rose' }) {
  const styles = {
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-900',  border: 'border-indigo-200'  },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-900',    border: 'border-rose-200'    },
  }[accent];
  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-3`}>
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${styles.text}`}>₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}</div>
    </div>
  );
}
