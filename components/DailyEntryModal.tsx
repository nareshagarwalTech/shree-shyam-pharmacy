'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import {
  supabase,
  Account,
  ExpenseCategory,
  SaleChannel,
  DailyEntry,
  DailyEntryType,
} from '@/lib/supabase';
import useEscapeKey from '@/lib/useEscapeKey';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** If set, edit mode; otherwise create. */
  entry?: DailyEntry | null;
  accounts: Account[];
  categories: ExpenseCategory[];
  channels: SaleChannel[];
  /** Default date for new entries (YYYY-MM-DD). */
  defaultDate: string;
}

const ENTRY_TYPES: { value: DailyEntryType; label: string; emoji: string; desc: string }[] = [
  { value: 'sale',          label: 'Sale',          emoji: '🟢', desc: 'Money in — POS, QR, Online, Credit, Cash sale' },
  { value: 'expense',       label: 'Expense',       emoji: '🔴', desc: 'Money out — purchases, bills, salary, etc.' },
  { value: 'cash_count',    label: 'Cash Count',    emoji: '💵', desc: 'Physical cash on hand at close of day' },
  { value: 'bank_transfer', label: 'Bank Transfer', emoji: '🏦', desc: 'Move money between two accounts' },
  { value: 'cash_deposit',  label: 'Cash Deposit',  emoji: '🏧', desc: 'Deposit cash into a bank account' },
];

