'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, TopCustomer } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import PhoneLink from '@/components/PhoneLink';
import Toast from '@/components/Toast';
import { Trophy, Search, Download, RefreshCw, Receipt } from 'lucide-react';

type SortKey = 'total_billed' | 'total_collected' | 'outstanding' | 'bill_count';

export default function TopCustomersPage() {
  const [rows, setRows] = useState<TopCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('total_billed');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState<25 | 50 | 100 | 'all'>(25);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    let q = supabase.from('top_customers').select('*');
    q = q.order(sortBy, { ascending: false });
    if (limit !== 'all') q = q.limit(limit);
    const { data, error } = await q;
    if (error) setToast({ message: error.message, type: 'error' });
    else setRows((data || []) as TopCustomer[]);
    setLoading(false);
    setRefreshing(false);
  }, [sortBy, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        (/\d/.test(q) && r.phone.includes(q.replace(/\D/g, ''))),
    );
  }, [rows, search]);

  const totals = useMemo(() => ({
    customers: filtered.length,
    billed: filtered.reduce((s, r) => s + Number(r.total_billed || 0), 0),
    collected: filtered.reduce((s, r) => s + Number(r.total_collected || 0), 0),
    outstanding: filtered.reduce((s, r) => s + Number(r.outstanding || 0), 0),
  }), [filtered]);

  const exportCsv = () => {
    const headers = ['Rank', 'Name', 'Phone', 'Bills', 'Total Billed', 'Total Paid', 'Outstanding', 'Last Delivery', 'Last Payment'];
    const lines = [headers.join(',')];
    filtered.forEach((r, i) => {
      lines.push([
        i + 1,
        `"${r.customer_name.replace(/"/g, '""')}"`,
        r.phone,
        r.bill_count,
        r.total_billed,
        r.total_collected,
        r.outstanding,
        r.last_delivery_date || '',
        r.last_payment_date || '',
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `top-customers-by-${sortBy}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-500" />
              Top Customers
            </h1>
            <p className="text-sm text-gray-500">Ranked by lifetime value. Click any name for full statement.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); fetchData(); }}
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tile label="Customers" value={String(totals.customers)} color="indigo" />
          <Tile label="Billed (lifetime)" value={`₹${totals.billed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="blue" />
          <Tile label="Collected" value={`₹${totals.collected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="emerald" />
          <Tile label="Outstanding" value={`₹${totals.outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="red" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Sort by:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {([
                  { k: 'total_billed', label: 'Billed' },
                  { k: 'total_collected', label: 'Collected' },
                  { k: 'outstanding', label: 'Outstanding' },
                  { k: 'bill_count', label: 'Visits' },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    onClick={() => setSortBy(opt.k)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      sortBy === opt.k ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <select
                value={limit}
                onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value) as any)}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium"
              >
                <option value={25}>Top 25</option>
                <option value={50}>Top 50</option>
                <option value={100}>Top 100</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No customers match.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((r, i) => (
                <div key={r.customer_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-start gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-mono font-bold text-sm">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/dashboard/customer/${r.phone}`}
                        className="font-semibold text-gray-900 hover:text-emerald-600 truncate"
                      >
                        {r.customer_name}
                      </Link>
                      <div className="text-base font-display font-bold text-gray-900 shrink-0">
                        ₹{Number(r.total_billed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <PhoneLink phone={r.phone} className="inline-flex items-center gap-1 text-gray-500 hover:text-purple-600" />
                      <span className="text-gray-300">·</span>
                      <span>{r.bill_count} bill{r.bill_count === 1 ? '' : 's'}</span>
                      <span className="text-gray-300">·</span>
                      <span>last {r.last_delivery_date ? formatDate(r.last_delivery_date) : '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs mt-1.5">
                      <span className="text-emerald-700">
                        Paid ₹{Number(r.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                      {Number(r.outstanding) > 0 && (
                        <span className="text-red-600 font-semibold">
                          Owes ₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <Th>#</Th>
                  <Th>Customer</Th>
                  <Th align="right">Bills</Th>
                  <Th align="right">Billed</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Outstanding</Th>
                  <Th>Last visit</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r, i) => (
                  <tr key={r.customer_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/customer/${r.phone}`}
                        className="font-medium text-gray-900 hover:text-emerald-600"
                      >
                        {r.customer_name}
                      </Link>
                      <PhoneLink phone={r.phone} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600" />
                    </td>
                    <td className="px-4 py-3 text-right">{r.bill_count}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      ₹{Number(r.total_billed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      ₹{Number(r.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      Number(r.outstanding) > 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      ₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.last_delivery_date ? formatDate(r.last_delivery_date) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: 'indigo' | 'blue' | 'emerald' | 'red' }) {
  const map: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>{children}</th>;
}
