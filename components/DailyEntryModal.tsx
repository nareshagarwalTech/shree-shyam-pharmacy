'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import {
  supabase,
  Account,
  Category,
  PaymentMode,
  DailyEntry,
  EntryDirection,
  EntryScope,
  TxnType,
} from '@/lib/supabase';
import useEscapeKey from '@/lib/useEscapeKey';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** If set, edit mode; otherwise create. */
  entry?: DailyEntry | null;
  accounts: Account[];
  categories: Category[];
  modes: PaymentMode[];
  /** Default date for new entries (YYYY-MM-DD). */
  defaultDate: string;
}

// The 6 type tiles. Encodes direction + scope + txn_type.
interface TypeOption {
  key: string;
  label: string;
  emoji: string;
  description: string;
  accent: string;          // tailwind classes for selected state
  txnType: TxnType;
  direction: EntryDirection | null;
  scope: EntryScope | null;
}
const TYPE_OPTIONS: TypeOption[] = [
  { key: 'biz_income',  label: 'Business Income',  emoji: '🟢', description: 'Sales — POS, QR, online, cash',
    accent: 'border-emerald-500 bg-emerald-50 ring-emerald-100',
    txnType: 'entry', direction: 'income', scope: 'business' },
  { key: 'biz_expense', label: 'Business Expense', emoji: '🔴', description: 'Purchase, salary, rent, bills',
    accent: 'border-rose-500 bg-rose-50 ring-rose-100',
    txnType: 'entry', direction: 'expense', scope: 'business' },
  { key: 'pers_income', label: 'Personal Income',  emoji: '🟢', description: 'Salary, gift, dividend, refund',
    accent: 'border-emerald-500 bg-emerald-50 ring-emerald-100',
    txnType: 'entry', direction: 'income', scope: 'personal' },
  { key: 'pers_expense',label: 'Personal Expense', emoji: '🔴', description: 'Groceries, fuel, household',
    accent: 'border-rose-500 bg-rose-50 ring-rose-100',
    txnType: 'entry', direction: 'expense', scope: 'personal' },
  { key: 'cash_count',  label: 'Cash Count',       emoji: '💵', description: 'Physical cash on hand at close',
    accent: 'border-amber-500 bg-amber-50 ring-amber-100',
    txnType: 'cash_count', direction: null, scope: null },
  { key: 'transfer',    label: 'Account Transfer', emoji: '🔁', description: 'Move money between your accounts',
    accent: 'border-violet-500 bg-violet-50 ring-violet-100',
    txnType: 'transfer', direction: null, scope: null },
];

function keyForEntry(e: DailyEntry): string {
  if (e.txn_type === 'cash_count') return 'cash_count';
  if (e.txn_type === 'transfer')   return 'transfer';
  // txn_type === 'entry'
  if (e.direction === 'income'  && e.scope === 'business') return 'biz_income';
  if (e.direction === 'expense' && e.scope === 'business') return 'biz_expense';
  if (e.direction === 'income'  && e.scope === 'personal') return 'pers_income';
  if (e.direction === 'expense' && e.scope === 'personal') return 'pers_expense';
  return 'biz_income';
}

