'use client';

import { useState, useEffect } from 'react';
import { supabase, SalesTransaction } from '@/lib/supabase';
import { X, Loader2, AlertCircle, Trash2 } from 'lucide-react';

interface Props {
  bill: SalesTransaction;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}

export default function EditBillModal({ bill, onClose, onSaved, onError }: Props) {
  const [billNoLabel, setBillNoLabel] = useState(bill.bill_no_label || bill.feed_no);
  const [deliveryDate, setDeliveryDate] = useState(bill.delivery_date || bill.feed_date);
  const [netAmount, setNetAmount] = useState<number>(Number(bill.net_amount || 0));
  const [forDays, setForDays] = useState<number | ''>(bill.for_days ?? '');
  const [changeGiven, setChangeGiven] = useState<number>(Number(bill.change_given || 0));
  const [notes, setNotes] = useState(bill.delivery_notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const save = async () => {
    if (!deliveryDate) return onError('Date required');
    if (netAmount <= 0) return onError('Bill amount must be > 0');

    setSaving(true);
    const { error } = await supabase
      .from('sales_transactions')
      .update({
        bill_no_label: billNoLabel.trim() || null,
        delivery_date: deliveryDate,
        feed_date: deliveryDate,
        net_amount: netAmount,
        for_days: forDays === '' ? null : forDays,
        change_given: changeGiven || 0,
        delivery_notes: notes.trim() || null,
      })
      .eq('id', bill.id);
    setSaving(false);
    if (error) onError(error.message);
    else onSaved();
  };

  const del = async () => {
    if (!confirm(
      `Delete bill ${bill.bill_no_label || bill.feed_no} (₹${bill.net_amount}) from ${bill.delivery_date}?\n\n` +
      'Any payments allocated specifically to this bill will become customer-level.'
    )) return;
    setSaving(true);
    const { error } = await supabase.from('sales_transactions').delete().eq('id', bill.id);
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
            <h3 className="font-display font-bold text-gray-900 text-lg">Edit Bill</h3>
            <p className="text-sm text-gray-500 font-mono">{bill.bill_no_label || bill.feed_no}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Payments are tracked separately — edit them from the &quot;Payments&quot; section on the customer
              statement page. This dialog only edits the bill itself.
            </span>
          </div>

          <Field label="Bill # / Label">
            <input
              value={billNoLabel}
              onChange={(e) => setBillNoLabel(e.target.value)}
              className={`${inputCls(false)} font-mono`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery date *">
              <input
                type="date"
                value={deliveryDate || ''}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={inputCls(!deliveryDate)}
              />
            </Field>
            <Field label="Bill amount (₹) *">
              <input
                type="number"
                value={netAmount || ''}
                onChange={(e) => setNetAmount(parseFloat(e.target.value) || 0)}
                className={`${inputCls(netAmount <= 0)} font-display font-bold`}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="For days" hint="Used for refill reminder">
              <input
                type="number"
                value={forDays}
                onChange={(e) => setForDays(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                className={inputCls(false)}
                placeholder="—"
              />
            </Field>
            <Field label="Change given (₹)" hint="Returned at delivery">
              <input
                type="number"
                value={changeGiven || ''}
                onChange={(e) => setChangeGiven(parseFloat(e.target.value) || 0)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls(false)} resize-none`}
            />
          </Field>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-2xl">
          <button
            onClick={del}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Delete bill
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || netAmount <= 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
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
