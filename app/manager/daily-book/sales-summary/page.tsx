'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, DailyBookSalesSummary } from '@/lib/supabase';
import { ArrowLeft, TrendingUp, Calendar } from 'lucide-react';

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function isoNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export default function SalesSummaryPage() {
  const [from, setFrom] = useState(isoNDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<DailyBookSalesSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_book_sales_summary')
      .select('*')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: false });
    setRows((data ?? []) as DailyBookSalesSummary[]);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.pos_txn += Number(r.pos_txn);
      acc.qr_txn += Number(r.qr_txn);
      acc.online_amt += Number(r.online_amt);
      acc.credit_amt += Number(r.credit_amt);
      acc.cash_sales += Number(r.cash_sales);
      acc.total_sales += Number(r.total_sales);
      return acc;
    }, { pos_txn: 0, qr_txn: 0, online_amt: 0, credit_amt: 0, cash_sales: 0, total_sales: 0 });
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-emerald-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" /> Sales Summary
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">POS Txn</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">POS Settled</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">QR Txn</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">QR Settled</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Online</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Credit</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Cash</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">No sales in this range.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.entry_date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{r.entry_date}</td>
                    <td className="px-3 py-2 text-right">{r.pos_txn ? '₹' + fmtINR(Number(r.pos_txn)) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.pos_settled ? '₹' + fmtINR(Number(r.pos_settled)) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.qr_txn ? '₹' + fmtINR(Number(r.qr_txn)) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.qr_settled ? '₹' + fmtINR(Number(r.qr_settled)) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.online_amt ? '₹' + fmtINR(Number(r.online_amt)) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.credit_amt ? '₹' + fmtINR(Number(r.credit_amt)) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.cash_sales ? '₹' + fmtINR(Number(r.cash_sales)) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">₹{fmtINR(Number(r.total_sales))}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                  <tr>
                    <td className="px-3 py-2 font-bold text-emerald-900">TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-900">₹{fmtINR(totals.pos_txn)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-900">₹{fmtINR(totals.qr_txn)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-900">₹{fmtINR(totals.online_amt)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-900">₹{fmtINR(totals.credit_amt)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-900">₹{fmtINR(totals.cash_sales)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-900">₹{fmtINR(totals.total_sales)}</td>
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