export default function DailyEntryModal({
  open, onClose, onSaved, entry, accounts, categories, modes, defaultDate,
}: Props) {
  useEscapeKey(onClose, open);

  const isEdit = !!entry;
  const isLinked = !!entry?.linked_entry_id;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeKey, setTypeKey]         = useState<string>('biz_income');
  const [entryDate, setEntryDate]     = useState(defaultDate);
  const [settlementDate, setSettlementDate] = useState('');
  const [accountId, setAccountId]     = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [modeId, setModeId]           = useState('');
  const [categoryId, setCategoryId]   = useState('');
  const [txnAmount, setTxnAmount]     = useState('');
  const [settledAmount, setSettledAmount] = useState('');
  const [narration, setNarration]     = useState('');
  const [notes, setNotes]             = useState('');

  // Prefill from entry on open
  useEffect(() => {
    if (!open) return;
    if (entry) {
      setTypeKey(keyForEntry(entry));
      setEntryDate(entry.entry_date);
      setSettlementDate(entry.settlement_date ?? '');
      setAccountId(entry.account_id ?? '');
      setTransferToId(entry.transfer_to_account_id ?? '');
      setModeId(entry.mode_id ?? '');
      setCategoryId(entry.category_id ?? '');
      setTxnAmount(String(entry.txn_amount ?? ''));
      setSettledAmount(entry.settled_amount != null ? String(entry.settled_amount) : '');
      setNarration(entry.narration ?? '');
      setNotes(entry.notes ?? '');
    } else {
      setTypeKey('biz_income');
      setEntryDate(defaultDate);
      setSettlementDate('');
      setAccountId('');
      setTransferToId('');
      setModeId('');
      setCategoryId('');
      setTxnAmount('');
      setSettledAmount('');
      setNarration('');
      setNotes('');
    }
    setError(null);
  }, [open, entry, defaultDate]);

  const selectedType = useMemo(() => TYPE_OPTIONS.find((t) => t.key === typeKey)!, [typeKey]);
  const cashAccount  = useMemo(() => accounts.find((a) => a.kind === 'cash'), [accounts]);
  const selectedMode = useMemo(() => modes.find((m) => m.id === modeId) ?? null, [modes, modeId]);

  // For non-entry types, no category/mode. For cash_count, force CASH account.
  useEffect(() => {
    if (selectedType.txnType === 'cash_count' && cashAccount && !isEdit) {
      setAccountId(cashAccount.id);
    }
  }, [selectedType, cashAccount, isEdit]);

  // Filtered category list by scope; direction matches the entry's direction
  // OR is 'shared' (= fund / earmarked pool, can be tagged on both income & expense).
  const visibleCategories = useMemo(() => {
    if (selectedType.txnType !== 'entry') return [];
    return categories.filter(
      (c) =>
        c.scope === selectedType.scope &&
        c.is_active &&
        (c.direction === selectedType.direction || c.direction === 'shared')
    );
  }, [categories, selectedType]);

  // If the user switches type, clear category (since the list changes)
  useEffect(() => {
    if (!isEdit) setCategoryId('');
  }, [selectedType.key, isEdit]);

  if (!open) return null;

  // -------- save -------- //
  const handleSave = async () => {
    setError(null);
    if (isLinked) {
      setError('This row is auto-managed by a parent income entry. Edit the source instead.');
      return;
    }
    const amt = parseFloat(txnAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount must be greater than zero.'); return; }

    const payload: Partial<DailyEntry> = {
      entry_date: entryDate,
      settlement_date: null,
      txn_type: selectedType.txnType,
      direction: selectedType.direction,
      scope: selectedType.scope,
      account_id: null,
      transfer_to_account_id: null,
      mode_id: null,
      category_id: null,
      txn_amount: amt,
      settled_amount: null,
      narration: narration.trim() || null,
      notes: notes.trim() || null,
    };

    if (selectedType.txnType === 'entry') {
      if (!accountId)  { setError('Pick an account.'); return; }
      if (!modeId)     { setError('Pick a payment mode.'); return; }
      if (!categoryId) { setError('Pick a category.'); return; }
      payload.account_id = accountId;
      payload.mode_id = modeId;
      payload.category_id = categoryId;

      // Commission only applies to INCOME with has_commission mode
      if (selectedType.direction === 'income' && selectedMode?.has_commission && settledAmount) {
        const s = parseFloat(settledAmount);
        if (!Number.isFinite(s) || s < 0) { setError('Settled amount looks wrong.'); return; }
        if (s > amt) { setError('Settled cannot exceed transaction amount.'); return; }
        payload.settled_amount = s;
        if (settlementDate) payload.settlement_date = settlementDate;
      }
    } else if (selectedType.txnType === 'cash_count') {
      if (!cashAccount) { setError('CASH account is not configured.'); return; }
      payload.account_id = cashAccount.id;
    } else if (selectedType.txnType === 'transfer') {
      if (!accountId || !transferToId) { setError('Pick source and destination accounts.'); return; }
      if (accountId === transferToId)  { setError('Source and destination must differ.'); return; }
      payload.account_id = accountId;
      payload.transfer_to_account_id = transferToId;
    }

    setSaving(true);
    try {
      const res = entry
        ? await supabase.from('daily_entries').update(payload).eq('id', entry.id)
        : await supabase.from('daily_entries').insert(payload);
      if (res.error) {
        console.error('Save failed:', res.error);
        const code = res.error.code ? ` [${res.error.code}]` : '';
        const detail = res.error.details ? `\nDetails: ${res.error.details}` : '';
        setError(`Save failed${code}: ${res.error.message}${detail}`);
        return;
      }
      onSaved();
    } catch (e: any) {
      console.error('Save threw:', e);
      setError(`Unexpected error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    if (isLinked) {
      setError('This row is auto-managed. Edit the source income (the sale or closing balance) to change it.');
      return;
    }
    if (!confirm('Delete this entry?')) return;
    setError(null);
    setSaving(true);
    try {
      const res = await supabase.from('daily_entries').delete().eq('id', entry.id);
      if (res.error) {
        // Surface the full error so we can debug
        console.error('Delete failed:', res.error);
        const code = res.error.code ? ` [${res.error.code}]` : '';
        const detail = res.error.details ? `\nDetails: ${res.error.details}` : '';
        const hint = res.error.hint ? `\nHint: ${res.error.hint}` : '';
        setError(`Delete failed${code}: ${res.error.message}${detail}${hint}`);
        return;
      }
      onSaved();
    } catch (e: any) {
      console.error('Delete threw:', e);
      setError(`Unexpected error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // -------- render -------- //
  const showCommissionUI =
    selectedType.txnType === 'entry' &&
    selectedType.direction === 'income' &&
    !!selectedMode?.has_commission;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? (isLinked ? 'View Auto-Linked Entry' : 'Edit Entry') : 'New Daily Entry'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLinked && (
          <div className="mx-6 mt-4 p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm text-violet-800">
            🔒 This entry is auto-managed by a source income transaction. Edit the source to change.
          </div>
        )}

        <div className={`px-6 py-5 space-y-5 ${isLinked ? 'opacity-70 pointer-events-none' : ''}`}>
          {/* Type tiles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Entry Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeKey(t.key)}
                  disabled={isEdit}
                  className={`text-left p-2.5 rounded-lg border transition ${
                    typeKey === t.key ? `${t.accent} ring-2` : 'border-gray-200 hover:border-gray-300 bg-white'
                  } ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium text-gray-900 text-sm">{t.emoji} {t.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t.description}</div>
                </button>
              ))}
            </div>
            {isEdit && <div className="text-xs text-gray-400 mt-1">Type cannot be changed after creation.</div>}
          </div>

          {/* Transaction Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Transaction Date
              <span className="text-xs text-gray-400 font-normal ml-2">when it happened</span>
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Account (and Transfer-to for transfer type) */}
          {selectedType.txnType === 'transfer' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">From Account</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">To Account</label>
                <select
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select…</option>
                  {accounts.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : selectedType.txnType === 'cash_count' ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              💡 Use the <a href="/manager/daily-book/denomination" className="underline font-medium">denomination calculator</a> for a precise count. This entry sits against the CASH account automatically.
            </div>
          ) : (
            // 'entry' type — Account + Mode + Category
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Account <span className="text-xs text-gray-400 font-normal">where money is</span>
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Mode <span className="text-xs text-gray-400 font-normal">how it moved</span>
                  </label>
                  <select
                    value={modeId}
                    onChange={(e) => setModeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select…</option>
                    {modes.filter((m) => m.is_active).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Category
                  <span className="text-xs text-gray-400 font-normal ml-2">📌 shared = fund / earmarked pool</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">{visibleCategories.length === 0 ? 'No categories — add one in /manager/daily-book/categories' : 'Select…'}</option>
                  {/* Regular direction-matching categories */}
                  {visibleCategories.filter((c) => c.direction !== 'shared').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.is_credit_note ? '  (refund)' : ''}
                    </option>
                  ))}
                  {/* Shared funds — clearly tagged */}
                  {visibleCategories.some((c) => c.direction === 'shared') && (
                    <optgroup label="📌 Funds (shared)">
                      {visibleCategories.filter((c) => c.direction === 'shared').map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </>
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
              placeholder="e.g. SAI PHARMA / Hospital eye / GPay Piyush"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Amounts */}
          <div className={showCommissionUI ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {showCommissionUI ? 'Txn Amount (gross)' : 'Amount'} (₹)
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
            {showCommissionUI && (
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

          {/* Settlement Date + bank charges preview — only when commission detected */}
          {showCommissionUI && settledAmount && parseFloat(settledAmount) < parseFloat(txnAmount || '0') && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Settlement Date
                  <span className="text-xs text-gray-400 font-normal ml-2">when bank credited</span>
                </label>
                <input
                  type="date"
                  value={settlementDate || entryDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
                />
              </div>
              {(() => {
                const commission = parseFloat(txnAmount) - parseFloat(settledAmount);
                const acct = accounts.find((a) => a.id === accountId);
                return (
                  <div className="text-xs space-y-1 text-gray-700 bg-white rounded px-3 py-2 border border-gray-200">
                    <div>📥 <strong>{acct?.name || 'Account'}</strong> credited <strong>₹{parseFloat(settledAmount).toLocaleString('en-IN')}</strong> on <strong>{settlementDate || entryDate}</strong></div>
                    <div>🧾 Auto-creates <strong>BANK CHARGES expense ₹{commission.toLocaleString('en-IN')}</strong> on same date ({selectedType.scope} scope)</div>
                  </div>
                );
              })()}
            </div>
          )}

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

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div>
            {isEdit && !isLinked && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50">
              {isLinked ? 'Close' : 'Cancel'}
            </button>
            {!isLinked && (
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50">
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Entry'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
