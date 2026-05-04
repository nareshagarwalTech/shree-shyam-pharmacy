'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { isValidIndianPhone, formatPhoneDisplay } from '@/lib/whatsapp';
import { todayISO } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  ArrowLeft,
  Search,
  UserPlus,
  Receipt,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

type CustomerLite = {
  id: string;
  phone: string;
  name: string;
  outstanding?: number;
};

export default function NewDeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPhone = searchParams.get('customer');

  const [allCustomers, setAllCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [recentPicks, setRecentPicks] = useState<CustomerLite[]>([]);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const billAmtRef = useRef<HTMLInputElement>(null);

  // Form state
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [picked, setPicked] = useState<CustomerLite | null>(null);
  const [outstanding, setOutstanding] = useState(0);

  const [billNo, setBillNo] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [billAmt, setBillAmt] = useState<number>(0);
  const [customerPays, setCustomerPays] = useState<number>(0);
  const [mode, setMode] = useState<'cash' | 'online' | 'credit' | ''>('cash');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // New customer inline-add state
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const fetchCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from('customer_balance')
      .select('customer_id, phone, customer_name, outstanding')
      .order('customer_name');
    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      setAllCustomers(
        (data || []).map((c: any) => ({
          id: c.customer_id,
          phone: c.phone,
          name: c.customer_name,
          outstanding: Number(c.outstanding || 0),
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Pre-pick customer from ?customer=PHONE query param
  useEffect(() => {
    if (!presetPhone || !allCustomers.length || picked) return;
    const c = allCustomers.find((x) => x.phone === presetPhone);
    if (c) {
      setPicked(c);
      setSearchTerm(c.name);
      setTimeout(() => billAmtRef.current?.focus(), 50);
    }
  }, [presetPhone, allCustomers, picked]);

  // Refresh outstanding when customer is picked
  useEffect(() => {
    if (!picked) return;
    setOutstanding(picked.outstanding || 0);
  }, [picked]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc — reset form
      if (e.key === 'Escape') {
        e.preventDefault();
        reset();
      }
      // F2 — focus customer search
      if (e.key === 'F2') {
        e.preventDefault();
        customerInputRef.current?.focus();
        customerInputRef.current?.select();
      }
      // Ctrl/Cmd + Enter — Save & New
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (picked && billAmt > 0 && !saving) {
          e.preventDefault();
          save(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, billAmt, saving, billNo, deliveryDate, customerPays, mode, paymentDate, notes, outstanding]);

  // Filter suggestions
  const suggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase().trim();
    return allCustomers
      .filter(
        (c) => c.name.toLowerCase().includes(q) || (/\d/.test(q) && c.phone.includes(q.replace(/\D/g, ''))),
      )
      .slice(0, 8);
  }, [allCustomers, searchTerm]);

  // Computed totals
  const totalDue = useMemo(() => Number(outstanding) + Number(billAmt || 0), [outstanding, billAmt]);
  const change = useMemo(() => Math.max(0, customerPays - totalDue), [customerPays, totalDue]);
  const balanceLeft = useMemo(() => Math.max(0, totalDue - customerPays), [customerPays, totalDue]);

  const pickCustomer = (c: CustomerLite) => {
    setPicked(c);
    setSearchTerm(c.name);
    setShowSuggestions(false);
    setRecentPicks((prev) => {
      const without = prev.filter((p) => p.phone !== c.phone);
      return [c, ...without].slice(0, 6);
    });
    // jump to bill amount
    setTimeout(() => billAmtRef.current?.focus(), 50);
  };

  const addNewCustomerInline = async () => {
    if (!newName.trim()) return setToast({ message: 'Enter a name', type: 'error' });
    if (!isValidIndianPhone(newPhone)) return setToast({ message: 'Invalid phone', type: 'error' });
    const cleanPhone = newPhone.replace(/\D/g, '').slice(-10);
    const { data, error } = await supabase.from('customers').insert({
      phone: cleanPhone, name: newName.trim(), source: 'manual',
    }).select().single();
    if (error) {
      setToast({ message: error.message, type: 'error' });
      return;
    }
    // Tag with regular group
    const { data: rg } = await supabase.from('groups').select('id').eq('slug', 'regular').single();
    if (rg) await supabase.from('customer_groups').insert({ customer_id: data.id, group_id: rg.id });

    const lite: CustomerLite = { id: data.id, phone: data.phone, name: data.name, outstanding: 0 };
    setAllCustomers((prev) => [...prev, lite]);
    pickCustomer(lite);
    setShowNew(false);
    setNewName('');
    setNewPhone('');
    setToast({ message: 'Customer added.', type: 'success' });
  };

  const reset = () => {
    setSearchTerm('');
    setPicked(null);
    setOutstanding(0);
    setBillNo('');
    setDeliveryDate(todayISO());
    setBillAmt(0);
    setCustomerPays(0);
    setMode('cash');
    setPaymentDate(todayISO());
    setNotes('');
  };

  const save = async (andNew: boolean) => {
    if (!picked) return setToast({ message: 'Pick a customer first', type: 'error' });
    if (billAmt <= 0) return setToast({ message: 'Enter bill amount', type: 'error' });
    if (!billNo.trim()) return setToast({ message: 'Enter bill number (or OLD)', type: 'error' });
    if (customerPays > 0 && !mode) return setToast({ message: 'Pick a payment mode', type: 'error' });

    setSaving(true);
    const isOld = /^old$/i.test(billNo.trim());
    const stamp = deliveryDate.replace(/-/g, '');
    const feedNo = isOld ? `OLD-${picked.phone}-${stamp}` : billNo.trim();

    const payload = {
      feed_no:           feedNo,
      bill_no_label:     billNo.trim().toUpperCase(),
      delivery_date:     deliveryDate,
      feed_date:         deliveryDate,
      customer_phone:    picked.phone,
      customer_id:       picked.id,
      customer_name_raw: picked.name,
      net_amount:        billAmt,
      prev_pending:      outstanding,
      total_due:         totalDue,
      customer_paid:     customerPays || 0,
      change_given:      change,
      balance_left:      balanceLeft,
      payment_mode:      customerPays > 0 ? mode : null,
      payment_date:      customerPays > 0 ? paymentDate : null,
      delivery_notes:    notes.trim() || null,
      match_confidence:  'exact',
    };

    const { data: savedSale, error } = await supabase
      .from('sales_transactions')
      .upsert(payload, { onConflict: 'feed_no', ignoreDuplicates: false })
      .select('id')
      .single();

    if (error) {
      setSaving(false);
      setToast({ message: error.message, type: 'error' });
      return;
    }

    // If customer paid something, also insert a payment row (the new partial-
    // payment-aware model). The payment amount = customer_paid - change_given,
    // i.e. the net cash actually retained against the bill.
    const netReceived = customerPays - change;
    if (netReceived > 0 && mode && savedSale?.id) {
      const { error: payErr } = await supabase.from('payments').insert({
        customer_id: picked.id,
        sales_transaction_id: savedSale.id,
        amount: netReceived,
        mode,
        payment_date: paymentDate,
        notes: notes.trim() || null,
      });
      if (payErr) {
        setSaving(false);
        setToast({ message: `Bill saved but payment failed: ${payErr.message}`, type: 'error' });
        return;
      }
    }

    setSaving(false);
    // Add to recent picks so this customer is one click away on next entry
    setRecentPicks((prev) => {
      const updatedCust = { ...picked, outstanding: balanceLeft + (picked.outstanding || 0) - outstanding };
      const without = prev.filter((p) => p.phone !== picked.phone);
      return [updatedCust, ...without].slice(0, 6);
    });

    // Refresh master list so outstanding stays current
    fetchCustomers();

    if (andNew) {
      reset();
      setToast({ message: `Saved · ${picked.name} · ₹${billAmt}`, type: 'success' });
      // jump back to customer search for the next entry
      setTimeout(() => customerInputRef.current?.focus(), 80);
    } else {
      router.push('/dashboard/deliveries');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/dashboard/deliveries" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Deliveries
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h1 className="text-xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" /> New Delivery
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Search a customer → enter bill → record payment. Use Save &amp; New for fast entry.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* Customer picker */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>

              {recentPicks.length > 0 && !picked && (
                <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[11px] uppercase font-semibold text-gray-500 mr-1">Recent</span>
                  {recentPicks.map((c) => (
                    <button
                      key={c.phone}
                      type="button"
                      onClick={() => pickCustomer(c)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md"
                    >
                      {c.name}
                      {c.outstanding! > 0 && (
                        <span className="text-red-600">·₹{Math.round(c.outstanding!)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={customerInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); setPicked(null); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Search name or phone…"
                  className="w-full pl-10 pr-32 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  New customer
                </button>
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {suggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{c.name}</div>
                        <div className="text-xs text-gray-500">{formatPhoneDisplay(c.phone)}</div>
                      </div>
                      {c.outstanding! > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" />
                          ₹{c.outstanding!.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showNew && (
                <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                  <div className="text-xs font-semibold text-emerald-800 uppercase">Add new customer</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-gray-200"
                    />
                    <input
                      placeholder="10-digit phone"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      maxLength={10}
                      className="px-3 py-2 rounded-lg border border-gray-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowNew(false); setNewName(''); setNewPhone(''); }}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-white rounded-lg"
                    >Cancel</button>
                    <button
                      type="button"
                      onClick={addNewCustomerInline}
                      className="px-3 py-1.5 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg"
                    >Add</button>
                  </div>
                </div>
              )}

              {picked && (
                <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-emerald-800">{picked.name}</div>
                    <div className="text-xs text-gray-600">{formatPhoneDisplay(picked.phone)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Current outstanding</div>
                    <div className={`text-lg font-display font-bold ${outstanding > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      ₹{outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bill section */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill # / OLD</label>
                <div className="flex gap-1">
                  <input
                    value={billNo}
                    onChange={(e) => setBillNo(e.target.value.toUpperCase())}
                    placeholder="CC14346"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-mono text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={() => setBillNo('OLD')}
                    className="px-2 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    OLD
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill Amt (₹)</label>
                <input
                  ref={billAmtRef}
                  type="number"
                  value={billAmt || ''}
                  onChange={(e) => setBillAmt(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-display font-bold"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Total Due readout */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between text-sm">
              <span className="text-gray-600">Total due (outstanding + this bill):</span>
              <span className="font-display text-xl font-bold text-gray-900">₹{totalDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>

            {/* Payment section */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Pays (₹)</label>
                <input
                  type="number"
                  value={customerPays || ''}
                  onChange={(e) => setCustomerPays(parseFloat(e.target.value) || 0)}
                  placeholder="Round figure"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-display font-bold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg border p-3 ${change > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                <div className="text-xs">Change to give boy</div>
                <div className="text-2xl font-display font-bold">₹{change.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className={`rounded-lg border p-3 ${balanceLeft > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                <div className="text-xs">Balance left</div>
                <div className="text-2xl font-display font-bold">₹{balanceLeft.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
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
              <p className="text-xs text-gray-500 mt-1">Pick CREDIT if customer is not paying anything today.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any remarks…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl">
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving || !picked || billAmt <= 0}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-500 text-emerald-700 font-medium rounded-lg hover:bg-emerald-50 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save &amp; Done
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || !picked || billAmt <= 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save &amp; New
            </button>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Keyboard shortcuts</h3>
          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            <span><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded font-mono">F2</kbd> Focus customer</span>
            <span><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded font-mono">Ctrl/⌘ + Enter</kbd> Save &amp; New</span>
            <span><kbd className="px-1.5 py-0.5 bg-gray-100 border rounded font-mono">Esc</kbd> Reset form</span>
          </div>
        </div>
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
