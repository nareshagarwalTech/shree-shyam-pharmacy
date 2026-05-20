'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, DailyBookClosingBalance } from '@/lib/supabase';
import { ArrowLeft, Scale, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export default function ClosingBalancePage() {
  const [from, setFrom] = useState(isoNDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<DailyBookClosingBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_book_closing_balance')
      .select('*')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: false });
    setRows((data ?? []) as DailyBookClosingBalance[]);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/40 via-white to-sky-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-blue-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-blue-600" /> Closing Balance
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Opening</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Cash Sales</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Cash Expenses</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Deposits Out</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Expected</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Actual</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Diff</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">No cash activity in this range.</td></tr>
                ) : rows.map((r) => {
                  const diff = r.cash_diff;
                  const status = r.actual_cash == null ? 'no-count' : Math.abs(diff ?? 0) < 1 ? 'ok' : 'mismatch';
                  return (
                    <tr key={r.entry_date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{r.entry_date}</td>
                      <td className="px-3 py-2 text-right">₹{fmtINR(Number(r.opening_cash))}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">+₹{fmtINR(Number(r.cash_sales))}</td>
                      <td className="px-3 py-2 text-right text-rose-700">−₹{fmtINR(Number(r.cash_expenses))}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{Number(r.cash_deposits_out) > 0 ? '−₹' + fmtINR(Number(r.cash_deposits_out)) : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">₹{fmtINR(Number(r.expected_cash))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.actual_cash != null ? '₹' + fmtINR(Number(r.actual_cash)) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {status === 'no-count' ? (
                          <span className="text-gray-400 text-xs">no count</span>
                        ) : status === 'ok' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> match
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 font-semibold ${Number(diff) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {Number(diff) > 0 ? '+' : ''}₹{fmtINR(Math.abs(Number(diff)))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
