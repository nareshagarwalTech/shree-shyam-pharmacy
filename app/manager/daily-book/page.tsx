'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Account,
  ExpenseCategory,
  SaleChannel,
  DailyEntry,
} from '@/lib/supabase';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Calendar,
  TrendingUp,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import DailyEntryModal from '@/components/DailyEntryModal';

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function fmtINR(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

const TYPE_BADGE: Record<DailyEntry['entry_type'], { label: string; cls: string }> = {
  sale:          { label: 'SALE',     cls: 'bg-emerald-100 text-emerald-700' },
  expense:       { label: 'EXPENSE',  cls: 'bg-rose-100 text-rose-700' },
  cash_count:    { label: 'CASH',     cls: 'bg-amber-100 text-amber-700' },
  bank_transfer: { label: 'TRANSFER', cls: 'bg-sky-100 text-sky-700' },
  cash_deposit:  { label: 'DEPOSIT',  cls: 'bg-violet-100 text-violet-700' },
};

export default function DailyBookPage() {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [channels, setChannels] = useState<SaleChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailyEntry | null>(null);

  // Lookup maps for rendering
  const accountById  = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const channelById  = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  const loadLookups = useCallback(async () => {
    const [a, c, sc] = await Promise.all([
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('expense_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('sale_channels').select('*').eq('is_active', true).order('sort_order'),
    ]);
    if (a.data) setAccounts(a.data as Account[]);
    if (c.data) setCategories(c.data as ExpenseCategory[]);
    if (sc.data) setChannels(sc.data as SaleChannel[]);
  }, []);

  const loadEntries = useCallback(async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('entry_date', date)
      .order('created_at', { ascending: false });
    setEntries((data ?? []) as DailyEntry[]);
    setRefreshing(false);
  }, [date]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLookups();
      await loadEntries();
      setLoading(false);
    })();
  }, [loadLookups, loadEntries]);

  // Reload entries when date changes
  useEffect(() => { if (!loading) loadEntries(); }, [date, loading, loadEntries]);

  // Quick totals for the header
  const totals = useMemo(() => {
    let sales = 0, expense = 0, cashIn = 0, cashOut = 0;
    for (const e of entries) {
      if (e.entry_type === 'sale') {
        sales += Number(e.txn_amount);
        const ch = e.sale_channel_id ? channelById.get(e.sale_channel_id) : null;
        if (ch?.slug === 'cash') cashIn += Number(e.txn_amount);
      } else if (e.entry_type === 'expense') {
        const cat = e.expense_category_id ? categoryById.get(e.expense_category_id) : null;
        if (cat?.is_credit_note) expense -= Number(e.txn_amount);
        else expense += Number(e.txn_amount);
        const acc = e.account_id ? accountById.get(e.account_id) : null;
        if (acc?.kind === 'cash' && !cat?.is_credit_note) cashOut += Number(e.txn_amount);
      } else if (e.entry_type === 'cash_deposit') {
        cashOut += Number(e.txn_amount);
      }
    }
    return { sales, expense, cashIn, cashOut };
  }, [entries, channelById, categoryById, accountById]);

  function renderEntryRow(e: DailyEntry) {
    const badge = TYPE_BADGE[e.entry_type];
    const acct = e.account_id ? accountById.get(e.account_id)?.short_name ?? accountById.get(e.account_id)?.name : null;
    const acct2 = e.transfer_to_account_id ? accountById.get(e.transfer_to_account_id)?.short_name ?? accountById.get(e.transfer_to_account_id)?.name : null;
    const cat = e.expense_category_id ? categoryById.get(e.expense_category_id)?.name : null;
    const channel = e.sale_channel_id ? channelById.get(e.sale_channel_id)?.name : null;
    const isCredit = e.entry_type === 'sale';
    const amountClass = isCredit ? 'text-emerald-700' : e.entry_type === 'expense' ? 'text-rose-700' : 'text-gray-800';

    return (
      <button
        key={e.id}
        onClick={() => { setEditing(e); setModalOpen(true); }}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3"
      >
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${badge.cls}`}>{badge.label}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">
            {e.narration || <span className="text-gray-400 italic">(no narration)</span>}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {channel && <>📤 {channel}</>}
            {cat && <>📁 {cat}</>}
            {acct && <span className="ml-1">• {acct}</span>}
            {acct2 && <span> → {acct2}</span>}
          </div>
        </div>
        <div className={`text-right font-semibold ${amountClass}`}>
          ₹{fmtINR(Number(e.txn_amount))}
          {e.settled_amount != null && Number(e.settled_amount) !== Number(e.txn_amount) && (
            <div className="text-xs font-normal text-gray-500">→ ₹{fmtINR(Number(e.settled_amount))}</div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-indigo-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900">Daily Entry</h1>
          </div>
          <button
            onClick={() => loadEntries()}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Date picker + add */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={() => setDate(todayISO())}
              className="text-sm text-indigo-600 hover:text-indigo-700 px-2 py-1"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Entry
          </button>
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile icon={TrendingUp} label="Sales" value={totals.sales} color="emerald" />
          <StatTile icon={TrendingDown} label="Expenses (net)" value={totals.expense} color="rose" />
          <StatTile icon={Wallet} label="Cash In" value={totals.cashIn} color="amber" />
          <StatTile icon={Wallet} label="Cash Out" value={totals.cashOut} color="gray" />
        </div>

        {/* Entries */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="font-semibold text-gray-900">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </div>
            <div className="text-xs text-gray-500">Click any row to edit</div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No entries for this date.
              <div className="mt-2">
                <button
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="text-indigo-600 hover:text-indigo-700 underline text-sm"
                >
                  Add the first one
                </button>
              </div>
            </div>
          ) : (
            <div>{entries.map(renderEntryRow)}</div>
          )}
        </div>
      </main>

      <DailyEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); loadEntries(); }}
        entry={editing}
        accounts={accounts}
        categories={categories}
        channels={channels}
        defaultDate={date}
      />
    </div>
  );
}

function StatTile({
  icon: Icon, label, value, color,
}: { icon: typeof TrendingUp; label: string; value: number; color: 'emerald' | 'rose' | 'amber' | 'gray' }) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', text: 'text-emerald-900' },
    rose:    { bg: 'bg-rose-50',    iconBg: 'bg-rose-100',    iconColor: 'text-rose-600',    text: 'text-rose-900' },
    amber:   { bg: 'bg-amber-50',   iconBg: 'bg-amber-100',   iconColor: 'text-amber-600',   text: 'text-amber-900' },
    gray:    { bg: 'bg-gray-50',    iconBg: 'bg-gray-100',    iconColor: 'text-gray-600',    text: 'text-gray-900' },
  }[color];
  return (
    <div className={`rounded-xl border border-gray-200 p-3 ${colorMap.bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 ${colorMap.iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${colorMap.iconColor}`} />
        </div>
        <div className="text-xs text-gray-600 font-medium">{label}</div>
      </div>
      <div className={`text-xl font-bold ${colorMap.text}`}>₹{fmtINR(value)}</div>
    </div>
  );
}
