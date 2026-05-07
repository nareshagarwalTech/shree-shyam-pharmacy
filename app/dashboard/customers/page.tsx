'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, Customer, CustomerWithGroups, Group } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import PhoneLink from '@/components/PhoneLink';
import Toast from '@/components/Toast';
import AddCustomerModal from '@/components/AddCustomerModal';
import EditCustomerModal from '@/components/EditCustomerModal';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Ban,
  PlayCircle,
  PauseCircle,
  Users,
  Pencil,
  Receipt,
  ArrowRight,
} from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithGroups[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CustomerWithGroups | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: cs, error: e1 }, { data: gs, error: e2 }] = await Promise.all([
      supabase.from('customer_with_groups').select('*').order('name'),
      supabase.from('groups').select('*').eq('is_active', true).order('sort_order'),
    ]);
    if (e1 || e2) {
      setToast({ message: (e1 || e2)!.message, type: 'error' });
    }
    setCustomers((cs as CustomerWithGroups[]) || []);
    setGroups(gs || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    let out = customers;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      out = out.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (/\d/.test(q) && c.phone.includes(q.replace(/\D/g, ''))),
      );
    }
    if (groupFilter !== 'all') {
      out = out.filter((c) => c.groups.some((g) => g.slug === groupFilter));
    }
    return out;
  }, [customers, searchQuery, groupFilter]);

  const toggleGroup = async (customerId: string, groupId: string, isOn: boolean) => {
    if (isOn) {
      await supabase
        .from('customer_groups')
        .delete()
        .eq('customer_id', customerId)
        .eq('group_id', groupId);
    } else {
      await supabase.from('customer_groups').insert({ customer_id: customerId, group_id: groupId });
    }
    fetchAll();
  };

  const softDelete = async (c: CustomerWithGroups) => {
    if (!confirm(`Delete ${c.name}? (soft-delete — can be reactivated in database)`)) return;
    const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', c.id);
    if (error) setToast({ message: error.message, type: 'error' });
    else {
      setCustomers(customers.filter((x) => x.id !== c.id));
      setToast({ message: 'Customer deleted.', type: 'success' });
    }
  };

  const setOptOut = async (c: CustomerWithGroups, opt: boolean) => {
    const { error } = await supabase
      .from('customers')
      .update({
        whatsapp_opt_out: opt,
        whatsapp_opt_out_at: opt ? new Date().toISOString() : null,
      })
      .eq('id', c.id);
    if (error) setToast({ message: error.message, type: 'error' });
    else {
      setToast({ message: opt ? 'Opted out.' : 'Opt-out removed.', type: 'success' });
      fetchAll();
    }
  };

  const togglePause = async (c: CustomerWithGroups) => {
    const paused = !!c.reminders_paused_until && new Date(c.reminders_paused_until) >= new Date();
    const until = paused ? null : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { error } = await supabase
      .from('customers')
      .update({ reminders_paused_until: until })
      .eq('id', c.id);
    if (error) setToast({ message: error.message, type: 'error' });
    else {
      setToast({
        message: paused ? 'Reminders resumed.' : 'Reminders paused 30 days.',
        type: 'success',
      });
      fetchAll();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-display font-bold text-gray-900">All Customers</h1>
              <p className="text-sm text-gray-500">
                {customers.length} total · tap a row to manage groups, opt-out, or pause reminders
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Customer</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm sm:w-44"
            >
              <option value="all">All Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.slug}>
                  {g.icon ? `${g.icon} ` : ''}{g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyBox />
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => {
              const paused =
                c.reminders_paused_until &&
                new Date(c.reminders_paused_until) >= new Date();
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-emerald-700 font-semibold">
                          {c.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/customer/${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-gray-900 hover:text-emerald-600 truncate inline-block max-w-full"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
                          <PhoneLink phone={c.phone} className="inline-flex items-center gap-1 text-gray-500 hover:text-purple-600" />
                          {c.whatsapp_opt_out && (
                            <span className="inline-flex px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded">
                              Opted out
                            </span>
                          )}
                          {paused && (
                            <span className="inline-flex px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                              Paused
                            </span>
                          )}
                        </p>
                        {/* Mobile-only inline summary */}
                        <p className="md:hidden text-xs text-gray-500 mt-0.5">
                          {c.total_sales} sale{c.total_sales === 1 ? '' : 's'}
                          {c.total_spent != null && (
                            <> · ₹{Math.round(c.total_spent).toLocaleString('en-IN')}</>
                          )}
                          {c.last_purchase_date && (
                            <> · {formatDate(c.last_purchase_date)}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="hidden md:flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <div className="text-gray-500 text-xs">Sales</div>
                        <div className="font-semibold text-gray-900">{c.total_sales}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-500 text-xs">Total spent</div>
                        <div className="font-semibold text-gray-900">
                          {c.total_spent != null ? `₹${Math.round(c.total_spent)}` : '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-500 text-xs">Last visit</div>
                        <div className="font-semibold text-gray-900">
                          {c.last_purchase_date ? formatDate(c.last_purchase_date) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="hidden lg:flex flex-wrap gap-1 max-w-[260px]">
                        {c.groups.slice(0, 3).map((g) => (
                          <span
                            key={g.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                            style={{
                              borderColor: g.color || '#e5e7eb',
                              color: g.color || '#6b7280',
                              backgroundColor: `${g.color}10`,
                            }}
                          >
                            {g.icon && <span>{g.icon}</span>}
                            {g.name}
                          </span>
                        ))}
                        {c.groups.length > 3 && (
                          <span className="text-xs text-gray-400">+{c.groups.length - 3}</span>
                        )}
                      </div>
                      {expanded === c.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {expanded === c.id && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">
                      {c.address && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Address:</span> {c.address}
                        </div>
                      )}

                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Groups</h4>
                        <div className="flex flex-wrap gap-2">
                          {groups.map((g) => {
                            const on = c.groups.some((cg) => cg.id === g.id);
                            return (
                              <button
                                key={g.id}
                                onClick={() => toggleGroup(c.id, g.id, on)}
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border transition-all ${
                                  on ? 'text-white border-transparent' : 'text-gray-700 border-gray-200 hover:bg-white'
                                }`}
                                style={on ? { backgroundColor: g.color } : undefined}
                              >
                                {g.icon && <span>{g.icon}</span>}
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-gray-200 flex-wrap">
                        <Link
                          href={`/dashboard/customer/${c.phone}`}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                          <Receipt className="w-4 h-4" />
                          View statement
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => setEditing(c)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit details
                        </button>
                        <button
                          onClick={() => setOptOut(c, !c.whatsapp_opt_out)}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium ${
                            c.whatsapp_opt_out
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Ban className="w-4 h-4" />
                          {c.whatsapp_opt_out ? 'Remove opt-out' : 'Mark opted out'}
                        </button>
                        <button
                          onClick={() => togglePause(c)}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium ${
                            paused
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {paused ? (
                            <PlayCircle className="w-4 h-4" />
                          ) : (
                            <PauseCircle className="w-4 h-4" />
                          )}
                          {paused ? 'Resume reminders' : 'Pause 30 days'}
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => softDelete(c)}
                          className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showAdd && (
        <AddCustomerModal
          groups={groups}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            fetchAll();
            setToast({ message: 'Customer added.', type: 'success' });
          }}
        />
      )}

      {editing && (
        <EditCustomerModal
          customer={editing as Customer}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            fetchAll();
            setToast({ message: 'Customer updated.', type: 'success' });
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function EmptyBox() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Users className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-500">No customers match the current filter.</p>
    </div>
  );
}
