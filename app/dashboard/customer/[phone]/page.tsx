'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  supabase,
  CustomerBalance,
  Customer,
  SalesTransaction,
  Payment,
  PaymentChannel,
} from '@/lib/supabase';
import { formatPhoneDisplay, generateDueMessage, generateWhatsAppUrl } from '@/lib/whatsapp';
import { formatDate, formatMonthLabel, formatMonthShort } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import EditCustomerModal from '@/components/EditCustomerModal';
import PaymentModal from '@/components/PaymentModal';
import EditBillModal from '@/components/EditBillModal';
import {
  ArrowLeft,
  MessageCircle,
  Receipt,
  Phone,
  MapPin,
  Clock,
  TrendingUp,
  Plus,
  Pencil,
  CheckCircle,
  PlusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';

interface LedgerRow {
  kind: 'bill' | 'payment';
  date: string;
  amount: number;
  label: string;
  detail: string;
  mode?: PaymentChannel | null;
  bill?: SalesTransaction;
  payment?: Payment;
  running?: number;
}

export default function CustomerStatementPage() {
  const params = useParams<{ phone: string }>();
  const phone = decodeURIComponent(params.phone);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState<CustomerBalance | null>(null);
  const [bills, setBills] = useState<SalesTransaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editingBill, setEditingBill] = useState<SalesTransaction | null>(null);
  const [paymentDefaults, setPaymentDefaults] = useState<{ amount?: number; billId?: string | null }>({});

  const fetchAll = useCallback(async () => {
    const [{ data: cust }, { data: bal }, { data: sales }] = await Promise.all([
      supabase.from('customers').select('*').eq('phone', phone).maybeSingle(),
      supabase.from('customer_balance').select('*').eq('phone', phone).maybeSingle(),
      supabase.from('sales_transactions').select('*').eq('customer_phone', phone)
        .order('delivery_date', { ascending: false }),
    ]);
    setCustomer(cust as Customer | null);
    setBalance(bal as CustomerBalance | null);
    setBills((sales || []) as SalesTransaction[]);

    if (cust) {
      const { data: pays } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', (cust as any).id)
        .order('payment_date', { ascending: false });
      setPayments((pays || []) as Payment[]);
    } else {
      setPayments([]);
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const ledger: LedgerRow[] = useMemo(() => {
    const events: LedgerRow[] = [];
    for (const b of bills) {
      events.push({
        kind: 'bill',
        date: b.delivery_date || b.feed_date,
        amount: Number(b.net_amount || 0),
        label: b.bill_no_label || b.feed_no,
        detail: b.for_days ? `${b.for_days}-day supply` : 'bill',
        bill: b,
      });
    }
    for (const p of payments) {
      events.push({
        kind: 'payment',
        date: p.payment_date,
        amount: -Number(p.amount),
        label: `Payment · ${p.mode}`,
        detail: p.notes || '',
        mode: p.mode,
        payment: p,
      });
    }
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'bill' ? -1 : 1));
    let running = 0;
    const withBal = events.map((e) => {
      running += e.amount;
      return { ...e, running };
    });
    return [...withBal].reverse();
  }, [bills, payments]);

  const stats = useMemo(() => {
    const totalChange = bills.reduce((s, b) => s + Number(b.change_given || 0), 0);
    const sortedBills = [...bills].sort((a, b) =>
      (a.delivery_date || '') < (b.delivery_date || '') ? -1 : 1,
    );
    let totalPaidLeft = payments.reduce((s, p) => s + Number(p.amount), 0);
    const unpaidDates: string[] = [];
    for (const b of sortedBills) {
      const amt = Number(b.net_amount || 0);
      if (totalPaidLeft >= amt) {
        totalPaidLeft -= amt;
      } else {
        if (b.delivery_date) unpaidDates.push(b.delivery_date);
        break;
      }
    }
    const oldestUnpaidDate: string | null = unpaidDates.length ? unpaidDates.sort()[0] : null;
    const oldestAgeDays = oldestUnpaidDate
      ? Math.round((Date.now() - new Date(oldestUnpaidDate).getTime()) / 86400000)
      : null;

    let avgDaysToPay: number | null = null;
    const allPaymentsAsc = [...payments].sort((a, b) =>
      a.payment_date < b.payment_date ? -1 : 1,
    );
    if (allPaymentsAsc.length && sortedBills.length) {
      const days: number[] = [];
      let billIdx = 0;
      let billRemaining = Number(sortedBills[0]?.net_amount || 0);
      for (const p of allPaymentsAsc) {
        let amtLeft = Number(p.amount);
        while (amtLeft > 0 && billIdx < sortedBills.length) {
          const bill = sortedBills[billIdx];
          const apply = Math.min(amtLeft, billRemaining);
          if (apply > 0 && bill.delivery_date && p.payment_date) {
            const d = Math.max(0, Math.round(
              (new Date(p.payment_date).getTime() - new Date(bill.delivery_date).getTime()) / 86400000
            ));
            days.push(d);
          }
          amtLeft -= apply;
          billRemaining -= apply;
          if (billRemaining <= 0) {
            billIdx++;
            billRemaining = Number(sortedBills[billIdx]?.net_amount || 0);
          }
        }
      }
      if (days.length) avgDaysToPay = Math.round(days.reduce((s, x) => s + x, 0) / days.length);
    }
    return { totalChange, oldestAgeDays, oldestUnpaidDate, avgDaysToPay };
  }, [bills, payments]);

  const monthly = useMemo(() => {
    const m = new Map<string, { billed: number; paid: number }>();
    for (const b of bills) {
      const key = (b.delivery_date || b.feed_date)?.slice(0, 7);
      if (!key) continue;
      const cur = m.get(key) || { billed: 0, paid: 0 };
      cur.billed += Number(b.net_amount || 0);
      m.set(key, cur);
    }
    for (const p of payments) {
      const key = p.payment_date.slice(0, 7);
      const cur = m.get(key) || { billed: 0, paid: 0 };
      cur.paid += Number(p.amount);
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, v]) => ({ month: key, ...v }));
  }, [bills, payments]);

  const monthlyMax = useMemo(
    () => Math.max(1, ...monthly.map((m) => Math.max(m.billed, m.paid))),
    [monthly],
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

  const handlePaymentSaved = () => {
    setShowAddPayment(false);
    setEditingPayment(null);
    setPaymentDefaults({});
    setToast({ message: 'Payment saved.', type: 'success' });
    fetchAll();
  };

  const quickPayBill = (bill: SalesTransaction) => {
    // Compute remaining balance for this bill via FIFO allocation against payments
    const sortedBills = [...bills].sort((a, b) =>
      (a.delivery_date || '') < (b.delivery_date || '') ? -1 : 1,
    );
    let totalPaidLeft = payments.reduce((s, p) => s + Number(p.amount), 0);
    let billUnpaid = 0;
    for (const b of sortedBills) {
      const amt = Number(b.net_amount || 0);
      const applied = Math.min(totalPaidLeft, amt);
      const unpaid = amt - applied;
      if (b.id === bill.id) {
        billUnpaid = unpaid;
        break;
      }
      totalPaidLeft -= applied;
    }
    setPaymentDefaults({ amount: billUnpaid > 0 ? billUnpaid : Number(bill.net_amount || 0), billId: bill.id });
    setShowAddPayment(true);
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
        ) : !customer || !balance ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-gray-500">Customer not found for phone {formatPhoneDisplay(phone)}.</p>
          </div>
        ) : (
          <>
            {/* Header card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-display font-bold text-gray-900 truncate">{customer.name}</h1>
                    <button
                      onClick={() => setShowEditCustomer(true)}
                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                      title="Edit customer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-purple-600">
                      <Phone className="w-4 h-4" /> {formatPhoneDisplay(customer.phone)}
                    </a>
                    {customer.alternate_phone && (
                      <a href={`tel:${customer.alternate_phone}`} className="text-gray-400 hover:text-purple-600 flex items-center gap-1">
                        alt: {formatPhoneDisplay(customer.alternate_phone)}
                      </a>
                    )}
                    {customer.address && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {customer.address}</span>}
                    {customer.preferred_language !== 'en' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded uppercase">{customer.preferred_language}</span>
                    )}
                  </div>
                  {customer.notes && <p className="text-sm text-gray-500 italic mt-1">📝 {customer.notes}</p>}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  <button
                    onClick={() => { setPaymentDefaults({}); setShowAddPayment(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-md text-sm"
                    title="Record a payment"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">+ Payment</span>
                  </button>
                  <Link
                    href={`/dashboard/deliveries/new?customer=${customer.phone}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-medium rounded-md text-sm"
                    title="Add a new bill"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">+ Bill</span>
                  </Link>
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-md text-sm"
                    title="Call customer"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="hidden sm:inline">Call</span>
                  </a>
                  {Number(balance.outstanding) > 0 && (
                    <button
                      onClick={sendDueReminder}
                      disabled={customer.whatsapp_opt_out}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#20BD5A] disabled:bg-gray-300 text-white font-medium rounded-md text-sm"
                      title="Send due reminder via WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                <Stat label="Bills" value={String(balance.bill_count)} sub={`${balance.payment_count || 0} payments`} />
                <Stat label="Total Billed" value={`₹${Number(balance.total_billed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <Stat label="Total Paid" value={`₹${Number(balance.total_collected).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} highlight="emerald" />
                <Stat
                  label="Outstanding"
                  value={`₹${Number(balance.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  highlight={Number(balance.outstanding) > 0 ? 'red' : 'emerald'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <Insight
                icon={<Clock className="w-5 h-5" />}
                label="Oldest unpaid"
                value={stats.oldestAgeDays != null ? `${stats.oldestAgeDays} days` : '—'}
                sub={stats.oldestUnpaidDate ? formatDate(stats.oldestUnpaidDate) : 'all clear'}
                color={stats.oldestAgeDays != null && stats.oldestAgeDays > 60 ? 'red' : stats.oldestAgeDays != null ? 'amber' : 'emerald'}
              />
              <Insight
                icon={<TrendingUp className="w-5 h-5" />}
                label="Avg days to pay"
                value={stats.avgDaysToPay != null ? `${stats.avgDaysToPay} days` : '—'}
                sub={`across ${payments.length} payment${payments.length === 1 ? '' : 's'}`}
                color={stats.avgDaysToPay != null && stats.avgDaysToPay <= 7 ? 'emerald' : 'amber'}
              />
              <Insight
                icon={<Receipt className="w-5 h-5" />}
                label="Last visit"
                value={balance.last_delivery_date ? formatDate(balance.last_delivery_date) : '—'}
                sub={balance.last_payment_date ? `last paid ${formatDate(balance.last_payment_date)}` : 'no payments yet'}
                color="blue"
              />
            </div>

            {monthly.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 mb-4">
                <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-700">Monthly Billed vs Paid</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400" /> Billed</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Paid</span>
                  </div>
                </div>
                <div className="flex items-end gap-1 sm:gap-3 h-36 sm:h-40">
                  {monthly.map((m, i) => {
                    const billedH = (m.billed / monthlyMax) * 100;
                    const paidH = (m.paid / monthlyMax) * 100;
                    const labelStride = monthly.length > 12 ? 2 : 1;
                    const showXLabel = i % labelStride === 0 || i === monthly.length - 1;
                    return (
                      <div
                        key={m.month}
                        className="flex-1 flex flex-col items-center min-w-0 group"
                        title={`${formatMonthLabel(m.month)}\nBilled: ₹${m.billed.toLocaleString('en-IN')}\nPaid: ₹${m.paid.toLocaleString('en-IN')}`}
                      >
                        <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 flex-1">
                          <div className="bg-blue-400 w-1/2 rounded-t" style={{ height: `${billedH}%`, minHeight: m.billed > 0 ? 2 : 0 }} />
                          <div className="bg-emerald-500 w-1/2 rounded-t" style={{ height: `${paidH}%`, minHeight: m.paid > 0 ? 2 : 0 }} />
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 truncate w-full text-center leading-tight">
                          {showXLabel ? formatMonthShort(m.month) : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-display font-semibold text-gray-900">
                  Ledger ({ledger.length} transactions)
                </h2>
                {stats.totalChange > 0 && (
                  <span className="text-xs text-gray-500">
                    Lifetime change handed back: ₹{stats.totalChange.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>

              {ledger.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No transactions yet.</p>
                </div>
              ) : (
                <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-gray-100">
                  {ledger.map((row, i) => {
                    const isBill = row.kind === 'bill';
                    const running = row.running ?? 0;
                    return (
                      <div key={i} className="p-3 flex items-start gap-3">
                        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white ${
                          isBill ? 'bg-blue-500' :
                          row.mode === 'cash' ? 'bg-emerald-500' :
                          row.mode === 'online' ? 'bg-cyan-500' : 'bg-amber-500'
                        }`}>
                          {isBill ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {isBill ? `Bill #${row.label}` : `Payment · ${row.mode}`}
                            </div>
                            <div className={`font-semibold text-sm whitespace-nowrap ${
                              isBill ? 'text-gray-900' : 'text-emerald-700'
                            }`}>
                              {isBill ? '+' : '−'}₹{Math.abs(Number(row.bill?.net_amount || row.payment?.amount || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <span>{formatDate(row.date)}</span>
                            {row.detail && (
                              <>
                                <span className="text-gray-300">·</span>
                                <span className="truncate">{row.detail}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <div className={`text-xs font-semibold ${
                              running > 0 ? 'text-red-600' : running < 0 ? 'text-amber-600' : 'text-gray-400'
                            }`}>
                              Balance: ₹{Math.abs(running).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              {running < 0 && ' cr'}
                            </div>
                            <div className="flex items-center gap-1">
                              {isBill && row.bill && (Number(row.bill.net_amount || 0) > 0) && (
                                <button
                                  onClick={() => quickPayBill(row.bill!)}
                                  className="px-2 py-1 text-[11px] rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
                                >
                                  Pay
                                </button>
                              )}
                              <button
                                onClick={() => isBill ? setEditingBill(row.bill!) : setEditingPayment(row.payment!)}
                                className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Footer */}
                  <div className="bg-gray-50 px-3 py-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-700 uppercase text-xs">Current balance</span>
                    <span className={`font-display font-bold text-lg ${
                      Number(balance.outstanding) > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      ₹{Number(balance.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      {Number(balance.outstanding) === 0 && <CheckCircle className="w-4 h-4 inline ml-1" />}
                    </span>
                  </div>
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <Th>Date</Th>
                        <Th>Type</Th>
                        <Th>Reference</Th>
                        <Th align="right">Bill</Th>
                        <Th align="right">Paid</Th>
                        <Th align="right">Running</Th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ledger.map((row, i) => {
                        const isBill = row.kind === 'bill';
                        const running = row.running ?? 0;
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{formatDate(row.date)}</td>
                            <td className="px-4 py-3">
                              {isBill ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                                  <ArrowUpCircle className="w-3 h-3" />
                                  Bill
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  row.mode === 'cash' ? 'bg-emerald-50 text-emerald-700' :
                                  row.mode === 'online' ? 'bg-cyan-50 text-cyan-700' :
                                  'bg-amber-50 text-amber-700'
                                }`}>
                                  <ArrowDownCircle className="w-3 h-3" />
                                  {row.mode}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {isBill ? (
                                <>
                                  <span className="font-mono text-xs">{row.label}</span>
                                  {row.detail && <div className="text-xs text-gray-500">{row.detail}</div>}
                                </>
                              ) : (
                                <>
                                  <span className="text-gray-700">{row.label}</span>
                                  {row.detail && <div className="text-xs text-gray-500">{row.detail}</div>}
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              {isBill ? (
                                <span className="font-semibold text-gray-900">
                                  ₹{Number(row.bill?.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              {!isBill ? (
                                <span className="font-semibold text-emerald-700">
                                  ₹{Number(row.payment?.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className={`px-4 py-3 text-right text-sm font-semibold ${
                              running > 0 ? 'text-red-600' : running < 0 ? 'text-amber-600' : 'text-gray-500'
                            }`}>
                              ₹{Math.abs(running).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              {running < 0 && <span className="text-xs ml-1">cr</span>}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isBill && row.bill && (Number(row.bill.net_amount || 0) > 0) && (
                                  <button
                                    onClick={() => quickPayBill(row.bill!)}
                                    className="px-2 py-1 text-xs rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
                                    title="Record payment for this bill"
                                  >
                                    Pay
                                  </button>
                                )}
                                <button
                                  onClick={() => isBill ? setEditingBill(row.bill!) : setEditingPayment(row.payment!)}
                                  className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                  title={isBill ? 'Edit bill' : 'Edit payment'}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                        <td className="px-4 py-3 text-sm uppercase" colSpan={3}>Current balance</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900">₹{Number(balance.total_billed).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-700">₹{Number(balance.total_collected).toLocaleString('en-IN')}</td>
                        <td className={`px-4 py-3 text-right text-sm ${
                          Number(balance.outstanding) > 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}>
                          ₹{Number(balance.outstanding).toLocaleString('en-IN')}
                          {Number(balance.outstanding) === 0 && <CheckCircle className="w-4 h-4 inline ml-1" />}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                </>
              )}
            </div>
          </>
        )}
      </main>

      {showEditCustomer && customer && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEditCustomer(false)}
          onSaved={(updated) => {
            setShowEditCustomer(false);
            setToast({ message: 'Customer updated.', type: 'success' });
            if (updated.phone !== phone) {
              window.location.href = `/dashboard/customer/${updated.phone}`;
              return;
            }
            fetchAll();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {showAddPayment && customer && balance && (
        <PaymentModal
          customerId={customer.id}
          customerName={customer.name}
          outstandingBefore={Number(balance.outstanding)}
          bills={bills}
          defaultAmount={paymentDefaults.amount}
          defaultBillId={paymentDefaults.billId}
          onClose={() => { setShowAddPayment(false); setPaymentDefaults({}); }}
          onSaved={handlePaymentSaved}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {editingPayment && customer && balance && (
        <PaymentModal
          customerId={customer.id}
          customerName={customer.name}
          outstandingBefore={Number(balance.outstanding)}
          bills={bills}
          existing={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={handlePaymentSaved}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {editingBill && (
        <EditBillModal
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onSaved={() => {
            setEditingBill(null);
            setToast({ message: 'Bill updated.', type: 'success' });
            fetchAll();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: 'red' | 'emerald';
}) {
  const cls = highlight === 'red' ? 'text-red-600' : highlight === 'emerald' ? 'text-emerald-700' : 'text-gray-900';
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`text-xl font-display font-bold mt-0.5 ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Insight({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string; value: string; sub: string;
  color: 'red' | 'amber' | 'emerald' | 'blue';
}) {
  const map: Record<string, string> = {
    red:     'bg-red-50 border-red-200 text-red-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-70">{icon}{label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
      <div className="text-xs opacity-70 mt-1">{sub}</div>
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
