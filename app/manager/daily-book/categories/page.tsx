'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Category,
  CategoryDirection,
  EntryScope,
} from '@/lib/supabase';
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Tags, RefreshCw, Save,
} from 'lucide-react';
import useEscapeKey from '@/lib/useEscapeKey';

const TABS: { key: string; label: string; direction: CategoryDirection; scope: EntryScope; accent: string; hint?: string }[] = [
  { key: 'biz_in',   label: 'Business Income',  direction: 'income',  scope: 'business', accent: 'border-emerald-500 text-emerald-700' },
  { key: 'biz_out',  label: 'Business Expense', direction: 'expense', scope: 'business', accent: 'border-rose-500 text-rose-700'       },
  { key: 'pers_in',  label: 'Personal Income',  direction: 'income',  scope: 'personal', accent: 'border-emerald-500 text-emerald-700' },
  { key: 'pers_out', label: 'Personal Expense', direction: 'expense', scope: 'personal', accent: 'border-rose-500 text-rose-700'       },
  { key: 'biz_fund', label: '📌 Business Funds', direction: 'shared', scope: 'business', accent: 'border-violet-500 text-violet-700', hint: 'Shared categories — used for both income & expense (e.g. fund pools)' },
  { key: 'pers_fund',label: '📌 Personal Funds',direction: 'shared', scope: 'personal', accent: 'border-violet-500 text-violet-700', hint: 'Shared categories — used for both income & expense (e.g. Chit Fund)' },
];

