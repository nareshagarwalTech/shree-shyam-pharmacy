'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, CustomerBalance } from '@/lib/supabase';
import { generateDueMessage, generateWhatsAppUrl } from '@/lib/whatsapp';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import PhoneLink from '@/components/PhoneLink';
import Toast from '@/components/Toast';
import {
  Search,
  AlertTriangle,
  MessageCircle,
  CheckCircle,
  Download,
  RefreshCw,
  Send,
  Phone,
} from 'lucide-react';

export default function PendingPage() {
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    const { data, error } = await supabase
      .from('pending_dues')
      .select('*')
      .order('outstanding', { ascending: false });
    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      setRows((data || []) as CustomerBalance[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const filtered = useMemo(() => {
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        (/\d/.test(q) && r.phone.includes(q.replace(/\D/g, ''))),
    );
  }, [rows, searchQuery]);

  const totals = useMemo(() => ({
    count: filtered.length,
    outstanding: filtered.reduce((s, r) => s + Number(r.outstanding || 0), 0),
    billed: filtered.reduce((s, r) => s + Number(r.total_billed || 0), 0),
    collected: filtered.reduce((s, r) => s + Number(r.total_collected || 0), 0),
  }), [filtered]);

  const sendReminder = (r: CustomerBalance) => {
    const msg = generateDueMessage(
      r.customer_name,
      Number(r.outstanding),
      r.preferred_language,
    );
    const url = generateWhatsAppUrl(r.phone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const sendBulk = async () => {
    const list = filtered.filter((r) => selected.has(r.customer_id));
    if (!list.length) return;
    let ok = 0;
    for (const r of list) {
      sendReminder(r);
      ok++;
      await new Promise((res) => setTimeout(res, 350));
    }
    setToast({ message: `Opened ${ok} WhatsApp tabs.`, type: 'success' });
    setSelected(new Set());
  };

  const markPaid = async (r: CustomerBalance, mode: 'cash' | 'online') => {
    const amt = Number(r.outstanding);
    if (!confirm(`Record a ₹${Math.round(amt)} ${mode} payment for ${r.customer_name}?\n\nThis clears the outstanding balance entirely.`)) return;
    setMarkingPaid(r.customer_id);

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('payments').insert({
      customer_id: r.customer_id,
      amount: amt,
      mode,
      payment_date: today,
      notes: 'cleared from pending list',
    });

    setMarkingPaid(null);
    if (error) {
      setToast({ message: error.message, type: 'error' });
      return;
    }
    setToast({ message: `Recorded ₹${Math.round(amt)} ${mode} payment.`, type: 'success' });
    setRefreshing(true);
    fetchPending();
  };

  const exportCsv = () => {
    const headers = ['Name', 'Phone', 'Total Billed', 'Total Collected', 'Outstanding', 'Bills', 'Last Delivery'];
    const lines = [headers.join(',')];
    for (const r of filtered) {
      lines.push([
        `"${r.customer_name.replace(/"/g, '""')}"`,
        r.phone,
        r.total_billed,
        r.total_collected,
        r.outstanding,
        r.bill_count,
        r.last_delivery_date || '',
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pending-dues-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              Pending Dues
            </h1>
            <p className="text-sm text-gray-500">Customers with outstanding balance</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); fetchPending(); }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium"
              title="Download as CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatTile
            label="Total Outstanding"
            value={`₹${totals.outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            color="red"
          />
          <StatTile
            label="Customers Pending"
            value={totals.count.toString()}
            color="amber"
          />
          <StatTile
            label="Total Billed"
            value={`₹${totals.billed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            color="blue"
          />
          <StatTile
            label="Total Collected"
            value={`₹${totals.collected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            color="emerald"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                placeholder="Search by name or phone…"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            {selected.size > 0 && (
              <button
                onClick={sendBulk}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg"
              >
                <Send className="w-4 h-4" />
                Send {selected.size} Reminder{selected.size === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">All clear!</h3>
            <p className="text-gray-500">No customers with outstanding balance{searchQuery ? ' matching this search' : ''}.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((r) => (
                <div key={r.customer_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.customer_id)}
                      onChange={() => toggleSelect(r.customer_id)}
                      className="w-4 h-4 mt-1 accent-emerald-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <Link
                          href={`/dashboard/customer/${r.phone}`}
                          className="font-semibold text-gray-900 hover:text-emerald-600 truncate"
                        >
                          {r.customer_name}
                        </Link>
                        <div className="text-base font-display font-bold text-red-600 shrink-0">
                          ₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mb-2 flex-wrap">
                        <PhoneLink phone={r.phone} className="inline-flex items-center gap-1 text-gray-500 hover:text-purple-600" />
                        <span className="text-gray-300">·</span>
                        <span>{r.bill_count} bill{r.bill_count === 1 ? '' : 's'}</span>
                        {r.whatsapp_opt_out && (
                          <span className="px-1 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] uppercase">Opted out</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => sendReminder(r)}
                          disabled={r.whatsapp_opt_out}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </button>
                        <a
                          href={`tel:${r.phone}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Call
                        </a>
                        <button
                          onClick={() => markPaid(r, 'cash')}
                          disabled={markingPaid === r.customer_id}
                          className="px-2.5 py-1.5 text-xs rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
                        >
                          Cash
                        </button>
                        <button
                          onClick={() => markPaid(r, 'online')}
                          disabled={markingPaid === r.customer_id}
                          className="px-2.5 py-1.5 text-xs rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold"
                        >
                          Online
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-3 w-10">&nbsp;</th>
                    <Th>Customer</Th>
                    <Th>Phone</Th>
                    <Th align="right">Billed</Th>
                    <Th align="right">Collected</Th>
                    <Th align="right">Outstanding</Th>
                    <Th align="right">Bills</Th>
                    <Th>Last Delivery</Th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => (
                    <tr key={r.customer_id} className="hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.customer_id)}
                          onChange={() => toggleSelect(r.customer_id)}
                          className="w-4 h-4 accent-emerald-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/customer/${r.phone}`}
                          className="font-medium text-gray-900 hover:text-emerald-600"
                        >
                          {r.customer_name}
                        </Link>
                        {r.whatsapp_opt_out && (
                          <div className="text-[10px] text-slate-500 uppercase">opted out</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <PhoneLink phone={r.phone} className="inline-flex items-center gap-1 text-gray-600 hover:text-purple-600" />
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        ₹{Number(r.total_billed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">
                        ₹{Number(r.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                        ₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500">{r.bill_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {r.last_delivery_date ? formatDate(r.last_delivery_date) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => sendReminder(r)}
                            disabled={r.whatsapp_opt_out}
                            className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                            title="Send WhatsApp reminder"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <a
                            href={`tel:${r.phone}`}
                            className="p-2 rounded-lg text-purple-600 hover:bg-purple-50"
                            title="Call customer"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => markPaid(r, 'cash')}
                            disabled={markingPaid === r.customer_id}
                            className="px-2 py-1 text-xs rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
                            title="Mark all bills paid in cash"
                          >
                            Cash
                          </button>
                          <button
                            onClick={() => markPaid(r, 'online')}
                            disabled={markingPaid === r.customer_id}
                            className="px-2 py-1 text-xs rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold"
                            title="Mark all bills paid online"
                          >
                            Online
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

function StatTile({ label, value, color }: { label: string; value: string; color: 'red' | 'amber' | 'blue' | 'emerald' }) {
  const palette: Record<string, string> = {
    red:     'bg-red-50 border-red-200 text-red-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${palette[color]}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>
      {children}
    </th>
  );
}
