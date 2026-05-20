'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, DailyBookPaymentReconciliation } from '@/lib/supabase';
import { ArrowLeft, ShieldCheck, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

export default function ReconciliationPage() {
  const [from, setFrom] = useState(isoNDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<DailyBookPaymentReconciliation[]>([]);
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_book_payment_reconciliation')
      .select('*')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: false });
    setRows((data ?? []) as DailyBookPaymentReconciliation[]);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const visible = showOnlyMismatches
    ? rows.filter((r) => Math.abs(Number(r.total_diff)) > 1)
    : rows;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50/40 via-white to-emerald-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-teal-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-600" /> Reconciliation
            </h1>
            <div className="text-xs text-gray-500 mt-0.5">Daily Book sales vs Customer Payments table</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showOnlyMismatches}
              onChange={(e) => setShowOnlyMismatches(e.target.checked)}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            Show only mismatches
          </label>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th rowSpan={2} className="text-left px-3 py-2 font-semibold text-gray-700 align-bottom">Date</th>
                  <th colSpan={3} className="px-3 py-1 font-semibold text-gray-700 text-center border-l border-gray-200">Cash</th>
                  <th colSpan={3} className="px-3 py-1 font-semibold text-gray-700 text-center border-l border-gray-200">Online</th>
                  <th colSpan={3} className="px-3 py-1 font-semibold text-gray-700 text-center border-l border-gray-200">POS/QR</th>
                  <th rowSpan={2} className="px-3 py-2 font-semibold text-gray-700 text-right align-bottom border-l border-gray-200">Total Diff</th>
                </tr>
                <tr className="text-xs">
                  <th className="px-2 py-1 text-right text-gray-600 border-l border-gray-200">DB</th>
                  <th className="px-2 py-1 text-right text-gray-600">Pmt</th>
                  <th className="px-2 py-1 text-right text-gray-600">Δ</th>
                  <th className="px-2 py-1 text-right text-gray-600 border-l border-gray-200">DB</th>
                  <th className="px-2 py-1 text-right text-gray-600">Pmt</th>
                  <th className="px-2 py-1 text-right text-gray-600">Δ</th>
                  <th className="px-2 py-1 text-right text-gray-600 border-l border-gray-200">DB</th>
                  <th className="px-2 py-1 text-right text-gray-600">Pmt</th>
                  <th className="px-2 py-1 text-right text-gray-600">Δ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">Loading…</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">
                    {showOnlyMismatches ? 'No mismatches in this range — everything ties out.' : 'No data in this range.'}
                  </td></tr>
                ) : visible.map((r) => {
                  const totalDiff = Number(r.total_diff);
                  const isMatch = Math.abs(totalDiff) < 1;
                  return (
                    <tr key={r.entry_date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{r.entry_date}</td>
                      <DiffCell db={Number(r.daily_book_cash)} pmt={Number(r.payments_cash)} diff={Number(r.cash_diff)} />
                      <DiffCell db={Number(r.daily_book_online)} pmt={Number(r.payments_online)} diff={Number(r.online_diff)} />
                      <DiffCell db={Number(r.daily_book_pos_qr)} pmt={Number(r.payments_pos_qr)} diff={Number(r.pos_qr_diff)} />
                      <td className={`px-3 py-2 text-right font-bold border-l border-gray-200 ${isMatch ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {isMatch ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> match
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {totalDiff > 0 ? '+' : '−'}₹{fmtINR(Math.abs(totalDiff))}
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

        <div className="text-xs text-gray-500 px-1">
          <strong>DB</strong> = aggregate sales from Daily Book entries ·
          <strong className="ml-2">Pmt</strong> = sum of customer payments (from existing app)
          for that date. Small differences usually mean a customer payment was logged in one place
          but not the other, or a sale was netted across days.
        </div>
      </main>
    </div>
  );
}

function DiffCell({ db, pmt, diff }: { db: number; pmt: number; diff: number }) {
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
  const isMatch = Math.abs(diff) < 1;
  return (
    <>
      <td className="px-2 py-2 text-right text-gray-700 border-l border-gray-200">{db ? '₹' + fmt(db) : '—'}</td>
      <td className="px-2 py-2 text-right text-gray-700">{pmt ? '₹' + fmt(pmt) : '—'}</td>
      <td className={`px-2 py-2 text-right text-xs font-semibold ${isMatch ? 'text-emerald-600' : 'text-rose-600'}`}>
        {isMatch ? '✓' : (diff > 0 ? '+' : '−') + '₹' + fmt(Math.abs(diff))}
      </td>
    </>
  );
}
