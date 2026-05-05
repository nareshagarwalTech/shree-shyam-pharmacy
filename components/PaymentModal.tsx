'use client';

import { useState, useEffect } from 'react';
import { supabase, Payment, PaymentChannel, SalesTransaction } from '@/lib/supabase';
import { todayISO, formatDate } from '@/lib/utils';
import useEscapeKey from '@/lib/useEscapeKey';
import { X, Loader2, IndianRupee, AlertCircle } from 'lucide-react';

interface Props {
  customerId: string;
  customerName: string;
  outstandingBefore: number;          // current outstanding (used to validate / show context)
  bills: SalesTransaction[];          // for the optional bill picker
  existing?: Payment;                  // editing mode if provided
  defaultAmount?: number;              // pre-filled amount (e.g. when "Mark Paid" on a specific bill)
  defaultBillId?: string | null;       // pre-pick a bill
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}

const MODES: PaymentChannel[] = ['cash', 'online', 'cheque', 'card', 'other'];

export default function PaymentModal({
  customerId,
  customerName,
  outstandingBefore,
  bills,
  existing,
  defaultAmount,
  defaultBillId,
  onClose,
  onSaved,
  onError,
}: Props) {
  const isEdit = !!existing;
  const [amount, setAmount] = useState<number>(existing?.amount ?? defaultAmount ?? 0);
  const [mode, setMode] = useState<PaymentChannel>(existing?.mode ?? 'cash');
  const [paymentDate, setPaymentDate] = useState(existing?.payment_date ?? todayISO());
  const [billId, setBillId] = useState<string | null>(
    existing?.sales_transaction_id ?? defaultBillId ?? null,
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEscapeKey(onClose, !saving);

  const projectedOutstanding = isEdit
    ? outstandingBefore + (existing?.amount ?? 0) - amount
    : outstandingBefore - amount;

  const overpaying = projectedOutstanding < 0;

  const save = async () => {
    if (amount <= 0) return onError('Amount must be greater than 0');
    if (!paymentDate) return onError('Payment date is required');

    setSaving(true);

    if (isEdit && existing) {
      const { error } = await supabase
        .from('payments')
        .update({
          amount,
          mode,
          payment_date: paymentDate,
          sales_transaction_id: billId,
          notes: notes.trim() || null,
        })
        .eq('id', existing.id);
      setSaving(false);
      if (error) onError(error.message);
      else onSaved();
    } else {
      const { error } = await supabase.from('payments').insert({
        customer_id: customerId,
        sales_transaction_id: billId,
        amount,
        mode,
        payment_date: paymentDate,
        notes: notes.trim() || null,
      });
      setSaving(false);
      if (error) onError(error.message);
      else onSaved();
    }
  };

  const del = async () => {
    if (!isEdit || !existing) return;
    if (!confirm(`Delete this ₹${existing.amount} ${existing.mode} payment from ${formatDate(existing.payment_date)}?`)) return;
    setSaving(true);
    const { error } = await supabase.from('payments').delete().eq('id', existing.id);
    setSaving(false);
    if (error) onError(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md modal-content max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-gray-900 text-lg">
              {isEdit ? 'Edit Payment' : 'Record Payment'}
            </h3>
            <p className="text-sm text-gray-500">{customerName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {/* Outstanding context */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="text-xs text-gray-500 uppercase">Current outstanding</div>
            <div className="text-2xl font-display font-bold text-red-600">
              ₹{outstandingBefore.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            {amount > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200 text-sm flex items-center justify-between">
                <span className="text-gray-600">After this payment:</span>
                <span className={`font-semibold ${overpaying ? 'text-amber-600' : projectedOutstanding === 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                  ₹{Math.abs(projectedOutstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  {overpaying && <span className="ml-1 text-xs">overpaid</span>}
                  {projectedOutstanding === 0 && <span className="ml-1 text-xs">cleared ✓</span>}
                </span>
              </div>
            )}
          </div>

          {overpaying && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-800">
                This payment exceeds outstanding by ₹{Math.abs(projectedOutstanding).toLocaleString('en-IN')}. The
                customer will have a credit balance — fine if they pre-paid.
              </span>
            </div>
          )}

          <Field label="Amount (₹) *">
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className={`${inputCls(amount <= 0)} pl-9 font-display text-lg font-bold`}
                placeholder="0"
                autoFocus
              />
            </div>
          </Field>

          <Field label="Mode">
            <div className="grid grid-cols-5 gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border capitalize ${
                    mode === m
                      ? 'bg-emerald-500 text-white border-transparent'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Payment date *">
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputCls(!paymentDate)}
            />
          </Field>

          {bills.length > 0 && (
            <Field label="Allocate to a specific bill (optional)" hint="Otherwise applied to oldest unpaid bill first (FIFO)">
              <select
                value={billId ?? ''}
                onChange={(e) => setBillId(e.target.value || null)}
                className={inputCls(false)}
              >
                <option value="">(Customer-level — FIFO)</option>
                {bills
                  .filter((b) => Number(b.net_amount || 0) > 0)
                  .map((b) => {
                    const balLeft = Number(b.net_amount || 0) - Number(b.customer_paid || 0);
                    return (
                      <option key={b.id} value={b.id}>
                        {b.delivery_date ? formatDate(b.delivery_date) : '—'} ·{' '}
                        {b.bill_no_label || b.feed_no} · ₹{Number(b.net_amount).toLocaleString('en-IN')}
                        {balLeft > 0 ? ` (₹${balLeft.toLocaleString('en-IN')} unpaid)` : ' (paid)'}
                      </option>
                    );
                  })}
              </select>
            </Field>
          )}

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. cheque #12345, partial payment, etc."
              className={`${inputCls(false)} resize-none`}
            />
          </Field>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-2xl">
          <div>
            {isEdit && (
              <button
                onClick={del}
                disabled={saving}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || amount <= 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Record payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full px-3 py-2 rounded-lg border ${invalid ? 'border-red-300' : 'border-gray-200'} bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100`;
}
