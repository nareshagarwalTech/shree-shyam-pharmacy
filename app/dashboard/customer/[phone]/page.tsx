'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  supabase,
  CustomerBalance,
  SalesTransaction,
} from '@/lib/supabase';
import { formatPhoneDisplay, generateDueMessage, generateWhatsAppUrl } from '@/lib/whatsapp';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  ArrowLeft,
  MessageCircle,
  Receipt,
  Phone,
  MapPin,
  Calendar,
  CheckCircle,
} from 'lucide-react';

export default function CustomerStatementPage() {
  const params = useParams<{ phone: string }>();
  const phone = decodeURIComponent(params.phone);

  const [balance, setBalance] = useState<CustomerBalance | null>(null);
  const [bills, setBills] = useState<SalesTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data: bal, error: e1 }, { data: sales, error: e2 }] = await Promise.all([
      supabase.from('customer_balance').select('*').eq('phone', phone).maybeSingle(),
      supabase
        .from('sales_transactions')
        .select('*')
        .eq('customer_phone', phone)
        .order('delivery_date', { ascending: false })
        .order('imported_at', { ascending: false }),
    ]);
    if (e1 || e2) {
      setToast({ message: (e1 || e2)!.message, type: 'error' });
    } else {
      setBalance(bal as CustomerBalance | null);
      setBills((sales || []) as SalesTransaction[]);
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalChange = useMemo(
    () => bills.reduce((s, b) => s + Number(b.change_given || 0), 0),
    [bills],
  );

  const sendDueReminder = () => {
    if (!balance) return;
    const msg = generateDueMessage(
      balance.customer_name,
      Number(balance.outstanding),
      balance.preferred_language,
    );
    window.open(generateWhatsAppUrl(balance.phone, msg), '_blank', 'noopener,noreferrer');
  };

  const markBillPaid = async (bill: SalesTransaction, mode: 'cash' | 'online') => {
    if (!confirm(`Mark Bill ${bill.bill_no_label || bill.feed_no} (₹${bill.net_amount}) as paid in ${mode}?`)) return;
    const { error } = await supabase.from('sales_transactions').update({
      customer_paid: bill.net_amount,
      payment_mode: mode,
      payment_date: new Date().toISOString().slice(0, 10),
      balance_left: 0,
    }).eq('id', bill.id);
    if (error) setToast({ message: error.message, type: 'error' });
    else {
      setToast({ message: 'Bill marked paid.', type: 'success' });
      fetchAll();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : !balance ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-gray-500">Customer not found for phone {formatPhoneDisplay(phone)}.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display font-bold text-gray-900">{balance.customer_name}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {formatPhoneDisplay(balance.phone)}
                    </span>
                    {balance.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" /> {balance.address}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {Number(balance.outstanding) > 0 && (
                    <button
                      onClick={sendDueReminder}
                      disabled={balance.whatsapp_opt_out}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-medium rounded-lg"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Send Due Reminder
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                <Stat label="Total Bills" value={String(balance.bill_count)} />
                <Stat label="Total Billed" value={`₹${Number(balance.total_billed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <Stat label="Total Paid" value={`₹${Number(balance.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <Stat
                  label="Outstanding"
                  value={`₹${Number(balance.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  highlight={Number(balance.outstanding) > 0 ? 'red' : 'emerald'}
                />
              </div>

              {totalChange > 0 && (
                <div className="text-xs text-gray-500 mt-3">
                  Total change given to delivery boy across all bills: ₹{totalChange.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-display font-semibold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                  Bill History ({bills.length})
                </h2>
              </div>

              {bills.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No bills on record yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <Th>Date</Th>
                        <Th>Bill #</Th>
                        <Th align="right">Bill Amt</Th>
                        <Th align="right">Paid</Th>
                        <Th align="right">Change</Th>
                        <Th align="right">Balance</Th>
                        <Th>Mode</Th>
                        <Th>Pay Date</Th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bills.map((b) => {
                        const balanceLeft = Number(b.net_amount || 0) - Number(b.customer_paid || 0);
                        return (
                          <tr key={b.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {b.delivery_date ? formatDate(b.delivery_date) : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {b.bill_no_label || b.feed_no}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              ₹{Number(b.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-emerald-700">
                              ₹{Number(b.customer_paid || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-amber-700">
                              ₹{Number(b.change_given || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                            <td className={`px-4 py-3 text-right text-sm font-semibold ${balanceLeft > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              ₹{balanceLeft.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-xs uppercase">
                              {b.payment_mode ? (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  b.payment_mode === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                                  b.payment_mode === 'online' ? 'bg-cyan-100 text-cyan-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  {b.payment_mode}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {b.payment_date ? formatDate(b.payment_date) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {balanceLeft > 0 ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => markBillPaid(b, 'cash')}
                                    className="px-2 py-1 text-xs rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
                                  >
                                    Cash
                                  </button>
                                  <button
                                    onClick={() => markBillPaid(b, 'online')}
                                    className="px-2 py-1 text-xs rounded-lg text-cyan-700 bg-cyan-50 hover:bg-cyan-100 font-semibold"
                                  >
                                    Online
                                  </button>
                                </div>
                              ) : (
                                <CheckCircle className="w-4 h-4 text-emerald-500 inline" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'emerald' }) {
  const cls = highlight === 'red' ? 'text-red-600' : highlight === 'emerald' ? 'text-emerald-700' : 'text-gray-900';
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`text-xl font-display font-bold mt-0.5 ${cls}`}>{value}</div>
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
