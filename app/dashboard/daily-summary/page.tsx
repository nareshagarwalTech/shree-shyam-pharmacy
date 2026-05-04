'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, DailyCollection } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import { Calendar, Download, RefreshCw, IndianRupee } from 'lucide-react';

const RANGES = {
  '7':  { label: 'Last 7 days',  days: 7  },
  '30': { label: 'Last 30 days', days: 30 },
  '90': { label: 'Last 90 days', days: 90 },
  'all': { label: 'All time',    days: null },
} as const;

type RangeKey = keyof typeof RANGES;

export default function DailySummaryPage() {
  const [rows, setRows] = useState<DailyCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>('30');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetch = useCallback(async () => {
    let q = supabase.from('daily_collection').select('*').order('date', { ascending: false });
    if (RANGES[range].days != null) {
      const since = new Date(Date.now() - RANGES[range].days! * 86400000).toISOString().slice(0, 10);
      q = q.gte('date', since);
    }
    const { data, error } = await q;
    if (error) setToast({ message: error.message, type: 'error' });
    else setRows((data || []) as DailyCollection[]);
    setLoading(false);
    setRefreshing(false);
  }, [range]);

  useEffect(() => { fetch(); }, [fetch]);

  const totals = useMemo(() => ({
    bills: rows.reduce((s, r) => s + Number(r.bills_delivered || 0), 0),
    billed: rows.reduce((s, r) => s + Number(r.total_billed || 0), 0),
    cash: rows.reduce((s, r) => s + Number(r.cash_received || 0), 0),
    online: rows.reduce((s, r) => s + Number(r.online_received || 0), 0),
    credit: rows.reduce((s, r) => s + Number(r.credit_given || 0), 0),
    change: rows.reduce((s, r) => s + Number(r.change_given || 0), 0),
    balance: rows.reduce((s, r) => s + Number(r.balance_left || 0), 0),
  }), [rows]);

  const chartData = useMemo(() => [...rows].reverse().slice(-30), [rows]);
  const maxValue = useMemo(
    () => Math.max(1, ...chartData.map((r) =>
      Number(r.cash_received) + Number(r.online_received) + Number(r.credit_given || 0)
    )),
    [chartData],
  );

  const exportCsv = () => {
    const headers = ['Date', 'Bills Delivered', 'Total Billed', 'Change Given', 'Cash Received', 'Online Received', 'Credit Given', 'Balance Left'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([r.date, r.bills_delivered, r.total_billed, r.change_given, r.cash_received, r.online_received, r.credit_given, r.balance_left].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-collection-${range}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-emerald-600" />
              Daily Collection Summary
            </h1>
            <p className="text-sm text-gray-500">
              Bills counted by delivery date, payments by collection date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium"
            >
              {Object.entries(RANGES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <button
              onClick={() => { setRefreshing(true); fetch(); }}
              className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        {/* Top stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tile label="Bills" value={totals.bills.toString()} icon={<Calendar className="w-5 h-5" />} color="indigo" />
          <Tile label="Billed" value={`₹${totals.billed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={<IndianRupee className="w-5 h-5" />} color="blue" />
          <Tile label="Cash" value={`₹${totals.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={<IndianRupee className="w-5 h-5" />} color="emerald" />
          <Tile label="Online" value={`₹${totals.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={<IndianRupee className="w-5 h-5" />} color="cyan" />
        </div>

        {/* Stacked bar chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Cash vs Online vs Credit (₹) — last {chartData.length} days</h3>
              <div className="flex items-center gap-3 text-xs">
                <Legend color="bg-emerald-500" label="Cash" />
                <Legend color="bg-cyan-500" label="Online" />
                <Legend color="bg-amber-400" label="Credit" />
              </div>
            </div>
            <div className="flex items-end gap-1 h-48">
              {chartData.map((r) => {
                const cash = Number(r.cash_received);
                const online = Number(r.online_received);
                const credit = Number(r.credit_given || 0);
                const total = cash + online + credit;
                const h = (total / maxValue) * 100;
                return (
                  <div key={r.date} className="flex-1 flex flex-col items-center min-w-0" title={`${formatDate(r.date)}\n₹${total.toLocaleString('en-IN')}`}>
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${h}%`, minHeight: total > 0 ? 2 : 0 }}>
                      {cash > 0 && <div className="bg-emerald-500" style={{ height: `${(cash / total) * 100}%` }} />}
                      {online > 0 && <div className="bg-cyan-500" style={{ height: `${(online / total) * 100}%` }} />}
                      {credit > 0 && <div className="bg-amber-400" style={{ height: `${(credit / total) * 100}%` }} />}
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">
                      {new Date(r.date).getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No collections in this date range.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>Date</Th>
                    <Th align="right">Bills</Th>
                    <Th align="right">Billed</Th>
                    <Th align="right">Change</Th>
                    <Th align="right">Cash</Th>
                    <Th align="right">Online</Th>
                    <Th align="right">Credit</Th>
                    <Th align="right">Balance Left</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.date} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">{r.bills_delivered}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        ₹{Number(r.total_billed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-amber-700">
                        ₹{Number(r.change_given).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-700">
                        ₹{Number(r.cash_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-cyan-700">
                        ₹{Number(r.online_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-amber-700">
                        ₹{Number(r.credit_given || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                        ₹{Number(r.balance_left).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                    <td className="px-4 py-3 text-sm text-gray-900 uppercase">Totals</td>
                    <td className="px-4 py-3 text-right text-sm">{totals.bills}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">₹{totals.billed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-amber-700">₹{totals.change.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-700">₹{totals.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-cyan-700">₹{totals.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-amber-700">₹{totals.credit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-700">₹{totals.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Tile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'indigo'|'blue'|'emerald'|'cyan' }) {
  const map: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-70">
        {icon}{label}
      </div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-600">
      <span className={`w-3 h-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>
      {children}
    </th>
  );
}
