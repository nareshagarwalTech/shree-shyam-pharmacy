'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, CustomerAging } from '@/lib/supabase';
import { generateDueMessage, generateWhatsAppUrl } from '@/lib/whatsapp';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import PhoneLink from '@/components/PhoneLink';
import Toast from '@/components/Toast';
import { Search, Hourglass, MessageCircle, Download, RefreshCw, AlertTriangle, Phone } from 'lucide-react';

export default function AgingPage() {
  const [rows, setRows] = useState<CustomerAging[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState<'all' | '0-30' | '31-60' | '61-90' | '90+'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('customer_aging')
      .select('*')
      .order('oldest_age_days', { ascending: false });
    if (error) setToast({ message: error.message, type: 'error' });
    else setRows((data || []) as CustomerAging[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totals = useMemo(() => ({
    customers: rows.length,
    outstanding: rows.reduce((s, r) => s + Number(r.outstanding || 0), 0),
    bucket_0_30: rows.reduce((s, r) => s + Number(r.bucket_0_30 || 0), 0),
    bucket_31_60: rows.reduce((s, r) => s + Number(r.bucket_31_60 || 0), 0),
    bucket_61_90: rows.reduce((s, r) => s + Number(r.bucket_61_90 || 0), 0),
    bucket_90_plus: rows.reduce((s, r) => s + Number(r.bucket_90_plus || 0), 0),
  }), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          (/\d/.test(q) && r.phone.includes(q.replace(/\D/g, ''))),
      );
    }
    if (bucketFilter === '0-30')   out = out.filter((r) => Number(r.bucket_0_30 || 0) > 0);
    if (bucketFilter === '31-60')  out = out.filter((r) => Number(r.bucket_31_60 || 0) > 0);
    if (bucketFilter === '61-90')  out = out.filter((r) => Number(r.bucket_61_90 || 0) > 0);
    if (bucketFilter === '90+')    out = out.filter((r) => Number(r.bucket_90_plus || 0) > 0);
    return out;
  }, [rows, searchQuery, bucketFilter]);

  const sendDueReminder = (r: CustomerAging) => {
    const msg = generateDueMessage(r.customer_name, Number(r.outstanding), 'en');
    window.open(generateWhatsAppUrl(r.phone, msg), '_blank', 'noopener,noreferrer');
  };

  const exportCsv = () => {
    const headers = ['Name', 'Phone', 'Outstanding', '0-30 days', '31-60 days', '61-90 days', '90+ days', 'Oldest Age', 'Oldest Bill Date', 'Unpaid Bill Count'];
    const lines = [headers.join(',')];
    for (const r of filtered) {
      lines.push([
        `"${r.customer_name.replace(/"/g, '""')}"`,
        r.phone,
        r.outstanding,
        r.bucket_0_30,
        r.bucket_31_60,
        r.bucket_61_90,
        r.bucket_90_plus,
        r.oldest_age_days,
        r.oldest_unpaid_date || '',
        r.unpaid_bill_count,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customer-aging-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Hourglass className="w-6 h-6 text-amber-600" />
              Aging Report
            </h1>
            <p className="text-sm text-gray-500">How long each customer&apos;s debt has been pending. Click a bucket to filter.</p>
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

        {/* Bucket cards (clickable filters) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <BucketCard
            label="0–30 days"
            value={totals.bucket_0_30}
            count={rows.filter((r) => Number(r.bucket_0_30 || 0) > 0).length}
            color="emerald"
            active={bucketFilter === '0-30'}
            onClick={() => setBucketFilter(bucketFilter === '0-30' ? 'all' : '0-30')}
          />
          <BucketCard
            label="31–60 days"
            value={totals.bucket_31_60}
            count={rows.filter((r) => Number(r.bucket_31_60 || 0) > 0).length}
            color="amber"
            active={bucketFilter === '31-60'}
            onClick={() => setBucketFilter(bucketFilter === '31-60' ? 'all' : '31-60')}
          />
          <BucketCard
            label="61–90 days"
            value={totals.bucket_61_90}
            count={rows.filter((r) => Number(r.bucket_61_90 || 0) > 0).length}
            color="orange"
            active={bucketFilter === '61-90'}
            onClick={() => setBucketFilter(bucketFilter === '61-90' ? 'all' : '61-90')}
          />
          <BucketCard
            label="90+ days"
            value={totals.bucket_90_plus}
            count={rows.filter((r) => Number(r.bucket_90_plus || 0) > 0).length}
            color="red"
            active={bucketFilter === '90+'}
            onClick={() => setBucketFilter(bucketFilter === '90+' ? 'all' : '90+')}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customer or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="text-sm text-gray-600">
              {filtered.length} customers · ₹{filtered.reduce((s, r) => s + Number(r.outstanding || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} outstanding
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Hourglass className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No customers in this bucket.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((r) => {
                const buckets: Array<[string, number, string]> = [
                  ['0-30', Number(r.bucket_0_30 || 0), 'text-emerald-700 bg-emerald-50'],
                  ['31-60', Number(r.bucket_31_60 || 0), 'text-amber-700 bg-amber-50'],
                  ['61-90', Number(r.bucket_61_90 || 0), 'text-orange-700 bg-orange-50'],
                  ['90+', Number(r.bucket_90_plus || 0), 'text-red-700 bg-red-50'],
                ];
                return (
                  <div key={r.customer_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/customer/${r.phone}`}
                          className="font-semibold text-gray-900 hover:text-emerald-600 truncate block"
                        >
                          {r.customer_name}
                        </Link>
                        <PhoneLink phone={r.phone} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 mt-0.5" />
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-display font-bold text-red-600">
                          ₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[11px] text-gray-500">{r.oldest_age_days} days · {r.unpaid_bill_count} bill{r.unpaid_bill_count === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mb-2">
                      {buckets.filter(([, v]) => v > 0).map(([label, v, cls]) => (
                        <span key={label} className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
                          {label}: ₹{v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <a
                        href={`tel:${r.phone}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        Call
                      </a>
                      <button
                        onClick={() => sendDueReminder(r)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Send WhatsApp
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>Customer</Th>
                    <Th align="right">Outstanding</Th>
                    <Th align="right">Oldest</Th>
                    <Th align="right">0-30</Th>
                    <Th align="right">31-60</Th>
                    <Th align="right">61-90</Th>
                    <Th align="right">90+</Th>
                    <Th align="right">Bills</Th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => (
                    <tr key={r.customer_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/dashboard/customer/${r.phone}`}
                          className="font-medium text-gray-900 hover:text-emerald-600"
                        >
                          {r.customer_name}
                        </Link>
                        <PhoneLink phone={r.phone} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600" />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                        ₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="font-semibold text-gray-900">{r.oldest_age_days} days</div>
                        {r.oldest_unpaid_date && <div className="text-xs text-gray-500">{formatDate(r.oldest_unpaid_date)}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-700">{cell(r.bucket_0_30)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700">{cell(r.bucket_31_60)}</td>
                      <td className="px-4 py-2.5 text-right text-orange-700">{cell(r.bucket_61_90)}</td>
                      <td className="px-4 py-2.5 text-right text-red-700">{cell(r.bucket_90_plus)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{r.unpaid_bill_count}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={`tel:${r.phone}`}
                            className="p-2 rounded-lg text-purple-600 hover:bg-purple-50"
                            title="Call customer"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => sendDueReminder(r)}
                            className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"
                            title="Send WhatsApp reminder"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
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

function cell(v: number | null) {
  const n = Number(v || 0);
  if (n === 0) return <span className="text-gray-300">—</span>;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function BucketCard({ label, value, count, color, active, onClick }: {
  label: string;
  value: number;
  count: number;
  color: 'emerald' | 'amber' | 'orange' | 'red';
  active: boolean;
  onClick: () => void;
}) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    amber:   'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
    orange:  'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
    red:     'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
  };
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all ${map[color]} ${active ? 'ring-2 ring-offset-2 ring-emerald-500' : ''}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium opacity-70">
        <AlertTriangle className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-display font-bold mt-1">
        ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
      <div className="text-xs opacity-70 mt-1">{count} customer{count === 1 ? '' : 's'}</div>
    </button>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>{children}</th>;
}
