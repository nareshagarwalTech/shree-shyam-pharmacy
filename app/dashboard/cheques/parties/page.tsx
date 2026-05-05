'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, ChequePartySummary, PartyCategory } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import useEscapeKey from '@/lib/useEscapeKey';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  ArrowLeft,
  X,
  Loader2,
  CheckCircle,
} from 'lucide-react';

type CategoryFilter = 'all' | PartyCategory;

interface PartyDraft {
  id?: string;
  name: string;
  short_name: string;
  category: PartyCategory;
  contact_phone: string;
  notes: string;
  is_active: boolean;
}

const CAT_OPTIONS: { value: PartyCategory; label: string }[] = [
  { value: 'pharma',  label: 'Pharma'  },
  { value: 'staff',   label: 'Staff'   },
  { value: 'service', label: 'Service' },
  { value: 'utility', label: 'Utility' },
  { value: 'other',   label: 'Other'   },
];

const CAT_COLOR: Record<PartyCategory, string> = {
  pharma:  'bg-emerald-100 text-emerald-700',
  staff:   'bg-blue-100 text-blue-700',
  service: 'bg-purple-100 text-purple-700',
  utility: 'bg-amber-100 text-amber-700',
  other:   'bg-gray-100 text-gray-600',
};

export default function PartiesPage() {
  const [rows, setRows]     = useState<ChequePartySummary[]>([]);
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCat] = useState<CategoryFilter>('all');
  const [editing, setEditing] = useState<PartyDraft | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('cheque_party_summary')
      .select('*')
      .order('party_name');
    if (error) setToast({ message: error.message, type: 'error' });
    else setRows((data || []) as ChequePartySummary[]);
    setLoad(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let out = rows;
    if (catFilter !== 'all') out = out.filter((r) => r.category === catFilter);
    if (search) {
      const q = search.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.party_name.toLowerCase().includes(q) ||
          (r.short_name && r.short_name.toLowerCase().includes(q)) ||
          (r.contact_phone && r.contact_phone.includes(q.replace(/\D/g, '')) && /\d/.test(q)),
      );
    }
    return out;
  }, [rows, search, catFilter]);

  const totals = useMemo(() => ({
    parties: filtered.length,
    issued: filtered.reduce((s, r) => s + Number(r.total_issued || 0), 0),
    pending: filtered.reduce((s, r) => s + Number(r.pending_amount || 0), 0),
    cheques: filtered.reduce((s, r) => s + Number(r.total_cheques || 0), 0),
  }), [filtered]);

  const startNew = () => setEditing({
    name: '', short_name: '', category: 'pharma', contact_phone: '', notes: '', is_active: true,
  });

  const startEdit = (r: ChequePartySummary) => setEditing({
    id: r.party_id,
    name: r.party_name,
    short_name: r.short_name ?? '',
    category: r.category,
    contact_phone: r.contact_phone ?? '',
    notes: '',
    is_active: r.is_active,
  });

  const remove = async (r: ChequePartySummary) => {
    if (Number(r.total_cheques) > 0) {
      return setToast({
        message: `Cannot delete — ${r.total_cheques} cheque(s) reference this party. Mark inactive instead.`,
        type: 'error',
      });
    }
    if (!confirm(`Delete party "${r.party_name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('parties').delete().eq('id', r.party_id);
    if (error) return setToast({ message: error.message, type: 'error' });
    setToast({ message: 'Party deleted.', type: 'success' });
    fetchAll();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <Link
              href="/dashboard/cheques"
              className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-1"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Cheques
            </Link>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-600" />
              Party Master
            </h1>
            <p className="text-sm text-gray-500">Vendors, staff, and services we issue cheques to.</p>
          </div>
          <button
            onClick={startNew}
            className="shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Party</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
          <Tile label="Parties"  value={String(totals.parties)} color="indigo" />
          <Tile label="Cheques"  value={String(totals.cheques)} color="blue" />
          <Tile label="Issued"   value={`₹${totals.issued.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="emerald" />
          <Tile label="Pending"  value={`₹${totals.pending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="amber" />
        </div>

        {/* Filter */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <select
              value={catFilter}
              onChange={(e) => setCat(e.target.value as CategoryFilter)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm sm:w-44"
            >
              <option value="all">All categories</option>
              {CAT_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No parties match.</p>
            {rows.length === 0 && (
              <button
                onClick={startNew}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
              >
                <Plus className="w-4 h-4" /> Add your first party
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((r) => (
                <div key={r.party_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        {r.party_name}
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${CAT_COLOR[r.category]}`}>
                          {r.category}
                        </span>
                        {!r.is_active && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase">
                            inactive
                          </span>
                        )}
                      </div>
                      {r.contact_phone && (
                        <div className="text-xs text-gray-500 mt-0.5">📞 {r.contact_phone}</div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
                        <span>{r.total_cheques} cheque{Number(r.total_cheques) === 1 ? '' : 's'}</span>
                        {Number(r.total_issued) > 0 && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span>₹{Number(r.total_issued).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </>
                        )}
                        {Number(r.pending_amount) > 0 && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-amber-700">Pending ₹{Number(r.pending_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(r)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>Name</Th>
                    <Th>Category</Th>
                    <Th>Phone</Th>
                    <Th align="right">Cheques</Th>
                    <Th align="right">Issued</Th>
                    <Th align="right">Pending</Th>
                    <Th>Last cheque</Th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => (
                    <tr key={r.party_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{r.party_name}</div>
                        {r.short_name && <div className="text-xs text-gray-500">{r.short_name}</div>}
                        {!r.is_active && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase mt-1">
                            inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${CAT_COLOR[r.category]}`}>
                          {r.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{r.contact_phone || '—'}</td>
                      <td className="px-4 py-2.5 text-right">{r.total_cheques}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        ₹{Number(r.total_issued).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${Number(r.pending_amount) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        ₹{Number(r.pending_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {r.last_cheque_date ? formatDate(r.last_cheque_date) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(r)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {editing && (
        <PartyEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setToast({ message: 'Party saved.', type: 'success' });
            fetchAll();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function PartyEditor({
  draft, onClose, onSaved, onError,
}: {
  draft: PartyDraft;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [d, setD] = useState<PartyDraft>(draft);
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose, !saving);

  const save = async () => {
    if (!d.name.trim()) return onError('Name is required');
    setSaving(true);
    const payload = {
      name: d.name.trim(),
      short_name: d.short_name.trim() || null,
      category: d.category,
      contact_phone: d.contact_phone.trim() || null,
      notes: d.notes.trim() || null,
      is_active: d.is_active,
    };
    const { error } = d.id
      ? await supabase.from('parties').update(payload).eq('id', d.id)
      : await supabase.from('parties').insert(payload);
    setSaving(false);
    if (error) {
      onError(/duplicate|unique/i.test(error.message)
        ? 'A party with that name already exists.'
        : error.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md modal-content max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-display font-bold text-gray-900 text-lg">{d.id ? 'Edit Party' : 'New Party'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1 min-h-0">
          <Field label="Name *">
            <input
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              className={inputCls(!d.name.trim())}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short name" hint="Used in narrow tables">
              <input
                value={d.short_name}
                onChange={(e) => setD({ ...d, short_name: e.target.value })}
                className={inputCls(false)}
              />
            </Field>
            <Field label="Category">
              <select
                value={d.category}
                onChange={(e) => setD({ ...d, category: e.target.value as PartyCategory })}
                className={inputCls(false)}
              >
                {CAT_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Contact phone">
            <input
              value={d.contact_phone}
              onChange={(e) => setD({ ...d, contact_phone: e.target.value })}
              maxLength={15}
              className={inputCls(false)}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={d.notes}
              onChange={(e) => setD({ ...d, notes: e.target.value })}
              rows={2}
              className={`${inputCls(false)} resize-none`}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={d.is_active}
              onChange={(e) => setD({ ...d, is_active: e.target.checked })}
            />
            Active (uncheck to hide from cheque dropdown without deleting)
          </label>
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

function Tile({ label, value, color }: {
  label: string; value: string; color: 'indigo' | 'blue' | 'emerald' | 'amber';
}) {
  const map: Record<string, string> = {
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${map[color]}`}>
      <div className="text-[11px] sm:text-xs font-medium opacity-70 leading-tight">{label}</div>
      <div className="text-xl sm:text-2xl font-display font-bold mt-1 break-words">{value}</div>
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

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>{children}</th>
  );
}
