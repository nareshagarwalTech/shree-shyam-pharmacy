'use client';

import { useEffect, useState } from 'react';
import { supabase, SalesTransaction, Payment, PaymentChannel } from '@/lib/supabase';
import { todayISO, formatDate } from '@/lib/utils';
import {
  X,
  Loader2,
  AlertCircle,
  Trash2,
  PlusCircle,
  Pencil,
  CheckCircle,
  IndianRupee,
  ChevronRight,
} from 'lucide-react';

interface Props {
  bill: SalesTransaction;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}

const MODES: PaymentChannel[] = ['cash', 'online', 'cheque', 'card', 'other'];

interface PaymentDraft {
  id?: string;
  amount: number;
  mode: PaymentChannel;
  payment_date: string;
  notes: string;
}

export default function EditBillModal({ bill, onClose, onSaved, onError }: Props) {
  // Bill state
  const [billNoLabel, setBillNoLabel] = useState(bill.bill_no_label || bill.feed_no);
  const [deliveryDate, setDeliveryDate] = useState(bill.delivery_date || bill.feed_date);
  const [netAmount, setNetAmount] = useState<number>(Number(bill.net_amount || 0));
  const [forDays, setForDays] = useState<number | ''>(bill.for_days ?? '');
  const [changeGiven, setChangeGiven] = useState<number>(Number(bill.change_given || 0));
  const [notes, setNotes] = useState(bill.delivery_notes || '');

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPays, setLoadingPays] = useState(true);
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [draft, setDraft] = useState<PaymentDraft>({
    amount: 0,
    mode: 'cash',
    payment_date: todayISO(),
    notes: '',
  });
  const [savingDraft, setSavingDraft] = useState(false);

  const [savingBill, setSavingBill] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const refreshPayments = async () => {
    setLoadingPays(true);
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('sales_transaction_id', bill.id)
      .order('payment_date', { ascending: true });
    setPayments((data || []) as Payment[]);
    setLoadingPays(false);
  };

  useEffect(() => { refreshPayments(); /* eslint-disable-next-line */ }, [bill.id]);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balanceLeft = Math.max(0, netAmount - totalPaid);

  // -------- Bill save / delete -----------------------------------------------
  const saveBill = async () => {
    if (!deliveryDate) return onError('Date required');
    if (netAmount <= 0) return onError('Bill amount must be > 0');
    setSavingBill(true);
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
    setSavingBill(false);
    if (error) onError(error.message);
    else onSaved();
  };

  const delBill = async () => {
    if (!confirm(
      `Delete bill ${bill.bill_no_label || bill.feed_no} (₹${bill.net_amount}) from ${bill.delivery_date}?\n\n` +
      `This will also unlink ${payments.length} payment(s) — they become customer-level (FIFO).`
    )) return;
    setSavingBill(true);
    const { error } = await supabase.from('sales_transactions').delete().eq('id', bill.id);
    setSavingBill(false);
    if (error) onError(error.message);
    else onSaved();
  };

  // -------- Payment add / edit / delete --------------------------------------
  const startNewPayment = () => {
    setEditing('new');
    setDraft({
      amount: balanceLeft > 0 ? balanceLeft : 0,
      mode: 'cash',
      payment_date: todayISO(),
      notes: '',
    });
  };

  const startEditPayment = (p: Payment) => {
    setEditing(p.id);
    setDraft({
      id: p.id,
      amount: Number(p.amount),
      mode: p.mode,
      payment_date: p.payment_date,
      notes: p.notes || '',
    });
  };

  const cancelEdit = () => { setEditing(null); };

  const saveDraft = async () => {
    if (draft.amount <= 0) return onError('Amount must be > 0');
    if (!draft.payment_date) return onError('Payment date required');
    setSavingDraft(true);

    if (editing === 'new') {
      const { error } = await supabase.from('payments').insert({
        customer_id: bill.customer_id,
        sales_transaction_id: bill.id,
        amount: draft.amount,
        mode: draft.mode,
        payment_date: draft.payment_date,
        notes: draft.notes.trim() || null,
      });
      if (error) {
        setSavingDraft(false);
        onError(error.message);
        return;
      }
    } else if (draft.id) {
      const { error } = await supabase
        .from('payments')
        .update({
          amount: draft.amount,
          mode: draft.mode,
          payment_date: draft.payment_date,
          notes: draft.notes.trim() || null,
        })
        .eq('id', draft.id);
      if (error) {
        setSavingDraft(false);
        onError(error.message);
        return;
      }
    }

    setSavingDraft(false);
    setEditing(null);
    refreshPayments();
  };

  const delPayment = async (p: Payment) => {
    if (!confirm(`Delete the ₹${p.amount} ${p.mode} payment from ${formatDate(p.payment_date)}?`)) return;
    const { error } = await supabase.from('payments').delete().eq('id', p.id);
    if (error) return onError(error.message);
    refreshPayments();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl modal-content max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-gray-900 text-lg">Edit Delivery</h3>
            <p className="text-sm text-gray-500 font-mono">{bill.bill_no_label || bill.feed_no}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {/* Bill details */}
          <div className="px-6 py-4 space-y-3 border-b border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bill details</h4>

            <Field label="Bill # / Label">
              <input
                value={billNoLabel}
                onChange={(e) => setBillNoLabel(e.target.value)}
                className={`${inputCls(false)} font-mono text-sm`}
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

            <div className="flex justify-end">
              <button
                onClick={saveBill}
                disabled={savingBill}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {savingBill ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {savingBill ? 'Saving…' : 'Save bill'}
              </button>
            </div>
          </div>

          {/* Payments */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Payments ({payments.length})
              </h4>
              {editing !== 'new' && (
                <button
                  onClick={startNewPayment}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium rounded-lg"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add payment
                </button>
              )}
            </div>

            {/* Balance summary */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Mini label="Bill" value={`₹${netAmount.toLocaleString('en-IN')}`} />
              <Mini label="Paid" value={`₹${totalPaid.toLocaleString('en-IN')}`} color="emerald" />
              <Mini
                label="Balance"
                value={`₹${balanceLeft.toLocaleString('en-IN')}`}
                color={balanceLeft > 0 ? 'red' : 'emerald'}
              />
            </div>

            {loadingPays ? (
              <div className="py-4 text-center"><div className="spinner mx-auto" /></div>
            ) : payments.length === 0 && editing !== 'new' ? (
              <div className="py-3 px-4 bg-gray-50 rounded-lg text-sm text-gray-500 text-center">
                No payments recorded yet for this bill. Click <strong>Add payment</strong> above.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <Th>Date</Th>
                      <Th align="right">Amount</Th>
                      <Th>Mode</Th>
                      <Th>Notes</Th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((p) => {
                      const isEditingThis = editing === p.id;
                      if (isEditingThis) {
                        return (
                          <PaymentEditorRow
                            key={p.id}
                            draft={draft}
                            setDraft={setDraft}
                            saving={savingDraft}
                            onSave={saveDraft}
                            onCancel={cancelEdit}
                          />
                        );
                      }
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900">{formatDate(p.payment_date)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                            ₹{Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                              p.mode === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                              p.mode === 'online' ? 'bg-cyan-100 text-cyan-700' :
                              p.mode === 'cheque' ? 'bg-purple-100 text-purple-700' :
                              p.mode === 'card' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {p.mode}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[140px] truncate" title={p.notes ?? ''}>
                            {p.notes || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditPayment(p)}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                title="Edit payment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => delPayment(p)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="Delete payment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {editing === 'new' && (
                      <PaymentEditorRow
                        draft={draft}
                        setDraft={setDraft}
                        saving={savingDraft}
                        onSave={saveDraft}
                        onCancel={cancelEdit}
                        isNew
                      />
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Multiple partial payments are supported — add as many as needed, on any dates. Each
                payment lands on its date in Daily / Monthly Collection. Customer-level (FIFO)
                payments are managed from the customer&apos;s statement page.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-2xl">
          <button
            onClick={delBill}
            disabled={savingBill}
            className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Delete bill
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Inline payment editor row
// ============================================================================
function PaymentEditorRow({
  draft, setDraft, saving, onSave, onCancel, isNew,
}: {
  draft: PaymentDraft;
  setDraft: (d: PaymentDraft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <tr className={isNew ? 'bg-emerald-50/40' : 'bg-amber-50/40'}>
      <td className="px-3 py-2">
        <input
          type="date"
          value={draft.payment_date}
          onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })}
          className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <IndianRupee className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="number"
            value={draft.amount || ''}
            onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
            className="w-full pl-5 pr-2 py-1 rounded border border-gray-200 text-right font-semibold text-emerald-700 text-sm"
            placeholder="0"
            autoFocus
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <select
          value={draft.mode}
          onChange={(e) => setDraft({ ...draft, mode: e.target.value as PaymentChannel })}
          className="w-full px-2 py-1 rounded border border-gray-200 text-xs uppercase font-semibold"
        >
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="optional"
          className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onSave}
            disabled={saving || draft.amount <= 0}
            className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1 text-gray-600 hover:bg-white text-xs font-medium rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: 'emerald' | 'red' }) {
  const cls = color === 'red' ? 'bg-red-50 border-red-200 text-red-700'
    : color === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : 'bg-gray-50 border-gray-200 text-gray-700';
  return (
    <div className={`rounded-lg border p-2 ${cls}`}>
      <div className="text-[10px] uppercase opacity-70 font-semibold">{label}</div>
      <div className="font-display font-bold">{value}</div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 text-${align} text-[10px] font-semibold text-gray-600 uppercase tracking-wider`}>
      {children}
    </th>
  );
}

function inputCls(invalid: boolean) {
  return `w-full px-3 py-2 rounded-lg border ${invalid ? 'border-red-300' : 'border-gray-200'} bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm`;
}
