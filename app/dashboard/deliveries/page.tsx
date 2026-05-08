'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, SalesTransaction, CustomerBalance } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import PhoneLink from '@/components/PhoneLink';
import Toast from '@/components/Toast';
import EditBillModal from '@/components/EditBillModal';
import PaymentModal from '@/components/PaymentModal';
import {
  Search,
  Plus,
  Receipt,
  RefreshCw,
  Pencil,
  CheckCircle,
  IndianRupee,
} from 'lucide-react';

type Row = SalesTransaction & {
  customer_name?: string;
  customer_id_resolved?: string;
  /** Sum of payments.amount where sales_transaction_id = bill.id. Falls
   *  back to the legacy customer_paid field if no direct payments exist. */
  paid_amount: number;
  balance_left_computed: number;
};

interface PaymentTarget {
  customerId: string;
  customerName: string;
  outstanding: number;
  bills: SalesTransaction[];
  defaultAmount?: number;
  defaultBillId?: string;
}

export default function DeliveriesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'pending' | 'paid'>('all');
  const [editingBill, setEditingBill] = useState<Row | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('sales_transactions')
      .select('*, customers(id, name)')
      .order('delivery_date', { ascending: false })
      .order('imported_at', { ascending: false })
      .limit(500);
    if (error) {
      setToast({ message: error.message, type: 'error' });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Pull payments in one query for all the bills we just fetched, so the
    // "Paid" filter and the per-bill "balance left" reflect the actual
    // payments table (not the legacy customer_paid field on the bill row).
    const billIds = (data || []).map((r: any) => r.id).filter(Boolean);
    let paidByBill = new Map<string, number>();
    if (billIds.length) {
      const { data: pays } = await supabase
        .from('payments')
        .select('sales_transaction_id, amount')
        .in('sales_transaction_id', billIds);
      for (const p of pays || []) {
        if (!p.sales_transaction_id) continue;
        paidByBill.set(
          p.sales_transaction_id,
          (paidByBill.get(p.sales_transaction_id) || 0) + Number(p.amount),
        );
      }
    }

    const flat: Row[] = (data || []).map((r: any) => {
      const directPaid = paidByBill.get(r.id);
      // Fallback for legacy bills that never got a payments-table row
      // (e.g. /deliveries/new before migration 005 was applied).
      const paid_amount = directPaid !== undefined ? directPaid : Number(r.customer_paid || 0);
      const net = Number(r.net_amount || 0);
      return {
        ...r,
        customer_name: r.customers?.name || r.customer_name_raw,
        customer_id_resolved: r.customers?.id || r.customer_id,
        paid_amount,
        balance_left_computed: Math.max(0, net - paid_amount),
      };
    });
    setRows(flat);
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
          (/\d/.test(q) && r.customer_phone.includes(q.replace(/\D/g, ''))) ||
          (r.bill_no_label || r.feed_no).toLowerCase().includes(q),
      );
    }
    if (filterPaid === 'pending') {
      out = out.filter((r) => r.balance_left_computed > 0.01);
    } else if (filterPaid === 'paid') {
      out = out.filter((r) => r.balance_left_computed <= 0.01);
    }
    return out;
  }, [rows, searchQuery, filterPaid]);

  const totals = useMemo(() => ({
    count: filtered.length,
    billed: filtered.reduce((s, r) => s + Number(r.net_amount || 0), 0),
    paid: filtered.reduce((s, r) => s + r.paid_amount, 0),
  }), [filtered]);

  const openPaymentForBill = async (r: Row) => {
    if (!r.customer_id_resolved) {
      setToast({ message: 'Bill is not linked to a customer.', type: 'error' });
      return;
    }
    // Fetch outstanding + all bills for this customer
    const [{ data: bal }, { data: bills }] = await Promise.all([
      supabase.from('customer_balance').select('*').eq('customer_id', r.customer_id_resolved).single(),
      supabase.from('sales_transactions').select('*').eq('customer_id', r.customer_id_resolved),
    ]);
    if (!bal) {
      setToast({ message: 'Could not load customer.', type: 'error' });
      return;
    }
    const balance = bal as CustomerBalance;
    setPaymentTarget({
      customerId: r.customer_id_resolved,
      customerName: balance.customer_name,
      outstanding: Number(balance.outstanding),
      bills: (bills || []) as SalesTransaction[],
      defaultBillId: r.id,
      defaultAmount: Math.max(0, r.balance_left_computed) || undefined,
    });
  };

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
            <p className="text-sm text-gray-500">
              All bills + payments. Latest 500 shown.
              <span className="ml-2 text-xs text-gray-400">
                Tip: payments are tracked separately — click ₹ to record one (supports partial / multi-date), or click the customer name for the full ledger.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); fetchAll(); }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
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
          <>
            {/* Mobile: card layout */}
            <div className="md:hidden space-y-2">
              {filtered.map((r) => {
                const balanceLeft = r.balance_left_computed;
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/customer/${r.customer_phone}`}
                          className="font-semibold text-gray-900 hover:text-emerald-600 truncate block"
                        >
                          {r.customer_name || r.customer_name_raw}
                        </Link>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <PhoneLink phone={r.customer_phone} className="inline-flex items-center gap-1 text-gray-500 hover:text-purple-600" />
                          <span className="text-gray-300">·</span>
                          <span className="font-mono">{r.bill_no_label || r.feed_no}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-display font-bold text-gray-900">
                          ₹{Number(r.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {r.delivery_date ? formatDate(r.delivery_date) : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Payment summary */}
                    <div className="flex items-center justify-between gap-2 text-xs mb-2 bg-gray-50 rounded-md px-2 py-1.5">
                      <div>
                        Paid <strong className="text-emerald-700">₹{r.paid_amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
                        {r.payment_mode && (
                          <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            r.payment_mode === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                            r.payment_mode === 'online' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{r.payment_mode}</span>
                        )}
                      </div>
                      <div className={`font-semibold ${balanceLeft > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {balanceLeft > 0
                          ? `Bal ₹${balanceLeft.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                          : <span className="inline-flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Paid</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5">
                      {balanceLeft > 0 && (
                        <button
                          onClick={() => openPaymentForBill(r)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        >
                          <IndianRupee className="w-3.5 h-3.5" />
                          Record payment
                        </button>
                      )}
                      <button
                        onClick={() => setEditingBill(r)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: full table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => {
                    const balanceLeft = r.balance_left_computed;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{r.delivery_date ? formatDate(r.delivery_date) : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.bill_no_label || r.feed_no}</td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/dashboard/customer/${r.customer_phone}`}
                            className="font-medium text-gray-900 hover:text-emerald-600"
                          >
                            {r.customer_name || r.customer_name_raw}
                          </Link>
                          <PhoneLink phone={r.customer_phone} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600" />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          ₹{Number(r.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">
                          ₹{r.paid_amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            {balanceLeft > 0 && (
                              <button
                                onClick={() => openPaymentForBill(r)}
                                className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                                title="Record a payment (supports partial / multiple dates)"
                              >
                                <IndianRupee className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditingBill(r)}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="Edit bill (date, amount, label)"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {balanceLeft <= 0 && (
                              <CheckCircle className="w-4 h-4 text-emerald-500 inline" />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          </>
        )}
      </main>

      {editingBill && (
        <EditBillModal
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onSaved={() => { setEditingBill(null); fetchAll(); setToast({ message: 'Bill updated.', type: 'success' }); }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {paymentTarget && (
        <PaymentModal
          customerId={paymentTarget.customerId}
          customerName={paymentTarget.customerName}
          outstandingBefore={paymentTarget.outstanding}
          bills={paymentTarget.bills}
          defaultAmount={paymentTarget.defaultAmount}
          defaultBillId={paymentTarget.defaultBillId}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => {
            setPaymentTarget(null);
            fetchAll();
            setToast({ message: 'Payment recorded.', type: 'success' });
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
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
