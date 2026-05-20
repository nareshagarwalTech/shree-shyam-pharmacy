'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Account,
  AccountOpeningBalance,
  DailyBookAccountBalance,
} from '@/lib/supabase';
import {
  ArrowLeft,
  Wallet,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Save,
  X,
  Check,
  RefreshCw,
} from 'lucide-react';
import useEscapeKey from '@/lib/useEscapeKey';

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}
function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function firstOfThisMonthISO() {
  const d = new Date();
  d.setDate(1);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

interface OpeningModalState {
  open: boolean;
  accountId: string | null;
  accountName: string;
  existing: AccountOpeningBalance | null;
}

export default function AccountsAdminPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<DailyBookAccountBalance[]>([]);
  const [openings, setOpenings] = useState<AccountOpeningBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInception, setEditingInception] = useState<string | null>(null);
  const [inceptionDraft, setInceptionDraft] = useState('');
  const [modal, setModal] = useState<OpeningModalState>({
    open: false, accountId: null, accountName: '', existing: null,
  });
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b, o] = await Promise.all([
      supabase.from('accounts').select('*').order('sort_order'),
      supabase.from('daily_book_account_balances').select('*').order('sort_order'),
      supabase.from('account_opening_balances').select('*').order('effective_date', { ascending: false }),
    ]);
    if (a.data) setAccounts(a.data as Account[]);
    if (b.data) setBalances(b.data as DailyBookAccountBalance[]);
    if (o.data) setOpenings(o.data as AccountOpeningBalance[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const balanceByAccount = useMemo(() => new Map(balances.map((b) => [b.account_id, b])), [balances]);
  const openingsByAccount = useMemo(() => {
    const m = new Map<string, AccountOpeningBalance[]>();
    for (const o of openings) {
      const arr = m.get(o.account_id) ?? [];
      arr.push(o);
      m.set(o.account_id, arr);
    }
    return m;
  }, [openings]);

  const startEditInception = (a: Account) => {
    setEditingInception(a.id);
    setInceptionDraft(String(a.opening_balance ?? 0));
  };
  const cancelEditInception = () => {
    setEditingInception(null);
    setInceptionDraft('');
  };
  const saveInception = async (accountId: string) => {
    const v = parseFloat(inceptionDraft);
    if (!Number.isFinite(v)) return;
    const { error } = await supabase.from('accounts').update({ opening_balance: v }).eq('id', accountId);
    if (error) { setToast('Failed: ' + error.message); return; }
    setEditingInception(null);
    setToast('Inception balance updated');
    setTimeout(() => setToast(null), 2500);
    load();
  };

  const openMonthlyModal = (account: Account, existing: AccountOpeningBalance | null = null) => {
    setModal({ open: true, accountId: account.id, accountName: account.name, existing });
  };
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  const deleteOpening = async (id: string) => {
    if (!confirm('Delete this monthly opening?')) return;
    const { error } = await supabase.from('account_opening_balances').delete().eq('id', id);
    if (error) { setToast('Failed: ' + error.message); return; }
    setToast('Deleted');
    setTimeout(() => setToast(null), 2000);
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-purple-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900">Accounts &amp; Opening Balances</h1>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-900">
          <strong>Two kinds of opening balance:</strong>
          <ul className="mt-1 ml-4 list-disc text-xs space-y-0.5">
            <li><strong>Inception</strong> — the all-time starting balance, set when you began using the system. Edit it inline below.</li>
            <li><strong>Monthly opening</strong> — overrides the baseline for a specific date onward (typically 1st of a month). Useful for cleaner monthly reports or correcting drift. The latest monthly opening wins.</li>
          </ul>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : accounts.map((a) => {
          const bal = balanceByAccount.get(a.id);
          const accOpenings = openingsByAccount.get(a.id) ?? [];
          const Icon = a.kind === 'cash' ? Wallet : Landmark;
          const iconClass = a.kind === 'cash' ? 'text-amber-600 bg-amber-100' : 'text-purple-600 bg-purple-100';

          return (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Account header */}
              <div className="p-5 border-b border-gray-100 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-lg">{a.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{a.kind} account</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Current Balance</div>
                  <div className={`text-2xl font-bold ${bal && Number(bal.current_balance) < 0 ? 'text-rose-700' : 'text-gray-900'}`}>
                    ₹{fmtINR(Number(bal?.current_balance ?? 0))}
                  </div>
                </div>
              </div>

              {/* Inception opening (inline edit) */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Inception Opening</div>
                  <div className="text-xs text-gray-400">All-time starting balance, never recomputed</div>
                </div>
                {editingInception === a.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={inceptionDraft}
                      onChange={(e) => setInceptionDraft(e.target.value)}
                      autoFocus
                      className="w-32 px-3 py-1.5 text-right border border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                    />
                    <button onClick={() => saveInception(a.id)} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={cancelEditInception} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-800 tabular-nums">₹{fmtINR(Number(a.opening_balance))}</span>
                    <button onClick={() => startEditInception(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Monthly openings */}
              <div className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Monthly Openings</div>
                    <div className="text-xs text-gray-400">
                      {accOpenings.length === 0 ? 'No monthly overrides set' : `${accOpenings.length} entries — most recent wins`}
                    </div>
                  </div>
                  <button
                    onClick={() => openMonthlyModal(a)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Monthly Opening
                  </button>
                </div>

                {accOpenings.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-600 text-xs">Effective Date</th>
                          <th className="text-right px-3 py-1.5 font-medium text-gray-600 text-xs">Amount</th>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-600 text-xs">Notes</th>
                          <th className="w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {accOpenings.map((o, idx) => (
                          <tr key={o.id} className={`border-t border-gray-100 ${idx === 0 ? 'bg-emerald-50/50' : ''}`}>
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {o.effective_date}
                              {idx === 0 && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">ACTIVE</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">₹{fmtINR(Number(o.amount))}</td>
                            <td className="px-3 py-2 text-gray-500 text-xs">{o.notes || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => openMonthlyModal(a, o)} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteOpening(o.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded hover:bg-rose-50" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Computed breakdown */}
              {bal && (
                <div className="bg-gray-50 px-5 py-3 text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="font-medium text-gray-500">Baseline</div>
                    <div className="text-gray-800 tabular-nums">
                      {bal.monthly_opening_date
                        ? `₹${fmtINR(Number(bal.monthly_opening_amount))} from ${bal.monthly_opening_date}`
                        : `₹${fmtINR(Number(bal.opening_balance))} (inception)`}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-500">Movements since</div>
                    <div className={`tabular-nums ${Number(bal.movements_since_baseline) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {Number(bal.movements_since_baseline) >= 0 ? '+' : ''}₹{fmtINR(Number(bal.movements_since_baseline))}
                    </div>
                  </div>
                  <div className="sm:col-span-2 sm:text-right">
                    <div className="font-medium text-gray-500">Lifetime net (all entries)</div>
                    <div className="text-gray-800 tabular-nums">{Number(bal.lifetime_net) >= 0 ? '+' : ''}₹{fmtINR(Number(bal.lifetime_net))}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      <MonthlyOpeningModal
        state={modal}
        onClose={closeModal}
        onSaved={() => { closeModal(); load(); setToast('Monthly opening saved'); setTimeout(() => setToast(null), 2500); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal for adding / editing a monthly opening
// ---------------------------------------------------------------------------
function MonthlyOpeningModal({
  state, onClose, onSaved,
}: {
  state: OpeningModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscapeKey(onClose, state.open);
  const isEdit = !!state.existing;
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.open) return;
    if (state.existing) {
      setDate(state.existing.effective_date);
      setAmount(String(state.existing.amount));
      setNotes(state.existing.notes ?? '');
    } else {
      setDate(firstOfThisMonthISO());
      setAmount('');
      setNotes('');
    }
    setError(null);
  }, [state.open, state.existing]);

  if (!state.open) return null;

  const save = async () => {
    setError(null);
    if (!state.accountId) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt)) { setError('Enter a valid amount.'); return; }
    if (!date) { setError('Pick an effective date.'); return; }

    setSaving(true);
    const payload = {
      account_id: state.accountId,
      effective_date: date,
      amount: amt,
      notes: notes.trim() || null,
    };
    const op = isEdit
      ? supabase.from('account_opening_balances').update(payload).eq('id', state.existing!.id)
      : supabase.from('account_opening_balances').upsert(payload, { onConflict: 'account_id,effective_date' });
    const { error: dbErr } = await op;
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Edit Monthly Opening' : 'Add Monthly Opening'}
            </h2>
            <div className="text-xs text-gray-500">{state.accountName}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Effective Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            />
            <div className="text-xs text-gray-400 mt-1">
              Balance &quot;as of start of this day&quot;. Becomes the baseline for the ledger from this date onward (until a later opening overrides it).
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Opening Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100 text-lg font-medium"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. After bank reconciliation"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
            />
          </div>
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Opening'}
          </button>
        </div>
      </div>
    </div>
  );
}
