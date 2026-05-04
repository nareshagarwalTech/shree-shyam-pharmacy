'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, SalesTransaction } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  Search,
  Plus,
  Receipt,
  RefreshCw,
  Pencil,
  CheckCircle,
} from 'lucide-react';

type Row = SalesTransaction & {
  customer_name?: string;
};

export default function DeliveriesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'pending' | 'paid'>('all');
  const [editing, setEditing] = useState<Row | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('sales_transactions')
      .select('*, customers(name)')
      .order('delivery_date', { ascending: false })
      .order('imported_at', { ascending: false })
      .limit(500);
    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      const flat = (data || []).map((r: any) => ({
        ...r,
        customer_name: r.customers?.name || r.customer_name_raw,
      }));
      setRows(flat);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let out = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.customer_name?.toLowerCase().includes(q) ||
          r.customer_phone.includes(q.replace(/\D/g, '')) ||
          (r.bill_no_label || r.feed_no).toLowerCase().includes(q),
      );
    }
    if (filterPaid === 'pending') {
      out = out.filter((r) => Number(r.net_amount || 0) - Number(r.customer_paid || 0) > 0);
    } else if (filterPaid === 'paid') {
      out = out.filter((r) => Number(r.net_amount || 0) - Number(r.customer_paid || 0) <= 0);
    }
    return out;
  }, [rows, searchQuery, filterPaid]);

  const totals = useMemo(() => ({
    count: filtered.length,
    billed: filtered.reduce((s, r) => s + Number(r.net_amount || 0), 0),
    paid: filtered.reduce((s, r) => s + Number(r.customer_paid || 0), 0),
  }), [filtered]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-emerald-600" />
              Deliveries
            </h1>
            <p className="text-sm text-gray-500">All bills + payments. Latest 500 shown.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); fetchAll(); }}
              className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/dashboard/deliveries/new"
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Delivery
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by customer, phone, or bill #"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['all', 'pending', 'paid'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilterPaid(k)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    filterPaid === k ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {k === 'all' ? 'All' : k === 'pending' ? 'Pending' : 'Paid'}
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-500 hidden lg:block">
              {totals.count} rows · billed ₹{totals.billed.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · paid ₹{totals.paid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No deliveries match the filter.</p>
            <Link
              href="/dashboard/deliveries/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg"
            >
              <Plus className="w-4 h-4" /> Add the first delivery
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>Date</Th>
                    <Th>Bill #</Th>
                    <Th>Customer</Th>
                    <Th align="right">Bill</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Change</Th>
                    <Th align="right">Balance</Th>
                    <Th>Mode</Th>
                    <Th>Pay Date</Th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => {
                    const balanceLeft = Number(r.net_amount || 0) - Number(r.customer_paid || 0);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700">{r.delivery_date ? formatDate(r.delivery_date) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.bill_no_label || r.feed_no}</td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/dashboard/customer/${r.customer_phone}`}
                            className="font-medium text-gray-900 hover:text-emerald-600"
                          >
                            {r.customer_name || r.customer_name_raw}
                          </Link>
                          <div className="text-xs text-gray-500">{formatPhoneDisplay(r.customer_phone)}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          ₹{Number(r.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">
                          ₹{Number(r.customer_paid || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700">
                          ₹{Number(r.change_given || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${balanceLeft > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          ₹{balanceLeft.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.payment_mode ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                              r.payment_mode === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                              r.payment_mode === 'online' ? 'bg-cyan-100 text-cyan-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {r.payment_mode}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{r.payment_date ? formatDate(r.payment_date) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right">
                          {balanceLeft <= 0 ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 inline" />
                          ) : (
                            <button
                              onClick={() => setEditing(r)}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-emerald-50 hover:text-emerald-600"
                              title="Edit payment"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {editing && (
        <EditDeliveryModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll(); setToast({ message: 'Saved.', type: 'success' }); }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function EditDeliveryModal({
  row, onClose, onSaved, onError,
}: {
  row: Row;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [paid, setPaid] = useState(Number(row.customer_paid || 0));
  const [mode, setMode] = useState<'cash' | 'online' | 'credit' | ''>((row.payment_mode || '') as any);
  const [payDate, setPayDate] = useState(row.payment_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const billAmt = Number(row.net_amount || 0);
  const change = Math.max(0, paid - billAmt);
  const balance = Math.max(0, billAmt - paid);

  const save = async () => {
    if (!mode && paid > 0) return onError('Pick a payment mode');
    setSaving(true);
    const { error } = await supabase.from('sales_transactions').update({
      customer_paid: paid,
      change_given: change,
      balance_left: balance,
      payment_mode: paid > 0 ? mode : null,
      payment_date: paid > 0 ? payDate : null,
    }).eq('id', row.id);
    setSaving(false);
    if (error) onError(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md modal-content">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-display font-bold text-gray-900 text-lg">
            Edit Delivery — {row.bill_no_label || row.feed_no}
          </h3>
          <p className="text-sm text-gray-500">{row.customer_name_raw}</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            Bill amount: <strong className="text-gray-900">₹{billAmt.toLocaleString('en-IN')}</strong>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer paid (₹)</label>
            <input
              type="number"
              value={paid}
              onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className={`rounded-lg border p-3 ${change > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
              <div className="text-xs">Change to give boy</div>
              <div className="text-lg font-display font-bold">₹{change.toLocaleString('en-IN')}</div>
            </div>
            <div className={`rounded-lg border p-3 ${balance > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              <div className="text-xs">Balance left</div>
              <div className="text-lg font-display font-bold">₹{balance.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
            <div className="flex gap-2">
              {(['cash', 'online', 'credit'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                    mode === m ? 'bg-emerald-500 text-white border-transparent' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment date</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
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