export default function DailyEntryModal({
  open,
  onClose,
  onSaved,
  entry,
  accounts,
  categories,
  channels,
  defaultDate,
}: Props) {
  useEscapeKey(onClose, open);

  const isEdit = !!entry;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [entryType, setEntryType] = useState<DailyEntryType>('sale');
  const [narration, setNarration] = useState('');
  const [txnAmount, setTxnAmount] = useState('');
  const [settledAmount, setSettledAmount] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const [transferToId, setTransferToId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [channelId, setChannelId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Pre-fill on edit (re-runs when entry changes)
  useEffect(() => {
    if (!open) return;
    if (entry) {
      setEntryDate(entry.entry_date);
      setEntryType(entry.entry_type);
      setNarration(entry.narration ?? '');
      setTxnAmount(String(entry.txn_amount ?? ''));
      setSettledAmount(entry.settled_amount != null ? String(entry.settled_amount) : '');
      setAccountId(entry.account_id ?? '');
      setTransferToId(entry.transfer_to_account_id ?? '');
      setCategoryId(entry.expense_category_id ?? '');
      setChannelId(entry.sale_channel_id ?? '');
      setNotes(entry.notes ?? '');
    } else {
      setEntryDate(defaultDate);
      setEntryType('sale');
      setNarration('');
      setTxnAmount('');
      setSettledAmount('');
      setAccountId('');
      setTransferToId('');
      setCategoryId('');
      setChannelId('');
      setNotes('');
    }
    setError(null);
  }, [open, entry, defaultDate]);

  // Convenience lookups
  const cashAccountId = useMemo(() => accounts.find((a) => a.kind === 'cash')?.id ?? '', [accounts]);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.kind === 'bank'), [accounts]);
  const selectedChannel = useMemo(() => channels.find((c) => c.id === channelId), [channels, channelId]);

  // When channel changes for SALE, auto-default account from channel
  useEffect(() => {
    if (entryType !== 'sale' || !selectedChannel || isEdit) return;
    if (selectedChannel.default_account_id && !accountId) {
      setAccountId(selectedChannel.default_account_id);
    }
  }, [entryType, selectedChannel, accountId, isEdit]);

  // For CASH COUNT, force account to CASH
  useEffect(() => {
    if (entryType === 'cash_count' && cashAccountId) setAccountId(cashAccountId);
  }, [entryType, cashAccountId]);

  // For CASH DEPOSIT, force source to CASH
  useEffect(() => {
    if (entryType === 'cash_deposit' && cashAccountId) setAccountId(cashAccountId);
  }, [entryType, cashAccountId]);

  if (!open) return null;

  const handleSave = async () => {
    setError(null);
    const amt = parseFloat(txnAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    const payload: Partial<DailyEntry> = {
      entry_date: entryDate,
      entry_type: entryType,
      narration: narration.trim() || null,
      txn_amount: amt,
      settled_amount: null,
      account_id: null,
      transfer_to_account_id: null,
      expense_category_id: null,
      sale_channel_id: null,
      notes: notes.trim() || null,
    };

    if (entryType === 'sale') {
      if (!channelId) { setError('Pick a sale channel.'); return; }
      payload.sale_channel_id = channelId;
      // Account is required unless channel is CREDIT (no account flows)
      if (selectedChannel?.slug !== 'credit') {
        if (!accountId) { setError('Pick the account money settled into.'); return; }
        payload.account_id = accountId;
      }
      if (selectedChannel?.has_commission && settledAmount) {
        const s = parseFloat(settledAmount);
        if (!Number.isFinite(s) || s < 0) { setError('Settled amount looks wrong.'); return; }
        payload.settled_amount = s;
      }
    } else if (entryType === 'expense') {
      if (!categoryId)    { setError('Pick an expense category.'); return; }
      if (!accountId)     { setError('Pick the account money came from.'); return; }
      payload.expense_category_id = categoryId;
      payload.account_id = accountId;
    } else if (entryType === 'cash_count') {
      payload.account_id = cashAccountId;
    } else if (entryType === 'bank_transfer') {
      if (!accountId || !transferToId) { setError('Pick source and destination accounts.'); return; }
      if (accountId === transferToId)  { setError('Source and destination must differ.'); return; }
      payload.account_id = accountId;
      payload.transfer_to_account_id = transferToId;
    } else if (entryType === 'cash_deposit') {
      if (!transferToId) { setError('Pick the bank account to deposit into.'); return; }
      payload.account_id = cashAccountId;
      payload.transfer_to_account_id = transferToId;
    }

    setSaving(true);
    const { error: dbErr } = entry
      ? await supabase.from('daily_entries').update(payload).eq('id', entry.id)
      : await supabase.from('daily_entries').insert(payload);
    setSaving(false);

    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
  };

  const handleDelete = async () => {
    if (!entry) return;
    if (!confirm(`Delete this ${entry.entry_type.replace('_', ' ')} entry?`)) return;
    setSaving(true);
    const { error: dbErr } = await supabase.from('daily_entries').delete().eq('id', entry.id);
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
  };

  // ---- render helpers ----
  const accountOptions = (filter: (a: Account) => boolean = () => true) =>
    accounts.filter(filter).map((a) => (
      <option key={a.id} value={a.id}>{a.name}</option>
    ));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Entry' : 'New Daily Entry'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Entry Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Entry Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ENTRY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEntryType(t.value)}
                  disabled={isEdit}
                  className={`text-left p-2.5 rounded-lg border transition ${
                    entryType === t.value
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium text-gray-900 text-sm">
                    {t.emoji} {t.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{t.desc}</div>
                </button>
              ))}
            </div>
            {isEdit && <div className="text-xs text-gray-400 mt-1">Type cannot be changed after creation.</div>}
          </div>

          {/* Type-specific fields */}
          {entryType === 'sale' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sale Channel</label>
                <select
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select…</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {selectedChannel?.slug !== 'credit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Settled Into Account</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select…</option>
                    {accountOptions()}
                  </select>
                </div>
              )}
            </>
          )}

          {entryType === 'expense' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_credit_note ? '  (refund in)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Paid From / Refund Into</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select…</option>
                  {accountOptions()}
                </select>
              </div>
            </>
          )}

          {entryType === 'bank_transfer' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">From</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select…</option>
                    {accountOptions()}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
                  <select
                    value={transferToId}
                    onChange={(e) => setTransferToId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select…</option>
                    {accountOptions((a) => a.id !== accountId)}
                  </select>
                </div>
              </div>
            </>
          )}

          {entryType === 'cash_deposit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Deposit Into Bank</label>
              <select
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">Select bank…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <div className="text-xs text-gray-400 mt-1">Source: CASH (auto)</div>
            </div>
          )}

          {entryType === 'cash_count' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              💡 Tip: use the <a href="/manager/daily-book/denomination" className="underline font-medium">denomination calculator</a> for a precise count.
            </div>
          )}

          {/* Narration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Narration <span className="text-gray-400 font-normal">(short description)</span>
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder={
                entryType === 'sale' ? 'e.g. POS (14/05/2026)' :
                entryType === 'expense' ? 'e.g. SAI PHARMA' :
                entryType === 'cash_count' ? 'CLOSING BALANCE' :
                entryType === 'bank_transfer' ? 'e.g. NEFT to HDFC' :
                'e.g. Deposited at HDFC branch'
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Amounts */}
          <div className={selectedChannel?.has_commission && entryType === 'sale' ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {entryType === 'sale' && selectedChannel?.has_commission ? 'Txn Amount (gross)' : 'Amount'} (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={txnAmount}
                onChange={(e) => setTxnAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-lg font-medium"
              />
            </div>
            {entryType === 'sale' && selectedChannel?.has_commission && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Settled (₹) <span className="text-gray-400 font-normal">optional</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settledAmount}
                  onChange={(e) => setSettledAmount(e.target.value)}
                  placeholder="auto"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional, internal)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div>
            {isEdit && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
