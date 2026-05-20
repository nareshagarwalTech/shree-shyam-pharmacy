'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, DailyBookExpenseSummary } from '@/lib/supabase';
import { ArrowLeft, Receipt, Calendar } from 'lucide-react';

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
function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

const COLS: { key: keyof DailyBookExpenseSummary; label: string }[] = [
  { key: 'purchase',      label: 'Purchase' },
  { key: 'salary',        label: 'Salary' },
  { key: 'rent',          label: 'Rent' },
  { key: 'electricity',   label: 'Elec' },
  { key: 'transport',     label: 'Transport' },
  { key: 'diesel',        label: 'Diesel' },
  { key: 'home_expenses', label: 'Home' },
  { key: 'bank_charges',  label: 'Bank' },
  { key: 'other',         label: 'Other' },
  { key: 'clearing',      label: 'Clearing' },
];

export default function ExpenseSummaryPage() {
  const [from, setFrom] = useState(isoNDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<DailyBookExpenseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_book_expense_summary')
      .select('*')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: false });
    setRows((data ?? []) as DailyBookExpenseSummary[]);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const init: Record<string, number> = { total_expense: 0, cr_note: 0, net_expense: 0 };
    for (const c of COLS) init[c.key as string] = 0;
    return rows.reduce((acc, r) => {
      for (const c of COLS) acc[c.key as string] += Number(r[c.key] ?? 0);
      acc.total_expense += Number(r.total_expense);
      acc.cr_note += Number(r.cr_note);
      acc.net_expense += Number(r.net_expense);
      return acc;
    }, init);
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/40 via-white to-pink-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-rose-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-rose-600" /> Expense Summary
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-100" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-100" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Date</th>
                  {COLS.map((c) => (
                    <th key={c.key as string} className="text-right px-3 py-2 font-semibold text-gray-700">{c.label}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Total</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">CR.Note</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Net</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={COLS.length + 4} className="text-center py-10 text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={COLS.length + 4} className="text-center py-10 text-gray-400">No expenses in this range.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.entry_date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{r.entry_date}</td>
                    {COLS.map((c) => {
                      const v = Number(r[c.key] ?? 0);
                      return <td key={c.key as string} className="px-3 py-2 text-right">{v ? '₹' + fmtINR(v) : '—'}</td>;
                    })}
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">₹{fmtINR(Number(r.total_expense))}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{Number(r.cr_note) > 0 ? '₹' + fmtINR(Number(r.cr_note)) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-rose-700">₹{fmtINR(Number(r.net_expense))}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-rose-50 border-t-2 border-rose-200">
                  <tr>
                    <td className="px-3 py-2 font-bold text-rose-900">TOTAL</td>
                    {COLS.map((c) => (
                      <td key={c.key as string} className="px-3 py-2 text-right font-bold text-rose-900">₹{fmtINR(totals[c.key as string])}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold text-rose-900">₹{fmtINR(totals.total_expense)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">₹{fmtINR(totals.cr_note)}</td>
                    <td className="px-3 py-2 text-right font-bold text-rose-900">₹{fmtINR(totals.net_expense)}</td>
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
