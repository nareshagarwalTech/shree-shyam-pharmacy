'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, PaymentMode } from '@/lib/supabase';
import { ArrowLeft, Plus, Pencil, Trash2, X, CreditCard, RefreshCw, Save } from 'lucide-react';
import useEscapeKey from '@/lib/useEscapeKey';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

export default function ModesAdminPage() {
  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; existing: PaymentMode | null }>({ open: false, existing: null });
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('payment_modes').select('*').order('sort_order');
    setModes((data ?? []) as PaymentMode[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (m: PaymentMode) => {
    if (!confirm(`Delete "${m.name}"?\n\nNote: any existing entries using this mode will be orphaned (not deleted).`)) return;
    const { error } = await supabase.from('payment_modes').delete().eq('id', m.id);
    if (error) {
      setToast(`Could not delete: ${error.message}. Try toggling Active off instead.`);
      setTimeout(() => setToast(null), 5000);
      return;
    }
    setToast('Deleted');
    setTimeout(() => setToast(null), 2000);
    load();
  };
  const toggleActive = async (m: PaymentMode) => {
    await supabase.from('payment_modes').update({ is_active: !m.is_active }).eq('id', m.id);
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50/30 via-white to-teal-50/30">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-cyan-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-cyan-600" /> Payment Modes
            </h1>
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-xs text-cyan-900">
          Modes describe <strong>how money moved</strong> (Cash, UPI, Card, etc). Mark <strong>has commission</strong> on modes
          where a settlement delay + bank fee can apply (POS Card, sometimes QR/UPI). Income entries using a commissioned mode
          unlock the Settled Amount + Settlement Date fields and auto-create a linked BANK CHARGES expense for the difference.
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">{modes.length} mode{modes.length === 1 ? '' : 's'}</div>
            <div className="text-xs text-gray-500">{modes.filter((m) => m.is_active).length} active</div>
          </div>
          <button
            onClick={() => setModal({ open: true, existing: null })}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Mode
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : modes.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No payment modes yet.
              <div className="mt-2">
                <button onClick={() => setModal({ open: true, existing: null })}
                  className="text-cyan-700 hover:text-cyan-800 underline text-sm">Add the first one</button>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700 w-20">Order</th>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700 hidden sm:table-cell">Slug</th>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700">Commission</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700 w-28">Status</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {modes.map((m) => (
                  <tr key={m.id} className={`border-b border-gray-100 last:border-0 ${m.is_active ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-2 text-gray-500">{m.sort_order}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-2 text-xs text-gray-400 font-mono hidden sm:table-cell">{m.slug}</td>
                    <td className="px-4 py-2">
                      {m.has_commission ? (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">yes</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => toggleActive(m)}
                        className={`text-xs px-2 py-1 rounded ${m.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setModal({ open: true, existing: m })}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(m)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 rounded hover:bg-rose-50" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      <ModeModal
        open={modal.open}
        existing={modal.existing}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={() => { setModal((m) => ({ ...m, open: false })); load(); setToast('Saved'); setTimeout(() => setToast(null), 2000); }}
      />
    </div>
  );
}

function ModeModal({
  open, existing, onClose, onSaved,
}: { open: boolean; existing: PaymentMode | null; onClose: () => void; onSaved: () => void }) {
  useEscapeKey(onClose, open);
  const isEdit = !!existing;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [hasCommission, setHasCommission] = useState(false);
  const [sortOrder, setSortOrder] = useState('100');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name); setSlug(existing.slug);
      setHasCommission(existing.has_commission);
      setSortOrder(String(existing.sort_order));
      setIsActive(existing.is_active);
    } else {
      setName(''); setSlug(''); setHasCommission(false);
      setSortOrder('100'); setIsActive(true);
    }
    setError(null);
  }, [open, existing]);

  useEffect(() => {
    if (!isEdit) setSlug(slugify(name));
  }, [name, isEdit]);

  if (!open) return null;

  const save = async () => {
    setError(null);
    if (!name.trim()) { setError('Name required.'); return; }
    if (!slug.trim()) { setError('Slug required.'); return; }
    const so = parseInt(sortOrder, 10);
    if (!Number.isFinite(so)) { setError('Sort order must be a number.'); return; }

    setSaving(true);
    const payload = {
      name: name.trim(), slug: slug.trim(),
      has_commission: hasCommission, sort_order: so, is_active: isActive,
    };
    const op = isEdit
      ? supabase.from('payment_modes').update(payload).eq('id', existing!.id)
      : supabase.from('payment_modes').insert(payload);
    const { error: dbErr } = await op;
    setSaving(false);
    if (dbErr) {
      setError(dbErr.message.includes('duplicate')
        ? `A mode with slug "${slug}" already exists.`
        : dbErr.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Payment Mode' : 'Add Payment Mode'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amazon Pay"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Slug <span className="text-xs text-gray-400 font-normal ml-2">internal key, unique</span>
            </label>
            <input type="text" value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 font-mono text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <div className="flex items-center h-10 gap-2">
                <button type="button" onClick={() => setIsActive(true)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border ${isActive ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-medium' : 'border-gray-200 text-gray-600'}`}>
                  Active
                </button>
                <button type="button" onClick={() => setIsActive(false)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border ${!isActive ? 'bg-gray-200 border-gray-300 text-gray-700 font-medium' : 'border-gray-200 text-gray-600'}`}>
                  Inactive
                </button>
              </div>
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={hasCommission} onChange={(e) => setHasCommission(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
            <div>
              <div className="text-sm font-medium text-gray-700">Has commission / settlement delay</div>
              <div className="text-xs text-gray-500">
                Income entries on this mode will show the Settled Amount + Settlement Date fields,
                and auto-create a linked BANK CHARGES expense for the difference.
              </div>
            </div>
          </label>

          {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}
