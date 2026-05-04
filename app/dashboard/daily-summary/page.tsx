'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, DailyCollection } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import { Calendar, Download, RefreshCw, IndianRupee, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const RANGES = {
  '7':   { label: 'Last 7 days',   days: 7 },
  '30':  { label: 'Last 30 days',  days: 30 },
  '90':  { label: 'Last 90 days',  days: 90 },
  'all': { label: 'All time',      days: null },
} as const;
type RangeKey = keyof typeof RANGES;

export default function DailyCollectionPage() {
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
    bills: rows.reduce((s, r) => s + Number(r.payment_count || 0), 0),
    cash: rows.reduce((s, r) => s + Number(r.cash_received || 0), 0),
    online: rows.reduce((s, r) => s + Number(r.online_received || 0), 0),
    total: rows.reduce((s, r) => s + Number(r.total_collected || 0), 0),
    change: rows.reduce((s, r) => s + Number(r.change_given || 0), 0),
    sameDay: rows.reduce((s, r) => s + Number(r.billed_same_day || 0), 0),
    oldDue: rows.reduce((s, r) => s + Number(r.old_due_collected || 0), 0),
  }), [rows]);

  const avgPerDay = rows.length > 0 ? totals.total / rows.length : 0;
  const cashRatio = totals.total > 0 ? (totals.cash / totals.total) * 100 : 0;

  // Compare to prior period for trend
  const trend = useMemo(() => {
    const days = RANGES[range].days;
    if (!days || rows.length < 2) return null;
    // Naive: compare top half to bottom half (recent vs older within range)
    const mid = Math.floor(rows.length / 2);
    const recent = rows.slice(0, mid).reduce((s, r) => s + Number(r.total_collected || 0), 0);
    const older = rows.slice(mid).reduce((s, r) => s + Number(r.total_collected || 0), 0);
    if (older === 0) return null;
    return ((recent - older) / older) * 100;
  }, [rows, range]);

  const chartData = useMemo(() => [...rows].reverse().slice(-30), [rows]);
  const maxValue = useMemo(
    () => Math.max(1, ...chartData.map((r) => Number(r.total_collected))),
    [chartData],
  );

  const exportCsv = () => {
    const headers = ['Date', 'Bills Paid', 'Cash', 'Online', 'Total', 'Change', 'Same-day', 'Old-due'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([r.date, r.payment_count, r.cash_received, r.online_received, r.total_collected, r.change_given, r.billed_same_day, r.old_due_collected].join(','));
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
              Daily Collection
            </h1>
            <p className="text-sm text-gray-500">
              Money received per day. Includes payments for old credit and same-day cash on delivery.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium flex-1 sm:flex-initial"
            >
              {Object.entries(RANGES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <button
              onClick={() => { setRefreshing(true); fetch(); }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tile
            label="Total Collected"
            value={`₹${totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            sub={trend != null ? <Trend val={trend} /> : `${rows.length} days`}
            color="emerald"
          />
          <Tile
            label="Bills Paid"
            value={String(totals.bills)}
            sub={`avg ₹${(totals.bills > 0 ? totals.total / totals.bills : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}/bill`}
            color="indigo"
          />
          <Tile
            label="Cash"
            value={`₹${totals.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            sub={`${Math.round(cashRatio)}% of total`}
            color="amber"
          />
          <Tile
            label="Online"
            value={`₹${totals.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            sub={`${Math.round(100 - cashRatio)}% of total`}
            color="cyan"
          />
        </div>

        {/* Same-day vs Old-due breakdown */}
        {totals.total > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-6">
            <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-700">How were collections earned?</h3>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                avg ₹{avgPerDay.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / day
              </span>
            </div>
            <div className="flex h-8 rounded-lg overflow-hidden">
              {totals.sameDay > 0 && (
                <div
                  className="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(totals.sameDay / totals.total) * 100}%` }}
                  title={`Same-day: ₹${totals.sameDay.toLocaleString('en-IN')}`}
                >
                  {Math.round((totals.sameDay / totals.total) * 100)}%
                </div>
              )}
              {totals.oldDue > 0 && (
                <div
                  className="bg-amber-500 flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(totals.oldDue / totals.total) * 100}%` }}
                  title={`Old-due: ₹${totals.oldDue.toLocaleString('en-IN')}`}
                >
                  {Math.round((totals.oldDue / totals.total) * 100)}%
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-xs text-gray-600 mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>Same-day cash: <strong className="text-emerald-700">₹{totals.sameDay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span>Old-due collected: <strong className="text-amber-700">₹{totals.oldDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
              </span>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-6">
            <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-700">
                Daily Collection (₹) — last {chartData.length} days
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <Legend color="bg-emerald-500" label="Cash" />
                <Legend color="bg-cyan-500" label="Online" />
              </div>
            </div>
            <div className="flex items-end gap-0.5 sm:gap-1 h-44 sm:h-48">
              {chartData.map((r, i) => {
                const cash = Number(r.cash_received);
                const online = Number(r.online_received);
                const total = cash + online;
                const h = (total / maxValue) * 100;
                const dt = new Date(r.date);
                // Show month abbreviation on first bar of the chart and on the
                // 1st of each month; otherwise just the day number, and only
                // every Nth bar so labels never overlap.
                const isFirst = i === 0;
                const isMonthStart = dt.getDate() === 1;
                const labelStride = chartData.length > 60 ? 7 : chartData.length > 30 ? 5 : chartData.length > 14 ? 3 : 1;
                const showXLabel = isFirst || isMonthStart || i === chartData.length - 1 || i % labelStride === 0;
                const labelText = isFirst || isMonthStart
                  ? dt.toLocaleString('en-US', { month: 'short' }) + ' ' + dt.getDate()
                  : String(dt.getDate());
                return (
                  <div
                    key={r.date}
                    className="flex-1 flex flex-col items-center min-w-0 group"
                    title={`${formatDate(r.date)}\nCash ₹${cash.toLocaleString('en-IN')}\nOnline ₹${online.toLocaleString('en-IN')}\nTotal ₹${total.toLocaleString('en-IN')}`}
                  >
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden group-hover:opacity-80 transition-opacity" style={{ height: `${h}%`, minHeight: total > 0 ? 2 : 0 }}>
                      {cash > 0 && <div className="bg-emerald-500" style={{ height: `${(cash / total) * 100}%` }} />}
                      {online > 0 && <div className="bg-cyan-500" style={{ height: `${(online / total) * 100}%` }} />}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 truncate w-full text-center leading-tight">
                      {showXLabel ? labelText : ''}
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
            <p className="text-gray-500">No collections in this date range yet.</p>
            <p className="text-xs text-gray-400 mt-1">Collections will appear here when staff records payments in deliveries.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {rows.map((r) => (
                <div key={r.date} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-gray-900">{formatDate(r.date)}</div>
                    <div className="text-base font-display font-bold text-gray-900">
                      ₹{Number(r.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <span className="text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                      Cash ₹{Number(r.cash_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-cyan-700 bg-cyan-50 rounded px-2 py-1">
                      Online ₹{Number(r.online_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    {Number(r.change_given) > 0 && (
                      <span className="text-amber-700 bg-amber-50 rounded px-2 py-1">
                        Change ₹{Number(r.change_given).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    <span className="text-gray-700 bg-gray-50 rounded px-2 py-1">
                      {r.payment_count} payment{r.payment_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  {(Number(r.billed_same_day) > 0 || Number(r.old_due_collected) > 0) && (
                    <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-2">
                      {Number(r.billed_same_day) > 0 && <span>Same-day ₹{Number(r.billed_same_day).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                      {Number(r.old_due_collected) > 0 && <span>· Old-due ₹{Number(r.old_due_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                    </div>
                  )}
                </div>
              ))}
              {/* Totals */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mt-3">
                <div className="font-semibold text-xs uppercase text-gray-600 mb-1">Totals</div>
                <div className="text-2xl font-display font-bold text-gray-900">
                  ₹{totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>Cash ₹{totals.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  <span className="text-gray-300">·</span>
                  <span>Online ₹{totals.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  <span className="text-gray-300">·</span>
                  <span>{totals.bills} payments</span>
                </div>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>Date</Th>
                    <Th align="right">Bills Paid</Th>
                    <Th align="right">Cash</Th>
                    <Th align="right">Online</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Change Out</Th>
                    <Th align="right">Same-day</Th>
                    <Th align="right">Old-due</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.date} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">{r.payment_count}</td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-700">
                        ₹{Number(r.cash_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-cyan-700">
                        ₹{Number(r.online_received).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        ₹{Number(r.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-amber-700">
                        ₹{Number(r.change_given).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-600">
                        ₹{Number(r.billed_same_day).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-amber-600">
                        ₹{Number(r.old_due_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                    <td className="px-4 py-3 text-sm uppercase">Totals</td>
                    <td className="px-4 py-3 text-right text-sm">{totals.bills}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-700">₹{totals.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-cyan-700">₹{totals.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm">₹{totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-amber-700">₹{totals.change.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-700">₹{totals.sameDay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right text-sm text-amber-700">₹{totals.oldDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </div>
          </>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Tile({ label, value, sub, color }: {
  label: string;
  value: string;
  sub: React.ReactNode;
  color: 'emerald' | 'indigo' | 'amber' | 'cyan';
}) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    cyan:    'bg-cyan-50 border-cyan-200 text-cyan-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-70">
        <IndianRupee className="w-3.5 h-3.5" /> {label}
      </div>
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
      {Math.abs(val).toFixed(0)}% vs prior
    </span>
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