interface ModalState {
  open: boolean;
  direction: CategoryDirection;
  scope: EntryScope;
  existing: Category | null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

export default function CategoriesAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof TABS[number]>(TABS[0]);
  const [modal, setModal] = useState<ModalState>({ open: false, direction: 'income', scope: 'business', existing: null });
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('direction').order('scope').order('sort_order');
    setCategories((data ?? []) as Category[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tabCategories = useMemo(() =>
    categories
      .filter((c) => c.direction === tab.direction && c.scope === tab.scope)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [categories, tab]
  );

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of TABS) m[t.key] = 0;
    for (const c of categories) {
      const scopePrefix = c.scope === 'business' ? 'biz' : 'pers';
      let suffix: string;
      if (c.direction === 'income') suffix = 'in';
      else if (c.direction === 'expense') suffix = 'out';
      else suffix = 'fund';
      const key = `${scopePrefix}_${suffix}`;
      m[key] = (m[key] ?? 0) + 1;
    }
    return m;
  }, [categories]);

  const openModal = (existing: Category | null = null) =>
    setModal({ open: true, direction: tab.direction, scope: tab.scope, existing });
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  const handleDelete = async (c: Category) => {
    if (!confirm(`Delete "${c.name}"?\n\nNote: any existing entries using this category will be orphaned (not deleted).`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', c.id);
    if (error) {
      // FK constraint failure is the most likely cause
      setToast(`Could not delete: ${error.message}. Try toggling Active off instead.`);
      setTimeout(() => setToast(null), 5000);
      return;
    }
    setToast('Deleted');
    setTimeout(() => setToast(null), 2000);
    load();
  };

  const toggleActive = async (c: Category) => {
    await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id);
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/30 via-white to-orange-50/30">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-amber-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Tags className="w-5 h-5 text-amber-600" /> Categories
            </h1>
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 p-2 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[140px] px-3 py-2 text-sm font-medium rounded-lg transition ${
                tab.key === t.key
                  ? `bg-gray-50 border-b-2 ${t.accent}`
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-gray-400">({counts[t.key] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Hint banner for fund tabs */}
        {tab.direction === 'shared' && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900">
            📌 <strong>Shared categories</strong> can be tagged on BOTH income AND expense entries.
            Example: create &quot;Chit Fund A 2026&quot; here, then use it on the ₹50K receipt AND on
            each ₹10K withdrawal. The running balance is shown on the Daily Book dashboard&apos;s
            Fund Balances panel.
          </div>
        )}

        {/* Add button */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">{tab.label}</div>
            <div className="text-xs text-gray-500">{tabCategories.length} categor{tabCategories.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <button
            onClick={() => openModal()}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-lg shadow-sm ${
              tab.direction === 'shared' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <Plus className="w-4 h-4" /> Add {tab.direction === 'shared' ? 'Fund' : 'Category'}
          </button>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : tabCategories.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No categories in this bucket yet.
              <div className="mt-2">
                <button onClick={() => openModal()} className="text-amber-700 hover:text-amber-800 underline text-sm">
                  Add the first one
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700 w-20">Order</th>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700 hidden sm:table-cell">Slug</th>
                  <th className="text-left  px-4 py-2 font-semibold text-gray-700 hidden sm:table-cell">Flags</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700 w-28">Status</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {tabCategories.map((c) => (
                  <tr key={c.id} className={`border-b border-gray-100 last:border-0 ${c.is_active ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-2 text-gray-500">{c.sort_order}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2 text-xs text-gray-400 font-mono hidden sm:table-cell">{c.slug}</td>
                    <td className="px-4 py-2 text-xs hidden sm:table-cell">
                      {c.is_credit_note && (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">refund</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => toggleActive(c)}
                        className={`text-xs px-2 py-1 rounded ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => openModal(c)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-rose-600 rounded hover:bg-rose-50" title="Delete">
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

      <CategoryModal
        state={modal}
        onClose={closeModal}
        onSaved={() => { closeModal(); load(); setToast('Saved'); setTimeout(() => setToast(null), 2000); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function CategoryModal({
  state, onClose, onSaved,
}: { state: ModalState; onClose: () => void; onSaved: () => void }) {
  useEscapeKey(onClose, state.open);
  const isEdit = !!state.existing;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState('100');
  const [isCreditNote, setIsCreditNote] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    if (state.existing) {
      setName(state.existing.name);
      setSlug(state.existing.slug);
      setSortOrder(String(state.existing.sort_order));
      setIsCreditNote(state.existing.is_credit_note);
      setIsActive(state.existing.is_active);
    } else {
      setName(''); setSlug(''); setSortOrder('100');
      setIsCreditNote(false); setIsActive(true);
    }
    setError(null);
  }, [state]);

  // Auto-slug from name when adding new
  useEffect(() => {
    if (!isEdit) setSlug(slugify(name));
  }, [name, isEdit]);

  if (!state.open) return null;

  const save = async () => {
    setError(null);
    if (!name.trim()) { setError('Name required.'); return; }
    if (!slug.trim()) { setError('Slug required.'); return; }
    const so = parseInt(sortOrder, 10);
    if (!Number.isFinite(so)) { setError('Sort order must be a number.'); return; }

    setSaving(true);
    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      direction: state.direction,
      scope: state.scope,
      sort_order: so,
      is_credit_note: isCreditNote,
      is_active: isActive,
    };
    const op = isEdit
      ? supabase.from('categories').update(payload).eq('id', state.existing!.id)
      : supabase.from('categories').insert(payload);
    const { error: dbErr } = await op;
    setSaving(false);
    if (dbErr) {
      // 23505 = unique violation on (direction, scope, slug)
      setError(dbErr.message.includes('duplicate')
        ? `A category with slug "${slug}" already exists in this bucket. Pick a different slug.`
        : dbErr.message);
      return;
    }
    onSaved();
  };

  const scopeLabel = state.scope === 'business' ? 'Business' : 'Personal';
  const dirLabel   = state.direction === 'income'  ? 'Income'
                   : state.direction === 'expense' ? 'Expense'
                   : 'Shared (Fund)';
  const isShared   = state.direction === 'shared';
  const entityLabel = isShared ? 'Fund' : 'Category';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? `Edit ${entityLabel}` : `Add ${entityLabel}`}</h2>
            <div className="text-xs text-gray-500">{scopeLabel} · {dirLabel}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stationery"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Slug
              <span className="text-xs text-gray-400 font-normal ml-2">internal key — must be unique in this bucket</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. stationery"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Sort Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
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

          {state.direction === 'expense' && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isCreditNote}
                onChange={(e) => setIsCreditNote(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-700">Refund-style category</div>
                <div className="text-xs text-gray-500">
                  Money flowing BACK into the account via an EXPENSE entry (e.g., supplier refund, credit note). Flips the sign in totals.
                </div>
              </div>
            </label>
          )}

          {isShared && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
              📌 This is a <strong>shared category (fund)</strong>. It will appear in both
              {scopeLabel.toLowerCase()} Income AND Expense dropdowns when adding an entry, and
              its running balance (received − spent) will show on the Daily Book dashboard.
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      </div>
    </div>
  );
}
