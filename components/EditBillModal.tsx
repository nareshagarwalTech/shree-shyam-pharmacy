'use client';

import { useEffect, useState } from 'react';
import { supabase, SalesTransaction, Payment, PaymentChannel } from '@/lib/supabase';
import { todayISO, formatDate } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import useEscapeKey from '@/lib/useEscapeKey';
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
  ChevronDown,
  User,
  Phone,
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
  const [notes, setNotes] = useState(bill.delivery_notes || '');
  const [billOpen, setBillOpen] = useState(false);

  // Customer (fetched on mount so we always have the canonical name)
  const [customerName, setCustomerName] = useState<string>(
    (bill as any).customer_name || bill.customer_name_raw || '',
  );
  const [customerPhone, setCustomerPhone] = useState<string>(bill.customer_phone || '');

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPays, setLoadingPays] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
  // Don't close while a destructive confirm() is up — only when at the
  // outer level (no draft in progress)
  useEscapeKey(onClose, !adding && !editingId);

  // Fetch canonical customer info on mount (covers cases where the parent
  // didn't pre-attach customer_name to the bill row)
  useEffect(() => {
    if (!bill.customer_id) return;
    let cancelled = false;
    supabase
      .from('customers')
      .select('name, phone')
      .eq('id', bill.customer_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.name) setCustomerName(data.name);
        if (data.phone) setCustomerPhone(data.phone);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.customer_id]);

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
  const isFullyPaid = balanceLeft === 0 && netAmount > 0;

  // Open the "add payment" form by default if there's still a balance
  useEffect(() => {
    if (!loadingPays && balanceLeft > 0 && payments.length === 0 && !adding && !editingId) {
      startAddPayment();
    }
    // eslint-disable-next-line
  }, [loadingPays]);

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
        delivery_notes: notes.trim() || null,
      })
      .eq('id', bill.id);
    setSavingBill(false);
    if (error) onError(error.message);
    else { setBillOpen(false); onSaved(); }
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
  function startAddPayment() {
    setEditingId(null);
    setAdding(true);
    setDraft({
      amount: balanceLeft > 0 ? balanceLeft : 0,
      mode: 'cash',
      payment_date: todayISO(),
      notes: '',
    });
  }

  const startEditPayment = (p: Payment) => {
    setAdding(false);
    setEditingId(p.id);
    setDraft({
      id: p.id,
      amount: Number(p.amount),
      mode: p.mode,
      payment_date: p.payment_date,
      notes: p.notes || '',
    });
  };

  const cancelDraft = () => {
    setAdding(false);
    setEditingId(null);
  };

  const saveDraft = async () => {
    if (draft.amount <= 0) return onError('Amount must be > 0');
    if (!draft.payment_date) return onError('Payment date required');
    setSavingDraft(true);

    if (adding) {
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
    } else if (editingId) {
      const { error } = await supabase
        .from('payments')
        .update({
          amount: draft.amount,
          mode: draft.mode,
          payment_date: draft.payment_date,
          notes: draft.notes.trim() || null,
        })
        .eq('id', editingId);
      if (error) {
        setSavingDraft(false);
        onError(error.message);
        return;
      }
    }

    setSavingDraft(false);
    setAdding(false);
    setEditingId(null);
    refreshPayments();
  };

  const delPayment = async (p: Payment) => {
    if (!confirm(`Delete the ₹${p.amount} ${p.mode} payment from ${formatDate(p.payment_date)}?`)) return;
    const { error } = await supabase.from('payments').delete().eq('id', p.id);
    if (error) return onError(error.message);
    refreshPayments();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl modal-content max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-bold text-gray-900 text-base sm:text-lg">Edit Delivery</h3>
              <span className="text-xs sm:text-sm text-gray-500 font-mono">{bill.bill_no_label || bill.feed_no}</span>
            </div>
            {customerName && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1 text-sm">
                <span className="inline-flex items-center gap-1 font-semibold text-gray-900">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate max-w-[200px] sm:max-w-[320px]">{customerName}</span>
                </span>
                {customerPhone && (
                  <a
                    href={`tel:${customerPhone}`}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600"
                    title={`Call ${customerPhone}`}
                  >
                    <Phone className="w-3 h-3" />
                    {formatPhoneDisplay(customerPhone)}
                  </a>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Summary strip — always visible */}
          <div className="px-4 sm:px-6 py-3 bg-gradient-to-br from-emerald-50/40 to-white border-b border-gray-100">
            <div className="grid grid-cols-3 gap-2">
              <Mini label="Bill" value={`₹${netAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
              <Mini
                label="Paid"
                value={`₹${totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                color="emerald"
              />
              <Mini
                label="Balance"
                value={`₹${balanceLeft.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                color={balanceLeft > 0 ? 'red' : 'emerald'}
              />
            </div>
            {isFullyPaid && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle className="w-4 h-4" /> Fully paid
              </div>
            )}
          </div>

          {/* Bill details — top, collapsible */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
            <button
              onClick={() => setBillOpen((v) => !v)}
              className="w-full flex items-center justify-between text-left hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg"
            >
              <div className="flex items-center gap-2">
                {billOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bill details</h4>
              </div>
              {!billOpen && (
                <span className="text-xs text-gray-500 truncate ml-2">
                  {deliveryDate ? formatDate(deliveryDate) : '—'}
                  {forDays !== '' && forDays !== null ? ` · ${forDays} days` : ''}
                </span>
              )}
            </button>

            {billOpen && (
              <div className="mt-3 space-y-3">
                <Field label="Bill # / Label">
                  <input
                    value={billNoLabel}
                    onChange={(e) => setBillNoLabel(e.target.value)}
                    className={`${inputCls(false)} font-mono text-sm`}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                <Field
                  label="Medicines for (days)"
                  hint="How many days will this supply last? e.g. 30 for a 1-month course. Used to send a refill reminder before they run out."
                >
                  <input
                    type="number"
                    value={forDays}
                    onChange={(e) => setForDays(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                    className={inputCls(false)}
                    placeholder="e.g. 30"
                  />
                </Field>

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
            )}
          </div>

          {/* Payments — bottom, primary action */}
          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {adding ? 'Add payment' : `Payments (${payments.length})`}
              </h4>
              {!adding && !editingId && (
                <button
                  onClick={startAddPayment}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add payment
                </button>
              )}
            </div>

            {/* Inline draft form (add OR edit) */}
            {(adding || editingId) && (
              <PaymentDraftForm
                draft={draft}
                setDraft={setDraft}
                saving={savingDraft}
                onSave={saveDraft}
                onCancel={cancelDraft}
                isEdit={!!editingId}
                balanceLeft={balanceLeft}
              />
            )}

            {/* Existing payments list */}
            {loadingPays ? (
              <div className="py-6 text-center"><div className="spinner mx-auto" /></div>
            ) : payments.length === 0 ? (
              !adding && (
                <div className="py-3 px-4 bg-gray-50 rounded-lg text-sm text-gray-500 text-center mt-3">
                  No payments recorded yet for this bill.
                </div>
              )
            ) : (
              <div className="mt-3 space-y-1.5">
                {payments.map((p) => (
                  editingId === p.id ? null : (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      onEdit={() => startEditPayment(p)}
                      onDelete={() => delPayment(p)}
                    />
                  )
                ))}
              </div>
            )}

            <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 mt-3">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Add as many partial payments as needed, on any dates. Each lands on its date in
                Daily / Monthly Collection.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-2xl shrink-0 safe-pb">
          <button
            onClick={delBill}
            disabled={savingBill}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete bill</span>
            <span className="sm:hidden">Delete</span>
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Existing-payment row (read-only, with edit/delete actions)
// ============================================================================
function PaymentRow({
  payment, onEdit, onDelete,
}: {
  payment: Payment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const modeColor: Record<string, string> = {
    cash:   'bg-emerald-100 text-emerald-700',
    online: 'bg-cyan-100 text-cyan-700',
    cheque: 'bg-purple-100 text-purple-700',
    card:   'bg-blue-100 text-blue-700',
    other:  'bg-gray-100 text-gray-700',
  };
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 flex-wrap">
        <span className="font-display font-bold text-emerald-700 text-base">
          ₹{Number(payment.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </span>
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${modeColor[payment.mode] || modeColor.other}`}>
          {payment.mode}
        </span>
        <span className="text-xs text-gray-500">{formatDate(payment.payment_date)}</span>
        {payment.notes && (
          <span className="text-xs text-gray-400 truncate max-w-[200px]" title={payment.notes}>
            · {payment.notes}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
          title="Edit payment"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
          title="Delete payment"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Inline draft form for add/edit payment — large, easy-to-tap fields
// ============================================================================
function PaymentDraftForm({
  draft, setDraft, saving, onSave, onCancel, isEdit, balanceLeft,
}: {
  draft: PaymentDraft;
  setDraft: (d: PaymentDraft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isEdit: boolean;
  balanceLeft: number;
}) {
  return (
    <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-xl p-3 sm:p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={draft.payment_date}
            onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })}
            className={inputCls(false)}
          />
        </Field>
        <Field label="Amount (₹) *">
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="number"
              value={draft.amount || ''}
              onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
              className={`${inputCls(draft.amount <= 0)} pl-9 font-display font-bold text-emerald-700`}
              placeholder="0"
              autoFocus
            />
          </div>
        </Field>
        <Field label="Mode">
          <select
            value={draft.mode}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value as PaymentChannel })}
            className={`${inputCls(false)} uppercase font-semibold`}
          >
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Notes (optional)">
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="e.g. UPI ref, cheque no."
          className={inputCls(false)}
        />
      </Field>

      {!isEdit && balanceLeft > 0 && draft.amount !== balanceLeft && (
        <button
          type="button"
          onClick={() => setDraft({ ...draft, amount: balanceLeft })}
          className="text-xs text-emerald-700 hover:underline"
        >
          Use full balance ₹{balanceLeft.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </button>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 hover:bg-white rounded-lg font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || draft.amount <= 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {isEdit ? 'Save changes' : 'Add payment'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: 'emerald' | 'red' }) {
  const cls = color === 'red' ? 'bg-red-50 border-red-200 text-red-700'
    : color === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : 'bg-white border-gray-200 text-gray-700';
  return (
    <div className={`rounded-lg border p-2 ${cls}`}>
      <div className="text-[10px] uppercase opacity-70 font-semibold tracking-wide">{label}</div>
      <div className="font-display font-bold text-sm sm:text-base mt-0.5">{value}</div>
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full px-3 py-2 rounded-lg border ${invalid ? 'border-red-300' : 'border-gray-200'} bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm`;
}
