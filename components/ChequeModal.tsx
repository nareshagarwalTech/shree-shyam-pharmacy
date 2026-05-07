'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, Cheque, Bank, Party, ChequeStatus } from '@/lib/supabase';
import { todayISO } from '@/lib/utils';
import useEscapeKey from '@/lib/useEscapeKey';
import {
  X,
  Loader2,
  IndianRupee,
  CheckCircle,
  Trash2,
  AlertCircle,
} from 'lucide-react';

interface Props {
  /** Existing cheque to edit, or null/undefined to add a new one */
  cheque?: Cheque | null;
  parties: Party[];
  banks: Bank[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}

const STATUS_OPTIONS: { value: ChequeStatus; label: string }[] = [
  { value: 'pending',   label: 'Pending'   },
  { value: 'deposited', label: 'Deposited' },
  { value: 'cleared',   label: 'Cleared'   },
  { value: 'bounced',   label: 'Bounced'   },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ChequeModal({ cheque, parties, banks, onClose, onSaved, onError }: Props) {
  const isEdit = !!cheque?.id;

  const defaultBankId = useMemo(
    () => banks.find((b) => b.is_default)?.id ?? banks[0]?.id ?? null,
    [banks],
  );

  const [partyId, setPartyId]         = useState<string | null>(cheque?.party_id ?? null);
  const [bankId, setBankId]           = useState<string | null>(cheque?.bank_id ?? defaultBankId);
  const [isOnline, setIsOnline]       = useState<boolean>(cheque?.is_online ?? false);
  const [chequeNo, setChequeNo]       = useState<string>(cheque?.cheque_no ?? '');
  const [onlineRef, setOnlineRef]     = useState<string>(cheque?.online_ref ?? '');
  const [amount, setAmount]           = useState<number>(Number(cheque?.amount ?? 0));
  const [issueDate, setIssueDate]     = useState<string>(cheque?.issue_date ?? todayISO());
  const [depositDate, setDepositDate] = useState<string>(cheque?.deposit_date ?? '');
  const [status, setStatus]           = useState<ChequeStatus>(cheque?.status ?? 'pending');
  const [remarks, setRemarks]         = useState<string>(cheque?.remarks ?? '');
  const [ledgerNo, setLedgerNo]       = useState<string>(cheque?.ledger_no ?? '');
  const [periodFrom, setPeriodFrom]   = useState<string>(cheque?.period_from ?? '');
  const [periodTo, setPeriodTo]       = useState<string>(cheque?.period_to ?? '');

  // deposit_date is mandatory once the cheque has moved past 'pending'
  const depositRequired = status === 'deposited' || status === 'cleared' || status === 'bounced';

  const [saving, setSaving] = useState(false);
  const [partySearch, setPartySearch] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEscapeKey(onClose, !saving);

  // Filtered party dropdown
  const filteredParties = useMemo(() => {
    const q = partySearch.toLowerCase().trim();
    const sorted = [...parties].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(q));
  }, [parties, partySearch]);

  const selectedParty = useMemo(
    () => parties.find((p) => p.id === partyId),
    [parties, partyId],
  );

  const validate = (): string | null => {
    if (!partyId) return 'Please select a party';
    if (amount <= 0) return 'Amount must be greater than 0';
    if (!issueDate) return 'Cheque date is required';
    if (!isOnline && !chequeNo.trim()) return 'Cheque number is required (or toggle Online)';
    if (depositRequired && !depositDate) {
      return `Deposit date is required when status is "${status}"`;
    }
    if (periodFrom && periodTo && periodTo < periodFrom) {
      return 'Invoice period: "to" date must be on or after "from" date';
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return onError(err);

    setSaving(true);
    const payload = {
      party_id:       partyId,
      bank_id:        bankId,
      is_online:      isOnline,
      cheque_no:      isOnline ? null : chequeNo.trim(),
      online_ref:     isOnline ? (onlineRef.trim() || null) : null,
      amount,
      issue_date:     issueDate,
      deposit_date:   depositDate || null,
      status,
      remarks:        remarks.trim() || null,
      ledger_no:      ledgerNo.trim() || null,
      period_from:    periodFrom || null,
      period_to:      periodTo || null,
    };

    if (isEdit && cheque) {
      const { error } = await supabase.from('cheques').update(payload).eq('id', cheque.id);
      setSaving(false);
      if (error) return onError(error.message);
    } else {
      const { error } = await supabase.from('cheques').insert(payload);
      setSaving(false);
      if (error) return onError(error.message);
    }
    onSaved();
  };

  const del = async () => {
    if (!isEdit || !cheque) return;
    if (!confirm(`Delete this ${isOnline ? 'online' : 'cheque'} entry permanently?`)) return;
    setSaving(true);
    const { error } = await supabase.from('cheques').delete().eq('id', cheque.id);
    setSaving(false);
    if (error) return onError(error.message);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl modal-content max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-display font-bold text-gray-900 text-base sm:text-lg">
              {isEdit ? 'Edit Cheque' : 'New Cheque'}
            </h3>
            {selectedParty && (
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
                {selectedParty.name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-4 sm:px-6 py-4 space-y-4">
          {/* Online toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsOnline(false)}
              className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                !isOnline ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600'
              }`}
            >
              📝 Cheque
            </button>
            <button
              type="button"
              onClick={() => setIsOnline(true)}
              className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium ${
                isOnline ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-600'
              }`}
            >
              💳 Online
            </button>
          </div>

          {/* Party dropdown */}
          <Field label="Party *">
            <input
              type="text"
              value={partySearch || selectedParty?.name || ''}
              onChange={(e) => { setPartySearch(e.target.value); setPartyId(null); }}
              onFocus={() => setPartySearch(selectedParty?.name ?? '')}
              placeholder="Type to search..."
              list="party-list"
              className={inputCls(!partyId)}
            />
            <datalist id="party-list">
              {filteredParties.map((p) => (
                <option key={p.id} value={p.name}>{p.category}</option>
              ))}
            </datalist>
            {partySearch && (
              <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                {filteredParties.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setPartyId(p.id); setPartySearch(''); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-emerald-50"
                  >
                    {p.name}
                    <span className="text-xs text-gray-400 ml-2">{p.category}</span>
                  </button>
                ))}
                {filteredParties.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No matches. <a href="/dashboard/cheques/parties" className="text-emerald-600 hover:underline">Add a new party</a> first.
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* Cheque no / online ref + bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isOnline ? (
              <Field label="Cheque No. *">
                <input
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  placeholder="e.g. 243503"
                  className={inputCls(!chequeNo.trim())}
                />
              </Field>
            ) : (
              <Field label="Reference / UTR (optional)">
                <input
                  value={onlineRef}
                  onChange={(e) => setOnlineRef(e.target.value)}
                  placeholder="UPI ref / NEFT UTR"
                  className={inputCls(false)}
                />
              </Field>
            )}
            <Field label="Bank">
              <select
                value={bankId ?? ''}
                onChange={(e) => setBankId(e.target.value || null)}
                className={inputCls(false)}
              >
                <option value="">— None —</option>
                {banks.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Amount */}
          <Field label="Amount (₹) *">
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className={`${inputCls(amount <= 0)} pl-9 font-display font-bold`}
              />
            </div>
          </Field>

          {/* Dates — only two: Cheque Date + Deposit Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Cheque date *"
              hint={isOnline ? 'Date of the online transfer' : 'Date written on the cheque'}
            >
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={inputCls(!issueDate)}
              />
            </Field>
            <Field
              label={depositRequired ? 'Deposit date *' : 'Deposit date'}
              hint={
                depositRequired
                  ? 'Required for this status — when the cheque hit the bank'
                  : 'Optional — when you plan to bank it'
              }
            >
              <input
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
                className={inputCls(depositRequired && !depositDate)}
              />
            </Field>
          </div>

          {/* Status */}
          <Field label="Status">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStatus(opt.value);
                    // If moving past pending and deposit date is empty, prefill with today
                    if (
                      (opt.value === 'deposited' || opt.value === 'cleared' || opt.value === 'bounced') &&
                      !depositDate
                    ) {
                      setDepositDate(todayISO());
                    }
                  }}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium ${
                    status === opt.value ? statusActive[opt.value] : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Ledger No */}
          <Field label="Ledger No" hint="Accounting ledger reference (optional)">
            <input
              value={ledgerNo}
              onChange={(e) => setLedgerNo(e.target.value)}
              placeholder="e.g. LED/2026/04/123"
              className={`${inputCls(false)} font-mono text-sm`}
            />
          </Field>

          {/* Invoice period covered by this cheque */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Invoice period paid by this cheque
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="From" hint="Start of invoice period">
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
              <Field label="To" hint="End of invoice period">
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className={inputCls(!!(periodFrom && periodTo && periodTo < periodFrom))}
                />
              </Field>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              e.g. invoices from 1 March to 31 March settled by this single cheque. Both optional.
            </p>
          </div>

          {/* Remarks */}
          <Field label="Remarks">
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Optional notes — e.g. clearance batch, replacement of bounced cheque, etc."
              className={`${inputCls(false)} resize-none`}
            />
          </Field>

          <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {isOnline
                ? 'Online transfers are tracked the same way as cheques but skip the deposit step.'
                : 'Set the deposit date for the day you plan to bank the cheque. Mark it Cleared once the bank confirms settlement.'}
            </span>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-2xl shrink-0 safe-pb">
          {isEdit ? (
            <button
              onClick={del}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save cheque'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const statusActive: Record<ChequeStatus, string> = {
  pending:   'border-amber-500 bg-amber-50 text-amber-700',
  deposited: 'border-blue-500 bg-blue-50 text-blue-700',
  cleared:   'border-emerald-500 bg-emerald-50 text-emerald-700',
  bounced:   'border-red-500 bg-red-50 text-red-700',
  cancelled: 'border-gray-500 bg-gray-100 text-gray-700',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{hint}</p>}
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full px-3 py-2 rounded-lg border ${invalid ? 'border-red-300' : 'border-gray-200'} bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm`;
}
