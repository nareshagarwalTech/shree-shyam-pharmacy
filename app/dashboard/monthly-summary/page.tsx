'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, MonthlyCollection } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import { CalendarRange, Download, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function MonthlyCollectionPage() {
  const [rows, setRows] = useState<MonthlyCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('monthly_collection')
      .select('*')
      .order('month', { ascending: false })
      .limit(36);
    if (error) setToast({ message: error.message, type: 'error' });
    else setRows((data || []) as MonthlyCollection[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const chartData = useMemo(() => [...rows].reverse(), [rows]);
  const maxValue = useMemo(
    () => Math.max(1, ...chartData.map((r) => Number(r.total_collected))),
    [chartData],
  );

  const totals = useMemo(() => ({
    months: rows.length,
    bills: rows.reduce((s, r) => s + Number(r.bills_paid || 0), 0),
    cash: rows.reduce((s, r) => s + Number(r.cash_received || 0), 0),
    online: rows.reduce((s, r) => s + Number(r.online_received || 0), 0),
    total: rows.reduce((s, r) => s + Number(r.total_collected || 0), 0),
  }), [rows]);

  // MoM comparison
  const mom = useMemo(() => {
    if (rows.length < 2) return null;
    const cur = Number(rows[0].total_collected);
    const prev = Number(rows[1].total_collected);
    if (prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  }, [rows]);

  const exportCsv = () => {
    const headers = ['Month', 'Bills Paid', 'Unique Customers', 'Cash', 'Online', 'Total', 'Change Given', 'Avg per Bill'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([r.month_label, r.bills_paid, r.unique_customers, r.cash_received, r.online_received, r.total_collected, r.change_given, r.avg_per_bill].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `monthly-collection.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <CalendarRange className="w-6 h-6 text-emerald-600" />
              Monthly Collection
            </h1>
            <p className="text-sm text-gray-500">Month-over-month collection. Last 36 months.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); fetch(); }}
              className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50"
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

        {rows.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile
              label="This Month"
              value={`₹${Number(rows[0].total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={mom != null ? <Trend val={mom} /> : `${rows[0].bills_paid} bills`}
              color="emerald"
            />
            <Tile
              label="Bills Paid"
              value={String(rows[0].bills_paid || 0)}
              sub={`${rows[0].unique_customers || 0} unique customers`}
              color="indigo"
            />
            <Tile
              label="Avg per Bill"
              value={`₹${Number(rows[0].avg_per_bill || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={rows[0].month_label}
              color="amber"
            />
            <Tile
              label="All-time Total"
              value={`₹${totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={`${totals.bills} bills · ${totals.months} months`}
              color="cyan"
            />
          </div>
        )}

        {chartData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Total Collected (₹) — last {chartData.length} months
            </h3>
            <div className="flex items-end gap-2 h-56">
              {chartData.map((r) => {
                const cash = Number(r.cash_received);
                const online = Number(r.online_received);
                const total = cash + online;
                const h = (total / maxValue) * 100;
                return (
                  <div
                    key={r.month_label}
                    className="flex-1 flex flex-col items-center min-w-0 group"
                    title={`${r.month_label}\nCash ₹${cash.toLocaleString('en-IN')}\nOnline ₹${online.toLocaleString('en-IN')}\nTotal ₹${total.toLocaleString('en-IN')}\n${r.bills_paid} bills`}
                  >
                    <div className="text-[10px] text-gray-500 mb-1">
                      {total > 0 ? `₹${(total / 1000).toFixed(0)}k` : ''}
                    </div>
                    <div
                      className="w-full flex flex-col-reverse rounded-t overflow-hidden group-hover:opacity-80"
                      style={{ height: `${h}%`, minHeight: total > 0 ? 4 : 0 }}
                    >
                      {cash > 0 && <div className="bg-emerald-500" style={{ height: `${(cash / total) * 100}%` }} />}
                      {online > 0 && <div className="bg-cyan-500" style={{ height: `${(online / total) * 100}%` }} />}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">
                      {r.month_label.slice(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <CalendarRange className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No collections recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <Th>Month</Th>
                  <Th align="right">Bills Paid</Th>
                  <Th align="right">Customers</Th>
                  <Th align="right">Cash</Th>
                  <Th align="right">Online</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Avg/Bill</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.month_label} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.month_label}</td>
                    <td className="px-4 py-3 text-right text-sm">{r.bills_paid}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{r.unique_customers}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-700">₹{Number(r.cash_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-cyan-700">₹{Number(r.online_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold">₹{Number(r.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">₹{Number(r.avg_per_bill || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Tile({ label, value, sub, color }: {
  label: string; value: string; sub: React.ReactNode;
  color: 'emerald' | 'indigo' | 'amber' | 'cyan';
}) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
      <div className="text-xs opacity-70 mt-1">{sub}</div>
    </div>
  );
}

function Trend({ val }: { val: number }) {
  if (Math.abs(val) < 1) return <span className="text-gray-500">no change</span>;
  const up = val > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(val).toFixed(0)}% MoM
    </span>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>{children}</th>;
}
