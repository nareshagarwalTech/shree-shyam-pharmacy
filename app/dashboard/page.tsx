'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase, CustomerNextReminder, Group, ReminderStatus } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';
import StatsCards from '@/components/StatsCards';
import CustomerCard from '@/components/CustomerCard';
import CustomerTable from '@/components/CustomerTable';
import AddCustomerModal from '@/components/AddCustomerModal';
import Toast from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import {
  Search,
  Plus,
  Upload,
  LayoutGrid,
  List,
  RefreshCw,
  Send,
  Tags,
  AlertTriangle,
  Receipt,
  ArrowRight,
  IndianRupee,
} from 'lucide-react';

type ViewMode = 'cards' | 'table';
type FilterStatus = 'all' | ReminderStatus;

export default function DashboardPage() {
  const [reminders, setReminders] = useState<CustomerNextReminder[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingTotal, setPendingTotal] = useState({ amount: 0, count: 0 });

  const fetchAll = useCallback(async () => {
    try {
      const [{ data: rems, error: e1 }, { data: grps, error: e2 }, { data: pending }] = await Promise.all([
        supabase.from('customer_next_reminder').select('*').order('days_until_reminder'),
        supabase.from('groups').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('pending_dues').select('outstanding'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setReminders(rems || []);
      setGroups(grps || []);
      const list = pending || [];
      setPendingTotal({
        amount: list.reduce((s: number, r: any) => s + Number(r.outstanding || 0), 0),
        count: list.length,
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setToast({ message: 'Failed to load data. Check Supabase connection.', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const groupColorMap = useMemo(() => {
    return new Map(groups.map((g) => [g.slug, { color: g.color, icon: g.icon, name: g.name }]));
  }, [groups]);

  const filtered = useMemo(() => {
    let out = reminders;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.phone.includes(q.replace(/\D/g, '')) ||
          r.last_feed_no?.toLowerCase().includes(q),
      );
    }
    if (filterStatus !== 'all') {
      out = out.filter((r) => r.status === filterStatus);
    }
    if (filterGroup !== 'all') {
      out = out.filter((r) => r.group_slugs?.includes(filterGroup));
    }
    return out;
  }, [reminders, searchQuery, filterStatus, filterGroup]);

  const stats = useMemo(() => ({
    overdue: reminders.filter((r) => r.status === 'overdue').length,
    urgent: reminders.filter((r) => r.status === 'urgent').length,
    soon: reminders.filter((r) => r.status === 'soon').length,
    total: reminders.length,
  }), [reminders]);

  const handleSendReminder = async (r: CustomerNextReminder) => {
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: r.customer_id,
          language: r.preferred_language,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setToast({
          message: `Send failed: ${json.error || res.statusText}`,
          type: 'error',
        });
        return;
      }

      // Direct API send succeeded
      if (json.message_id) {
        setToast({
          message: `Sent via WhatsApp API ✓ (${json.message_id.slice(-8)})`,
          type: 'success',
        });
      }

      // wa.me fallback — open the prefilled chat
      if (json.fallback_url) {
        window.open(json.fallback_url, '_blank', 'noopener,noreferrer');
        setToast({
          message: 'API not configured — opened wa.me. Press Send in WhatsApp.',
          type: 'success',
        });
      }

      setTimeout(fetchAll, 800);
    } catch (err: any) {
      console.error(err);
      setToast({ message: `Send error: ${err.message}`, type: 'error' });
    }
  };

  const handleBulkSend = async () => {
    const toSend = filtered.filter((r) => selected.has(r.customer_id));
    if (!toSend.length) return;
    let ok = 0;
    let fail = 0;
    for (const r of toSend) {
      try {
        const res = await fetch('/api/send-reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: r.customer_id, language: r.preferred_language }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          ok++;
          if (json.fallback_url) window.open(json.fallback_url, '_blank', 'noopener,noreferrer');
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
      // gentle pacing — Meta is happiest under 5 msgs/sec for new numbers
      await new Promise((res) => setTimeout(res, 350));
    }
    setToast({
      message: `Bulk send: ${ok} succeeded, ${fail} failed.`,
      type: fail > 0 ? 'error' : 'success',
    });
    setSelected(new Set());
    setTimeout(fetchAll, 800);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    const canPick = filtered.filter(
      (r) => r.status !== 'opted_out' && r.status !== 'no_sales' && r.status !== 'paused',
    );
    if (canPick.every((r) => selected.has(r.customer_id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(canPick.map((r) => r.customer_id)));
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Outstanding + collection banner — New Delivery CTA moved into header */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/dashboard/pending"
            className="group relative overflow-hidden rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-amber-50 p-4 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Pending Dues</span>
              </div>
              <ArrowRight className="w-4 h-4 text-red-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl sm:text-3xl font-display font-bold text-red-700 leading-none">
              ₹{pendingTotal.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-red-600/70 mt-1">{pendingTotal.count} customers owe money</div>
          </Link>

          <Link
            href="/dashboard/daily-summary"
            className="group flex items-center justify-between rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4 hover:shadow-md transition-all"
          >
            <div>
              <div className="flex items-center gap-2 text-cyan-700 mb-1">
                <IndianRupee className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Daily Collection</span>
              </div>
              <div className="text-base sm:text-lg font-display font-bold text-cyan-800">View summary →</div>
              <div className="text-xs text-cyan-700/70 mt-0.5">Cash, online, credit by date</div>
            </div>
            <ArrowRight className="w-5 h-5 text-cyan-500 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <StatsCards
          stats={stats}
          onFilterClick={setFilterStatus as (s: string) => void}
          activeFilter={filterStatus}
        />

        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, or bill #"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All Status</option>
                <option value="overdue">🔴 Overdue</option>
                <option value="urgent">🟠 Urgent</option>
                <option value="soon">🔵 Due Soon</option>
                <option value="ok">🟢 OK</option>
                <option value="paused">⏸ Paused</option>
                <option value="opted_out">🚫 Opted Out</option>
                <option value="no_sales">— No Sales</option>
              </select>

              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All Groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.slug}>
                    {g.icon ? `${g.icon} ` : ''}{g.name}
                  </option>
                ))}
              </select>

              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'cards'
                      ? 'bg-white shadow-sm text-emerald-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Card view"
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'table'
                      ? 'bg-white shadow-sm text-emerald-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Table view"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <Link
                href="/dashboard/sales-upload"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload Sales</span>
              </Link>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Customer</span>
              </button>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-emerald-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
              <div className="text-sm font-medium text-emerald-900">
                {selected.size} customer{selected.size === 1 ? '' : 's'} selected
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(new Set())}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkSend}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  <Send className="w-4 h-4" />
                  Send {selected.size} Reminder{selected.size === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            reminders.length === 0 ? (
              <EmptyStateInitial />
            ) : (
              <EmptyState
                hasCustomers
                onAddClick={() => setShowAddModal(true)}
                onImportClick={() => (window.location.href = '/dashboard/sales-upload')}
              />
            )
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => (
                <CustomerCard
                  key={r.customer_id}
                  reminder={r}
                  groupColorMap={groupColorMap}
                  onSendReminder={handleSendReminder}
                  selected={selected.has(r.customer_id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          ) : (
            <CustomerTable
              reminders={filtered}
              onSendReminder={handleSendReminder}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
            />
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Showing {filtered.length} of {reminders.length} customers
          </div>
        )}
      </main>

      {showAddModal && (
        <AddCustomerModal
          groups={groups}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchAll();
            setToast({ message: 'Customer added.', type: 'success' });
          }}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

function EmptyStateInitial() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-full flex items-center justify-center mx-auto mb-6">
        <Tags className="w-10 h-10 text-emerald-600" />
      </div>
      <h3 className="text-xl font-display font-bold text-gray-900 mb-2">Get started</h3>
      <p className="text-gray-500 mb-8 max-w-md mx-auto">
        Add your first customer manually, or upload a sales Excel export from your billing system
        to populate customers + reminder dates automatically.
      </p>
      <div className="flex items-center justify-center gap-4">
        <Link
          href="/dashboard/sales-upload"
          className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
        >
          <Upload className="w-5 h-5" />
          Upload Sales Excel
        </Link>
      </div>
    </div>
  );
}
