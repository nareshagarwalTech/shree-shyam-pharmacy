'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, Bank } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import useEscapeKey from '@/lib/useEscapeKey';
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  X,
  Loader2,
  CheckCircle,
  Banknote,
  Star,
} from 'lucide-react';

interface BankDraft {
  id?: string;
  name: string;
  short_name: string;
  account_no: string;
  is_default: boolean;
  is_active: boolean;
  notes: string;
}

export default function BanksPage() {
  const [rows, setRows]   = useState<Bank[]>([]);
  const [loading, setL]   = useState(true);
  const [editing, setE]   = useState<BankDraft | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.from('banks').select('*').order('is_default', { ascending: false }).order('name');
    if (error) setToast({ message: error.message, type: 'error' });
    else setRows((data || []) as Bank[]);
    setL(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const startNew = () => setE({
    name: '', short_name: '', account_no: '', is_default: rows.length === 0, is_active: true, notes: '',
  });
  const startEdit = (b: Bank) => setE({
    id: b.id,
    name: b.name,
    short_name: b.short_name ?? '',
    account_no: b.account_no ?? '',
    is_default: b.is_default,
    is_active: b.is_active,
    notes: b.notes ?? '',
  });

  const remove = async (b: Bank) => {
    if (b.is_default && rows.length > 1) {
      return setToast({ message: 'Set another bank as default before deleting this one.', type: 'error' });
    }
    if (!confirm(`Delete bank "${b.name}"? Cheques referencing it will keep the cheque-no but lose the bank label.`)) return;
    const { error } = await supabase.from('banks').delete().eq('id', b.id);
    if (error) return setToast({ message: error.message, type: 'error' });
    setToast({ message: 'Bank deleted.', type: 'success' });
    fetchAll();
  };

  const setDefault = async (b: Bank) => {
    if (b.is_default) return;
    // Clear all defaults, then set this one. The unique partial index allows
    // us to do this in two steps.
    const { error: e1 } = await supabase.from('banks').update({ is_default: false }).eq('is_default', true);
    if (e1) return setToast({ message: e1.message, type: 'error' });
    const { error: e2 } = await supabase.from('banks').update({ is_default: true }).eq('id', b.id);
    if (e2) return setToast({ message: e2.message, type: 'error' });
    setToast({ message: `${b.name} is now the default bank.`, type: 'success' });
    fetchAll();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <Link
              href="/dashboard/cheques"
              className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Cheques
            </Link>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Banknote className="w-6 h-6 text-emerald-600" />
              Banks
            </h1>
            <p className="text-sm text-gray-500">Bank accounts the pharmacy issues cheques from.</p>
          </div>
          <button
            onClick={startNew}
            className="shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Bank</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Banknote className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No banks yet.</p>
            <button
              onClick={startNew}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" /> Add your first bank
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 flex items-center gap-3">
                <button
                  onClick={() => setDefault(b)}
                  title={b.is_default ? 'Default bank' : 'Set as default'}
                  className={`p-2 rounded-lg ${b.is_default ? 'bg-amber-50 text-amber-600' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'}`}
                >
                  <Star className={`w-5 h-5 ${b.is_default ? 'fill-amber-500' : ''}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                    {b.name}
                    {b.is_default && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 uppercase">
                        default
                      </span>
                    )}
                    {!b.is_active && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                    {b.short_name && <span>{b.short_name}</span>}
                    {b.account_no && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="font-mono">A/c {b.account_no}</span>
                      </>
                    )}
                  </div>
                  {b.notes && <div className="text-xs text-gray-500 mt-1">{b.notes}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(b)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(b)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <BankEditor
          draft={editing}
          existing={rows}
          onClose={() => setE(null)}
          onSaved={() => { setE(null); setToast({ message: 'Bank saved.', type: 'success' }); fetchAll(); }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function BankEditor({ draft, existing, onClose, onSaved, onError }: {
  draft: BankDraft;
  existing: Bank[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [d, setD] = useState<BankDraft>(draft);
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose, !saving);

  const save = async () => {
    if (!d.name.trim()) return onError('Name is required');
    setSaving(true);
    // If marking default, clear any other default first (single-default invariant).
    if (d.is_default) {
      const otherDefault = existing.find((b) => b.is_default && b.id !== d.id);
      if (otherDefault) {
        await supabase.from('banks').update({ is_default: false }).eq('id', otherDefault.id);
      }
    }
    const payload = {
      name: d.name.trim(),
      short_name: d.short_name.trim() || null,
      account_no: d.account_no.trim() || null,
      is_default: d.is_default,
      is_active: d.is_active,
      notes: d.notes.trim() || null,
    };
    const { error } = d.id
      ? await supabase.from('banks').update(payload).eq('id', d.id)
      : await supabase.from('banks').insert(payload);
    setSaving(false);
    if (error) {
      onError(/duplicate|unique/i.test(error.message) ? 'A bank with that name already exists.' : error.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md modal-content max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-display font-bold text-gray-900 text-lg">{d.id ? 'Edit Bank' : 'New Bank'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <Field label="Bank name *">
            <input
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="e.g. HDFC Bank — Current A/c"
              className={inputCls(!d.name.trim())}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short name" hint="For tight tables">
              <input
                value={d.short_name}
                onChange={(e) => setD({ ...d, short_name: e.target.value })}
                placeholder="HDFC"
                className={inputCls(false)}
              />
            </Field>
            <Field label="A/c number" hint="Last 4 digits is fine">
              <input
                value={d.account_no}
                onChange={(e) => setD({ ...d, account_no: e.target.value })}
                placeholder="•••• 1234"
                className={`${inputCls(false)} font-mono`}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={d.notes}
              onChange={(e) => setD({ ...d, notes: e.target.value })}
              rows={2}
              className={`${inputCls(false)} resize-none`}
            />
          </Field>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={d.is_default}
                onChange={(e) => setD({ ...d, is_default: e.target.checked })}
              />
              Use as default bank for new cheques
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={d.is_active}
                onChange={(e) => setD({ ...d, is_active: e.target.checked })}
              />
              Active (uncheck to hide from new-cheque dropdown)
            </label>
          </div>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-2xl shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
