'use client';

import { useEffect, useState } from 'react';
import { supabase, Group } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import { Plus, Pencil, Trash2, Tag, Loader2, Lock } from 'lucide-react';

interface GroupRow extends Group {
  customer_count: number;
}

const DEFAULT_COLOR = '#1f6f4a';
const COLOR_SWATCHES = [
  '#1f6f4a', '#2f8658', '#dc2626', '#d4a843', '#06b6d4',
  '#8b5cf6', '#f59e0b', '#0ea5e9', '#ec4899', '#64748b',
];

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Group> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    const { data: gs, error } = await supabase
      .from('groups')
      .select('*')
      .order('sort_order');
    if (error) {
      setToast({ message: error.message, type: 'error' });
      setLoading(false);
      return;
    }
    // fetch counts in one pass
    const { data: counts } = await supabase
      .from('customer_groups')
      .select('group_id');
    const countMap = new Map<string, number>();
    (counts || []).forEach((r) => countMap.set(r.group_id, (countMap.get(r.group_id) || 0) + 1));

    setGroups((gs || []).map((g) => ({ ...g, customer_count: countMap.get(g.id) || 0 })));
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const openNew = () =>
    setEditing({
      name: '',
      slug: '',
      description: '',
      color: DEFAULT_COLOR,
      icon: '',
      sort_order: 100,
      is_active: true,
      is_system: false,
    });

  const handleDelete = async (g: GroupRow) => {
    if (g.is_system) return;
    if (!confirm(`Delete group "${g.name}"? Customers in this group keep their other tags.`))
      return;
    const { error } = await supabase.from('groups').delete().eq('id', g.id);
    if (error) setToast({ message: error.message, type: 'error' });
    else {
      setToast({ message: 'Group deleted.', type: 'success' });
      fetchGroups();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Groups</h1>
            <p className="text-sm text-gray-500">
              Tag customers to filter, broadcast, and customise reminders. One customer can be in
              multiple groups.
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Group
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Group
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Customers
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-base"
                          style={{ backgroundColor: g.color }}
                        >
                          {g.icon || <Tag className="w-4 h-4" />}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900 flex items-center gap-2">
                            {g.name}
                            {g.is_system && (
                              <span title="Seeded default — can edit but not delete">
                                <Lock className="w-3.5 h-3.5 text-gray-400" />
                              </span>
                            )}
                          </div>
                          {g.description && (
                            <div className="text-xs text-gray-500">{g.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{g.slug}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {g.customer_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditing(g)}
                          className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
                          disabled={g.is_system}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:text-gray-300 disabled:hover:bg-transparent"
                          title={g.is_system ? 'System group' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      No groups yet. Click “New Group” to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editing && (
        <GroupEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            fetchGroups();
            setToast({ message: 'Saved.', type: 'success' });
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function GroupEditor({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: Partial<Group>;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(initial.name || '');
  const [slug, setSlug] = useState(initial.slug || '');
  const [description, setDescription] = useState(initial.description || '');
  const [color, setColor] = useState(initial.color || DEFAULT_COLOR);
  const [icon, setIcon] = useState(initial.icon || '');
  const [sortOrder, setSortOrder] = useState(initial.sort_order || 100);
  const [saving, setSaving] = useState(false);

  const isEdit = !!initial.id;

  const autoSlug = (n: string) =>
    n.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const handleSave = async () => {
    if (!name.trim()) return onError('Name is required');
    const finalSlug = slug.trim() || autoSlug(name);
    setSaving(true);
    const payload = {
      name: name.trim(),
      slug: finalSlug,
      description: description.trim() || null,
      color,
      icon: icon.trim() || null,
      sort_order: sortOrder,
    };
    const { error } = isEdit
      ? await supabase.from('groups').update(payload).eq('id', initial.id!)
      : await supabase.from('groups').insert(payload);
    setSaving(false);
    if (error) onError(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md modal-content">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-display font-bold text-gray-900">
            {isEdit ? 'Edit Group' : 'New Group'}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!isEdit) setSlug(autoSlug(e.target.value));
              }}
              placeholder="e.g. Senior Citizens"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="senior-citizens"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-mono text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 resize-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon (emoji)</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🩸"
                maxLength={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 100)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Colour</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 ${
                    color === c ? 'border-gray-800' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
