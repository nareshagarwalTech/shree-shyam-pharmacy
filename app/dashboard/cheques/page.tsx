'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Cheque,
  Bank,
  Party,
  ChequeSummary,
  ChequeStatus,
} from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import ChequeModal from '@/components/ChequeModal';
import {
  Search,
  Plus,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Pencil,
  Wallet,
  Banknote,
  CreditCard,
  Users,
} from 'lucide-react';

type StatusFilter = 'all' | ChequeStatus;

export default function ChequesPage() {
  const [cheques, setCheques]   = useState<Cheque[]>([]);
  const [parties, setParties]   = useState<Party[]>([]);
  const [banks, setBanks]       = useState<Bank[]>([]);
  const [summary, setSummary]   = useState<ChequeSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [partyFilter, setPartyFilter]   = useState<string>('all');
  const [search, setSearch]             = useState('');

  const [editing, setEditing] = useState<Cheque | null | undefined>(undefined); // undefined = closed
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const [c, p, b, s] = await Promise.all([
      supabase.from('cheques').select('*').order('issue_date', { ascending: false }).limit(500),
      supabase.from('parties').select('*').order('name'),
      supabase.from('banks').select('*').order('name'),
      supabase.from('cheque_summary').select('*').single(),
    ]);
    if (c.error)  setToast({ message: c.error.message, type: 'error' });
    else          setCheques((c.data || []) as Cheque[]);
    if (p.data)   setParties(p.data as Party[]);
    if (b.data)   setBanks(b.data as Bank[]);
    if (s.data)   setSummary(s.data as ChequeSummary);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const partyMap = useMemo(() => {
    const m = new Map<string, Party>();
    parties.forEach((p) => m.set(p.id, p));
    return m;
  }, [parties]);

  const filtered = useMemo(() => {
    let out = cheques;
    if (statusFilter !== 'all') out = out.filter((c) => c.status === statusFilter);
    if (partyFilter !== 'all')  out = out.filter((c) => c.party_id === partyFilter);
    if (search) {
      const q = search.toLowerCase().trim();
      out = out.filter((c) => {
        const partyName = c.party_id ? partyMap.get(c.party_id)?.name?.toLowerCase() ?? '' : '';
        return (
          partyName.includes(q) ||
          (c.cheque_no && c.cheque_no.toLowerCase().includes(q)) ||
          (c.online_ref && c.online_ref.toLowerCase().includes(q))
        );
      });
    }
    return out;
  }, [cheques, statusFilter, partyFilter, search, partyMap]);

  const quickStatus = async (c: Cheque, newStatus: ChequeStatus) => {
    const update: Partial<Cheque> = { status: newStatus };
    if (newStatus === 'cleared' && !c.clearance_date) {
      update.clearance_date = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from('cheques').update(update).eq('id', c.id);
    if (error) return setToast({ message: error.message, type: 'error' });
    setToast({ message: `Marked ${newStatus}.`, type: 'success' });
    fetchAll();
  };

  const exportCsv = () => {
    const headers = ['Issue Date', 'Party', 'Cheque No.', 'Online', 'Amount', 'Bank', 'Status', 'Deposit Date', 'Clearance Date', 'Remarks'];
    const lines = [headers.join(',')];
    for (const c of filtered) {
      const party = c.party_id ? partyMap.get(c.party_id)?.name ?? '' : '';
      const bank = banks.find((b) => b.id === c.bank_id)?.name ?? '';
      lines.push([
        c.issue_date,
        `"${party.replace(/"/g, '""')}"`,
        c.is_online ? 'ONLINE' : (c.cheque_no ?? ''),
        c.is_online ? 'Y' : 'N',
        c.amount,
        `"${bank.replace(/"/g, '""')}"`,
        c.status,
        c.deposit_date ?? '',
        c.clearance_date ?? '',
        `"${(c.remarks ?? '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cheques-${statusFilter}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Wallet className="w-6 h-6 text-emerald-600" />
              Cheques
            </h1>
            <p className="text-sm text-gray-500">Track cheques + online transfers issued to vendors.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/dashboard/cheques/parties"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium"
            >
              <Users className="w-4 h-4" /> Parties
            </Link>
            <Link
              href="/dashboard/cheques/banks"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium"
            >
              <Banknote className="w-4 h-4" /> Banks
            </Link>
            <button
              onClick={() => { setRefreshing(true); fetchAll(); }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={() => setEditing(null)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Cheque</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <KpiTile
              label="Pending"
              value={`₹${Number(summary.pending_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={`${summary.pending_count} cheque${summary.pending_count === 1 ? '' : 's'}`}
              color="amber"
              onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
              active={statusFilter === 'pending'}
            />
            <KpiTile
              label="Cleared"
              value={`₹${Number(summary.cleared_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={`${summary.cleared_count} cleared`}
              color="emerald"
              onClick={() => setStatusFilter(statusFilter === 'cleared' ? 'all' : 'cleared')}
              active={statusFilter === 'cleared'}
            />
            <KpiTile
              label="Bounced"
              value={`₹${Number(summary.bounced_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={`${summary.bounced_count} bounced`}
              color="red"
              onClick={() => setStatusFilter(statusFilter === 'bounced' ? 'all' : 'bounced')}
              active={statusFilter === 'bounced'}
            />
            <KpiTile
              label="Total Issued"
              value={`₹${Number(summary.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={`${summary.total_count} entries`}
              color="indigo"
              onClick={() => setStatusFilter('all')}
              active={statusFilter === 'all'}
            />
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search party, cheque no., or UTR..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <select
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm sm:w-56"
            >
              <option value="all">All parties</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm sm:w-40"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="deposited">Deposited</option>
              <option value="cleared">Cleared</option>
              <option value="bounced">Bounced</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {filtered.length} of {cheques.length} entries
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {cheques.length === 0 ? 'No cheques recorded yet.' : 'No cheques match the filter.'}
            </p>
            {cheques.length === 0 && (
              <button
                onClick={() => setEditing(null)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm"
              >
                <Plus className="w-4 h-4" /> Add the first cheque
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map((c) => {
                const party = c.party_id ? partyMap.get(c.party_id) : null;
                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 cursor-pointer hover:border-gray-200"
                    onClick={() => setEditing(c)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{party?.name ?? '— No party —'}</div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5 flex-wrap">
                          {c.is_online ? (
                            <span className="inline-flex items-center gap-1 text-cyan-700 font-medium">
                              <CreditCard className="w-3 h-3" /> ONLINE
                            </span>
                          ) : (
                            <span className="font-mono">#{c.cheque_no}</span>
                          )}
                          <span className="text-gray-300">·</span>
                          <span>{formatDate(c.issue_date)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-display font-bold text-gray-900">
                          ₹{Number(c.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <StatusChip status={c.status} />
                      </div>
                    </div>
                    {c.remarks && (
                      <div className="text-xs text-gray-500 truncate mb-2">{c.remarks}</div>
                    )}
                    <ActionRow cheque={c} onMark={quickStatus} />
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <Th>Issue Date</Th>
                      <Th>Party</Th>
                      <Th>Cheque #</Th>
                      <Th align="right">Amount</Th>
                      <Th>Status</Th>
                      <Th>Clearance</Th>
                      <Th>Remarks</Th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((c) => {
                      const party = c.party_id ? partyMap.get(c.party_id) : null;
                      return (
                        <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(c)}>
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{formatDate(c.issue_date)}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-gray-900">{party?.name ?? '— No party —'}</div>
                            {party?.category && (
                              <div className="text-xs text-gray-500 capitalize">{party.category}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {c.is_online ? (
                              <span className="inline-flex items-center gap-1 text-cyan-700 font-medium text-xs">
                                <CreditCard className="w-3 h-3" /> ONLINE
                                {c.online_ref && <span className="text-gray-500 font-mono ml-1">{c.online_ref}</span>}
                              </span>
                            ) : (
                              <span className="font-mono text-xs">{c.cheque_no}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-display font-semibold">
                            ₹{Number(c.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusChip status={c.status} />
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                            {c.clearance_date ? formatDate(c.clearance_date) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">
                            {c.remarks || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <ActionRow cheque={c} onMark={quickStatus} compact />
                              <button
                                onClick={() => setEditing(c)}
                                className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {editing !== undefined && (
        <ChequeModal
          cheque={editing}
          parties={parties}
          banks={banks}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setToast({ message: editing ? 'Cheque updated.' : 'Cheque saved.', type: 'success' });
            fetchAll();
          }}
          onError={(m) => setToast({ message: m, type: 'error' })}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function StatusChip({ status }: { status: ChequeStatus }) {
  const map: Record<ChequeStatus, string> = {
    pending:   'bg-amber-100 text-amber-700',
    deposited: 'bg-blue-100 text-blue-700',
    cleared:   'bg-emerald-100 text-emerald-700',
    bounced:   'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${map[status]}`}>
      {status}
    </span>
  );
}

function ActionRow({
  cheque, onMark, compact,
}: {
  cheque: Cheque;
  onMark: (c: Cheque, s: ChequeStatus) => void;
  compact?: boolean;
}) {
  const canMarkCleared = cheque.status === 'pending' || cheque.status === 'deposited';
  const canMarkBounced = cheque.status === 'pending' || cheque.status === 'deposited';
  if (!canMarkCleared && !canMarkBounced) return null;

  return (
    <div className={compact ? 'flex items-center gap-1' : 'flex items-center gap-1.5'}>
      {canMarkCleared && (
        <button
          onClick={(e) => { e.stopPropagation(); onMark(cheque, 'cleared'); }}
          className={
            compact
              ? 'p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg'
              : 'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
          }
          title="Mark cleared"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          {!compact && <span>Cleared</span>}
        </button>
      )}
      {canMarkBounced && (
        <button
          onClick={(e) => { e.stopPropagation(); onMark(cheque, 'bounced'); }}
          className={
            compact
              ? 'p-1.5 text-red-600 hover:bg-red-50 rounded-lg'
              : 'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100'
          }
          title="Mark bounced"
        >
          <XCircle className="w-3.5 h-3.5" />
          {!compact && <span>Bounced</span>}
        </button>
      )}
    </div>
  );
}

function KpiTile({
  label, value, sub, color, onClick, active,
}: {
  label: string; value: string; sub?: string;
  color: 'amber' | 'emerald' | 'red' | 'indigo';
  onClick?: () => void; active?: boolean;
}) {
  const map: Record<string, string> = {
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 sm:p-4 transition-all ${map[color]} ${
        active ? 'ring-2 ring-offset-2 ring-emerald-500' : ''
      } hover:shadow-sm`}
    >
      <div className="text-[11px] sm:text-xs font-medium opacity-70 leading-tight flex items-center gap-1.5">
        {label === 'Pending' && <Clock className="w-3.5 h-3.5" />}
        {label === 'Cleared' && <CheckCircle className="w-3.5 h-3.5" />}
        {label === 'Bounced' && <XCircle className="w-3.5 h-3.5" />}
        {label === 'Total Issued' && <Wallet className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-display font-bold mt-1 break-words">{value}</div>
      {sub && <div className="text-[10px] sm:text-xs opacity-70 mt-1 leading-tight">{sub}</div>}
    </button>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-600 uppercase tracking-wider`}>
      {children}
    </th>
  );
}
