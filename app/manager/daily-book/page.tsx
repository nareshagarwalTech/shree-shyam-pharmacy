'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Account,
  Category,
  PaymentMode,
  DailyEntry,
  EntryDirection,
  EntryScope,
  TxnType,
  FundBalance,
} from '@/lib/supabase';
import {
  ArrowLeft, Plus, RefreshCw, Calendar,
  Wallet, Landmark, ArrowRight, Settings, Coins,
  AlertTriangle, CheckCircle2, Pencil, Save, X,
  Receipt, TrendingDown, TrendingUp, Filter,
} from 'lucide-react';
import DailyEntryModal from '@/components/DailyEntryModal';

interface CashRecon {
  entry_date: string;
  cash_account_id: string;
  opening: number | string;
  non_sale_in: number | string;
  cr_note_in: number | string;
  deposits_in: number | string;
  expenses: number | string;
  deposits_out: number | string;
  manual_sales: number | string;
  expected_closing: number | string;
  actual_closing: number | string | null;
  derived_sales: number | string;
  cash_diff: number | string;
}

interface BalanceRow {
  account_id: string;
  account_name: string;
  account_short_name: string | null;
  account_kind: string;
  inception_opening: number | string;
  monthly_opening_amount: number | string | null;
  monthly_opening_date: string | null;
  opening_today: number | string;
  credit_today: number | string;
  debit_today: number | string;
  net_today: number | string;
  closing_today: number | string;
  sort_order: number;
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fmtINR(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

// Compact badge for the row
function typeBadge(e: DailyEntry): { label: string; cls: string } {
  if (e.txn_type === 'cash_count') return { label: 'CASH',     cls: 'bg-amber-100  text-amber-700'   };
  if (e.txn_type === 'transfer')   return { label: 'TRANSFER', cls: 'bg-violet-100 text-violet-700'  };
  // entry
  if (e.direction === 'income'  && e.scope === 'business') return { label: 'BIZ-IN',  cls: 'bg-emerald-100 text-emerald-700' };
  if (e.direction === 'expense' && e.scope === 'business') return { label: 'BIZ-OUT', cls: 'bg-rose-100    text-rose-700'    };
  if (e.direction === 'income'  && e.scope === 'personal') return { label: 'PERS-IN', cls: 'bg-emerald-100 text-emerald-700' };
  if (e.direction === 'expense' && e.scope === 'personal') return { label: 'PERS-OUT',cls: 'bg-rose-100    text-rose-700'    };
  return { label: '?', cls: 'bg-gray-100 text-gray-700' };
}

type FilterScope     = 'all' | EntryScope;
type FilterDirection = 'all' | EntryDirection;

interface CategoryBreakdownRow {
  categoryId: string;
  categoryName: string;
  scope: EntryScope;
  total: number;
  count: number;
  isCreditNote: boolean;
}

export default function DailyBookPage() {
  const [date, setDate] = useState(todayISO());
  const [filterScope, setFilterScope]         = useState<FilterScope>('all');
  const [filterDirection, setFilterDirection] = useState<FilterDirection>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);

  // Convenience helper for filter pill / breakdown clicks
  const applyFilter = useCallback((opts: { categoryId?: string | null; scope?: FilterScope; direction?: FilterDirection }) => {
    if (opts.categoryId !== undefined) setFilterCategoryId(opts.categoryId);
    if (opts.scope !== undefined) setFilterScope(opts.scope);
    if (opts.direction !== undefined) setFilterDirection(opts.direction);
    // Scroll to entries list
    setTimeout(() => {
      const el = document.getElementById('entries-list');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);
  const clearFilters = useCallback(() => {
    setFilterCategoryId(null);
    setFilterScope('all');
    setFilterDirection('all');
  }, []);
  const filtersActive = filterCategoryId !== null || filterScope !== 'all' || filterDirection !== 'all';

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modes, setModes]         = useState<PaymentMode[]>([]);
  const [balances, setBalances]   = useState<BalanceRow[]>([]);
  const [funds, setFunds]         = useState<FundBalance[]>([]);
  const [cashRecon, setCashRecon] = useState<CashRecon | null>(null);
  const [savingClosing, setSavingClosing] = useState(false);
  const [editingClosing, setEditingClosing] = useState(false);
  const [closingDraft, setClosingDraft] = useState('');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<DailyEntry | null>(null);

  const accountById  = useMemo(() => new Map(accounts.map((a) => [a.id, a])),  [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])),[categories]);
  const modeById     = useMemo(() => new Map(modes.map((m) => [m.id, m])),     [modes]);

  const loadLookups = useCallback(async () => {
    const [a, c, m] = await Promise.all([
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('payment_modes').select('*').eq('is_active', true).order('sort_order'),
    ]);
    if (a.data) setAccounts(a.data as Account[]);
    if (c.data) setCategories(c.data as Category[]);
    if (m.data) setModes(m.data as PaymentMode[]);
  }, []);

  const loadEntries = useCallback(async () => {
    setRefreshing(true);
    const [entriesRes, balancesRes, fundsRes, reconRes] = await Promise.all([
      supabase
        .from('daily_entries')
        .select('*')
        .eq('entry_date', date)
        .order('created_at', { ascending: false }),
      supabase.rpc('daily_book_balances_on', { p_date: date }),
      supabase
        .from('daily_book_fund_balances')
        .select('*')
        .eq('is_active', true),
      supabase.rpc('cash_day_reconciliation', { p_date: date }),
    ]);
    setEntries((entriesRes.data ?? []) as DailyEntry[]);
    setBalances((balancesRes.data ?? []) as BalanceRow[]);
    setFunds((fundsRes.data ?? []) as FundBalance[]);
    const reconArr = (reconRes.data ?? []) as CashRecon[];
    setCashRecon(reconArr.length > 0 ? reconArr[0] : null);
    setRefreshing(false);
  }, [date]);

  // Save the closing balance for the day (creates or updates the cash_count entry).
  const saveClosingBalance = useCallback(async () => {
    if (!cashRecon?.cash_account_id) return;
    const amt = parseFloat(closingDraft);
    if (!Number.isFinite(amt) || amt < 0) {
      alert('Enter a valid closing balance (non-negative number).');
      return;
    }
    setSavingClosing(true);
    try {
      // Find existing cash_count for this date
      const { data: existing } = await supabase
        .from('daily_entries')
        .select('id')
        .eq('entry_date', date)
        .eq('txn_type', 'cash_count')
        .eq('account_id', cashRecon.cash_account_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('daily_entries')
          .update({ txn_amount: amt })
          .eq('id', existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('daily_entries')
          .insert({
            entry_date: date,
            txn_type: 'cash_count',
            account_id: cashRecon.cash_account_id,
            txn_amount: amt,
            narration: 'CLOSING BALANCE',
          });
        if (error) throw new Error(error.message);
      }
      setEditingClosing(false);
      await loadEntries();
    } catch (e: any) {
      alert('Failed to save: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSavingClosing(false);
    }
  }, [date, closingDraft, cashRecon, loadEntries]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLookups();
      await loadEntries();
      setLoading(false);
    })();
  }, [loadLookups, loadEntries]);
  useEffect(() => { if (!loading) loadEntries(); }, [date, loading, loadEntries]);

  // Filtered entries based on scope/direction/category filters
  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (filterScope !== 'all' && e.scope !== filterScope) return false;
      if (filterDirection !== 'all' && e.direction !== filterDirection) return false;
      if (filterCategoryId !== null && e.category_id !== filterCategoryId) return false;
      return true;
    });
  }, [entries, filterScope, filterDirection, filterCategoryId]);

  // Per-category breakdown of EXPENSE entries for the selected date
  const expenseBreakdown = useMemo<CategoryBreakdownRow[]>(() => {
    const m = new Map<string, CategoryBreakdownRow>();
    for (const e of entries) {
      if (e.txn_type !== 'entry' || e.direction !== 'expense' || !e.category_id) continue;
      const cat = categoryById.get(e.category_id);
      if (!cat) continue;
      const cur = m.get(cat.id) ?? {
        categoryId: cat.id,
        categoryName: cat.name,
        scope: cat.scope,
        total: 0,
        count: 0,
        isCreditNote: cat.is_credit_note,
      };
      cur.total += Number(e.txn_amount);
      cur.count += 1;
      m.set(cat.id, cur);
    }
    return [...m.values()].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === 'business' ? -1 : 1;
      return b.total - a.total;
    });
  }, [entries, categoryById]);

  // Per-category breakdown of INCOME entries for the selected date
  const incomeBreakdown = useMemo<CategoryBreakdownRow[]>(() => {
    const m = new Map<string, CategoryBreakdownRow>();
    for (const e of entries) {
      if (e.txn_type !== 'entry' || e.direction !== 'income' || !e.category_id) continue;
      const cat = categoryById.get(e.category_id);
      if (!cat) continue;
      const cur = m.get(cat.id) ?? {
        categoryId: cat.id,
        categoryName: cat.name,
        scope: cat.scope,
        total: 0,
        count: 0,
        isCreditNote: false,
      };
      cur.total += Number(e.txn_amount);
      cur.count += 1;
      m.set(cat.id, cur);
    }
    return [...m.values()].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === 'business' ? -1 : 1;
      return b.total - a.total;
    });
  }, [entries, categoryById]);

  const filteredCategoryName = filterCategoryId ? categoryById.get(filterCategoryId)?.name : null;

  // Overall totals across ALL accounts (cash + banks) for the selected date.
  // Refund-style expense categories (is_credit_note=true) flip sign and count
  // as income.
  const overallTotals = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const e of entries) {
      if (e.txn_type !== 'entry') continue;
      const cat = e.category_id ? categoryById.get(e.category_id) : null;
      const isRefund = !!cat?.is_credit_note;
      const amt = Number(e.txn_amount);
      if (e.direction === 'income') totalIn += amt;
      else if (e.direction === 'expense') {
        if (isRefund) totalIn += amt;
        else totalOut += amt;
      }
    }
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [entries, categoryById]);

  function renderEntryRow(e: DailyEntry) {
    const badge = typeBadge(e);
    const acct  = e.account_id ? accountById.get(e.account_id) : null;
    const acct2 = e.transfer_to_account_id ? accountById.get(e.transfer_to_account_id) : null;
    const cat   = e.category_id ? categoryById.get(e.category_id) : null;
    const mode  = e.mode_id ? modeById.get(e.mode_id) : null;
    const isCredit = e.direction === 'income' || e.txn_type === 'cash_count';
    const amountClass = e.txn_type === 'cash_count' ? 'text-amber-700'
      : isCredit ? 'text-emerald-700'
      : (e.direction === 'expense' ? 'text-rose-700' : 'text-violet-700');
    const isLinked = !!e.linked_entry_id;

    const inner = (
      <>
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${badge.cls}`}>{badge.label}</span>
        {isLinked && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"
                title="Auto-managed from a source income.">
            AUTO
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">
            {e.narration || <span className="text-gray-400 italic">(no narration)</span>}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {cat && <span>📁 {cat.name}</span>}
            {mode && <span className="ml-2">💳 {mode.name}</span>}
            {acct && <span className="ml-2">🏦 {acct.short_name ?? acct.name}</span>}
            {acct2 && <span> → {acct2.short_name ?? acct2.name}</span>}
            {e.settlement_date && e.settlement_date !== e.entry_date && (
              <span className="ml-2 text-indigo-600">⏱ settles {e.settlement_date}</span>
            )}
          </div>
        </div>
        <div className={`text-right font-semibold ${amountClass}`}>
          ₹{fmtINR(Number(e.txn_amount))}
          {e.settled_amount != null && Number(e.settled_amount) !== Number(e.txn_amount) && (
            <div className="text-xs font-normal text-gray-500">→ ₹{fmtINR(Number(e.settled_amount))}</div>
          )}
        </div>
      </>
    );

    if (isLinked) {
      return (
        <button key={e.id}
          onClick={() => { setEditing(e); setModalOpen(true); }}
          className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b border-gray-100 last:border-0 flex items-center gap-3 bg-violet-50/30">
          {inner}
        </button>
      );
    }
    return (
      <button key={e.id}
        onClick={() => { setEditing(e); setModalOpen(true); }}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3">
        {inner}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-indigo-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900">Daily Entry</h1>
          </div>
          <button onClick={() => loadEntries()} disabled={refreshing}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-50" title="Refresh">
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            <button onClick={() => setDate(todayISO())} className="text-sm text-indigo-600 hover:text-indigo-700 px-2 py-1">Today</button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select value={filterScope} onChange={(e) => setFilterScope(e.target.value as FilterScope)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="all">All scopes</option>
              <option value="business">Business only</option>
              <option value="personal">Personal only</option>
            </select>
            <select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value as FilterDirection)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="all">In + Out</option>
              <option value="income">Income only</option>
              <option value="expense">Expense only</option>
            </select>
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm">
              <Plus className="w-4 h-4" /> New Entry
            </button>
          </div>
        </div>

        {/* First-time setup callout — shown when ALL accounts have zero inception opening
            AND no monthly opening has been set yet. */}
        {!loading && balances.length > 0 &&
          balances.every((b) => Number(b.inception_opening) === 0 && b.monthly_opening_amount == null) && (
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border-2 border-dashed border-violet-300 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Wallet className="w-6 h-6 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-gray-900">👋 First time? Start with your Opening Balances.</h3>
                <p className="text-sm text-gray-600 mt-1 leading-snug">
                  Tell the system how much money was in each account when you started using it.
                  Without this, balances start from ₹0 and any expenses will make them go negative.
                </p>
                <Link
                  href="/manager/daily-book/accounts"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg shadow-sm"
                >
                  <Settings className="w-4 h-4" /> Set Opening Balances
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* === PRIMARY CARD: Today's Cash =================================== */}
        {cashRecon && (() => {
          const opening      = Number(cashRecon.opening);
          const nonSaleIn    = Number(cashRecon.non_sale_in);
          const crNoteIn     = Number(cashRecon.cr_note_in);
          const depositsIn   = Number(cashRecon.deposits_in);
          const expenses     = Number(cashRecon.expenses);
          const depositsOut  = Number(cashRecon.deposits_out);
          const manualSales  = Number(cashRecon.manual_sales);
          const derived      = Number(cashRecon.derived_sales);
          const actual       = cashRecon.actual_closing == null ? null : Number(cashRecon.actual_closing);
          const diff         = Number(cashRecon.cash_diff);
          const balanced     = Math.abs(diff) < 0.01;
          const cashShort    = actual != null && diff < -0.01;
          // Net Income = ALL cash inflows (incl. derived sales)
          const netIncome    = manualSales + derived + nonSaleIn + crNoteIn + depositsIn;
          // Net Expense = ALL cash outflows
          const netExpense   = expenses + depositsOut;
          // Expected = Opening + NetIncome − NetExpense  (== Actual when balanced)
          const expected     = opening + netIncome - netExpense;

          const statusBg = actual == null ? 'bg-amber-50/60 border-amber-200'
            : cashShort ? 'bg-rose-50/60 border-rose-200'
            : 'bg-emerald-50/60 border-emerald-200';

          return (
            <div className={`bg-white rounded-2xl border-2 overflow-hidden ${
              actual == null ? 'border-amber-300' : cashShort ? 'border-rose-300' : 'border-emerald-300'
            }`}>
              <div className={`px-5 py-3 border-b flex items-center justify-between ${statusBg}`}>
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-gray-800" />
                  <div>
                    <div className="font-display font-bold text-gray-900">Today&apos;s Cash</div>
                    <div className="text-xs text-gray-500">CASH drawer · {date}</div>
                  </div>
                </div>
                {actual == null
                  ? <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded">⚠ Closing not entered</span>
                  : balanced
                  ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Balanced</span>
                  : <span className="text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-1 rounded inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Cash Short ₹{fmtINR(Math.abs(diff))}</span>}
              </div>

              {/* All Accounts overview — total income + expense + net across CASH + banks */}
              <div className="px-4 py-3 grid grid-cols-3 gap-2 sm:divide-x sm:divide-gray-200 bg-gray-50/50">
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
                    📊 All Accts · Income
                  </div>
                  <button
                    onClick={() => applyFilter({ categoryId: null, scope: 'all', direction: 'income' })}
                    className="text-left hover:bg-emerald-50 rounded px-1 -mx-1 transition"
                    title="Filter to all income entries"
                  >
                    <div className="text-lg font-bold tabular-nums text-emerald-700">
                      +₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(overallTotals.totalIn)}
                    </div>
                  </button>
                </div>
                <div className="text-left sm:pl-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
                    📊 All Accts · Expense
                  </div>
                  <button
                    onClick={() => applyFilter({ categoryId: null, scope: 'all', direction: 'expense' })}
                    className="text-left hover:bg-rose-50 rounded px-1 -mx-1 transition"
                    title="Filter to all expense entries"
                  >
                    <div className="text-lg font-bold tabular-nums text-rose-700">
                      −₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(overallTotals.totalOut)}
                    </div>
                  </button>
                </div>
                <div className="text-left sm:pl-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
                    📊 Net Today
                  </div>
                  <div className={`text-lg font-bold tabular-nums ${overallTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {overallTotals.net >= 0 ? '+' : '−'}₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(overallTotals.net))}
                  </div>
                </div>
              </div>

              {/* Cash-only reconciliation row */}
              <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-t border-gray-200">
                💵 Cash Reconciliation
              </div>
              <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:divide-x sm:divide-gray-200">
                <Stat label="Opening" value={opening} />
                <button
                  onClick={() => applyFilter({ categoryId: null, scope: 'all', direction: 'income' })}
                  className="hover:bg-emerald-50 rounded transition group sm:pl-3"
                  title="Click to filter entries to Income only"
                >
                  <Stat label="+ Income" value={netIncome} colored="emerald" arrow />
                </button>
                <button
                  onClick={() => applyFilter({ categoryId: null, scope: 'all', direction: 'expense' })}
                  className="hover:bg-rose-50 rounded transition group sm:pl-3"
                  title="Click to filter entries to Expenses only"
                >
                  <Stat label="− Expense" value={netExpense} colored="rose" arrow />
                </button>
                <Stat label="Expected" value={expected} bold extraClass="sm:pl-3" />
                {/* Actual closing — inline editor */}
                <div className="sm:pl-3 col-span-2 sm:col-span-1">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Actual Closing</div>
                  {editingClosing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={closingDraft}
                        onChange={(e) => setClosingDraft(e.target.value)}
                        autoFocus
                        placeholder="0"
                        className="flex-1 min-w-0 px-2 py-1 text-base font-bold tabular-nums border-2 border-emerald-400 rounded focus:border-emerald-600 focus:ring-1 focus:ring-emerald-100"
                      />
                      <button onClick={saveClosingBalance} disabled={savingClosing}
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50" title="Save">
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingClosing(false)} disabled={savingClosing}
                        className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded disabled:opacity-50" title="Cancel">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-lg font-bold tabular-nums ${actual == null ? 'text-amber-600' : 'text-gray-900'}`}>
                        {actual == null ? '—' : '₹' + fmtINR(actual)}
                      </span>
                      <button
                        onClick={() => { setClosingDraft(actual != null ? String(actual) : ''); setEditingClosing(true); }}
                        className="p-1 hover:bg-emerald-100 text-emerald-700 rounded"
                        title={actual == null ? 'Enter closing' : 'Edit closing'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Hint strip: derived sales note + cash log link */}
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-600 flex items-center justify-between gap-2 flex-wrap">
                {derived > 0 ? (
                  <span className="text-emerald-700">
                    🟢 Auto Cash Sales: <strong>+₹{fmtINR(derived)}</strong>
                  </span>
                ) : (
                  <span>💡 Enter closing balance → Cash Sales computed automatically</span>
                )}
                <Link href="/manager/daily-book/cash-log" className="text-emerald-700 hover:text-emerald-800 underline">
                  See cash log →
                </Link>
              </div>
            </div>
          );
        })()}

        {/* === Today's Breakdown — clickable Income + Expense by category === */}
        {!loading && (expenseBreakdown.length > 0 || incomeBreakdown.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {incomeBreakdown.length > 0 && (
              <BreakdownCard
                title="Today's Income"
                icon={TrendingUp}
                iconColor="text-emerald-600"
                headerBg="bg-emerald-50/40"
                amountColor="text-emerald-700"
                amountSign="+"
                rows={incomeBreakdown}
                onRowClick={(r) => applyFilter({ categoryId: r.categoryId, scope: r.scope, direction: 'income' })}
                onScopeClick={(scope) => applyFilter({ categoryId: null, scope, direction: 'income' })}
              />
            )}
            {expenseBreakdown.length > 0 && (
              <BreakdownCard
                title="Today's Expenses"
                icon={TrendingDown}
                iconColor="text-rose-600"
                headerBg="bg-rose-50/40"
                amountColor="text-rose-700"
                amountSign="−"
                rows={expenseBreakdown}
                onRowClick={(r) => applyFilter({ categoryId: r.categoryId, scope: r.scope, direction: 'expense' })}
                onScopeClick={(scope) => applyFilter({ categoryId: null, scope, direction: 'expense' })}
              />
            )}
          </div>
        )}

        {/* === BANK ACCOUNTS row — compact, one chip per bank account ====== */}
        {!loading && balances.filter((b) => b.account_kind !== 'cash').length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-violet-600" />
                <div className="font-semibold text-gray-900 text-sm">Bank Accounts</div>
                <span className="text-xs text-gray-500">· {date}</span>
              </div>
              <Link href="/manager/daily-book/banks" className="text-xs text-violet-600 hover:text-violet-700 inline-flex items-center gap-1">
                Full ledger <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {balances.filter((b) => b.account_kind !== 'cash').map((b) => {
                const closing = Number(b.closing_today);
                const negative = closing < 0;
                return (
                  <div key={b.account_id}
                       className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${negative ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-200'}`}>
                    <span className="text-sm font-medium text-gray-800">{b.account_name}</span>
                    <span className={`text-sm font-bold tabular-nums ${negative ? 'text-rose-700' : 'text-gray-900'}`}>
                      ₹{fmtINR(closing)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fund Balances panel — only when at least one active shared category exists */}
        {!loading && funds.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-violet-50/50 to-transparent flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-violet-600" />
                <div>
                  <div className="font-semibold text-gray-900 text-sm">Fund Balances</div>
                  <div className="text-xs text-gray-500">running balance per shared category</div>
                </div>
              </div>
              <Link
                href="/manager/daily-book/categories"
                className="text-xs text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
              >
                <Settings className="w-3.5 h-3.5" /> Manage Funds
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left  px-3 py-2 font-semibold text-gray-700">Fund</th>
                    <th className="text-left  px-3 py-2 font-semibold text-gray-700">Scope</th>
                    <th className="text-right px-3 py-2 font-semibold text-emerald-700">In</th>
                    <th className="text-right px-3 py-2 font-semibold text-rose-700">Out</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">Remaining</th>
                    <th className="text-left  px-3 py-2 font-semibold text-gray-700 hidden sm:table-cell">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {funds.map((f) => {
                    const remaining = Number(f.current_balance);
                    const negative = remaining < 0;
                    return (
                      <tr key={f.category_id} className="border-b border-gray-100 last:border-0 hover:bg-violet-50/40 cursor-pointer"
                          onClick={() => { window.location.href = `/manager/daily-book/funds/${f.category_id}`; }}
                          title="Click to see breakdown by mode + account + chronological entries">
                        <td className="px-3 py-2.5 font-medium text-gray-900">
                          <Link href={`/manager/daily-book/funds/${f.category_id}`} className="hover:text-violet-700">
                            📌 {f.category_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className={`px-1.5 py-0.5 rounded ${f.scope === 'business' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>
                            {f.scope}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                          {Number(f.total_in) > 0 ? '+₹' + fmtINR(Number(f.total_in)) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">
                          {Number(f.total_out) > 0 ? '−₹' + fmtINR(Number(f.total_out)) : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${negative ? 'text-rose-700' : remaining === 0 ? 'text-gray-400' : 'text-violet-700'}`}>
                          ₹{fmtINR(remaining)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 hidden sm:table-cell">
                          {f.last_activity_date ?? <span className="text-gray-400">—</span>}
                          {f.entry_count > 0 && <span className="ml-2 text-gray-400">({f.entry_count} entries)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filter pill — shown only when any filter is active */}
        {filtersActive && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap text-sm">
            <Filter className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span className="text-indigo-900 font-medium">Filtered:</span>
            {filteredCategoryName && (
              <span className="px-2 py-0.5 bg-white border border-indigo-200 rounded text-indigo-800 text-xs font-semibold">
                📁 {filteredCategoryName}
              </span>
            )}
            {filterScope !== 'all' && (
              <span className="px-2 py-0.5 bg-white border border-indigo-200 rounded text-indigo-800 text-xs font-semibold">
                {filterScope}
              </span>
            )}
            {filterDirection !== 'all' && (
              <span className="px-2 py-0.5 bg-white border border-indigo-200 rounded text-indigo-800 text-xs font-semibold">
                {filterDirection}
              </span>
            )}
            <span className="text-indigo-700 text-xs">· showing {visible.length} of {entries.length}</span>
            <button
              onClick={clearFilters}
              className="ml-auto text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        )}

        {/* Entries */}
        <div id="entries-list" className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="font-semibold text-gray-900">
              {visible.length} {visible.length === 1 ? 'entry' : 'entries'}
              {filtersActive && (
                <span className="text-sm text-gray-500 ml-2 font-normal">filtered from {entries.length}</span>
              )}
            </div>
            <div className="text-xs text-gray-500">Click a row to view / edit</div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No entries for this date{filtersActive && ' matching the filter'}.
              <div className="mt-2">
                {filtersActive ? (
                  <button onClick={clearFilters}
                    className="text-indigo-600 hover:text-indigo-700 underline text-sm">Clear filter</button>
                ) : (
                  <button onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="text-indigo-600 hover:text-indigo-700 underline text-sm">Add the first one</button>
                )}
              </div>
            </div>
          ) : (
            <div>{visible.map(renderEntryRow)}</div>
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
        modes={modes}
        defaultDate={date}
      />
    </div>
  );
}

// Generic breakdown card used for Today's Income and Today's Expenses.
function BreakdownCard({
  title, icon: Icon, iconColor, headerBg, amountColor, amountSign,
  rows, onRowClick, onScopeClick,
}: {
  title: string;
  icon: typeof Receipt;
  iconColor: string;
  headerBg: string;
  amountColor: string;
  amountSign: '+' | '−';
  rows: CategoryBreakdownRow[];
  onRowClick: (r: CategoryBreakdownRow) => void;
  onScopeClick: (scope: EntryScope) => void;
}) {
  const bizRows = rows.filter((r) => r.scope === 'business');
  const persRows = rows.filter((r) => r.scope === 'personal');
  const bizTotal = bizRows.reduce((s, r) => s + r.total, 0);
  const persTotal = persRows.reduce((s, r) => s + r.total, 0);
  const grandTotal = bizTotal + persTotal;

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-200 ${headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <div className="font-semibold text-gray-900 text-sm">{title}</div>
        </div>
        <div className={`font-bold tabular-nums ${amountColor}`}>{amountSign}₹{fmt(grandTotal)}</div>
      </div>
      <div>
        {bizRows.length > 0 && (
          <>
            <button onClick={() => onScopeClick('business')}
              className="w-full px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-left text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center justify-between transition">
              <span>Business</span>
              <span className="tabular-nums">{amountSign}₹{fmt(bizTotal)}</span>
            </button>
            {bizRows.map((r) => (
              <button key={r.categoryId} onClick={() => onRowClick(r)}
                className="w-full px-3 py-2 hover:bg-gray-50 text-left text-sm flex items-center justify-between border-b border-gray-50 last:border-0 transition">
                <span className="text-gray-800 truncate flex-1 min-w-0">
                  📁 {r.categoryName}
                  {r.isCreditNote && <span className="text-emerald-600 text-[10px] font-medium ml-1">(refund)</span>}
                  <span className="text-gray-400 text-xs ml-2">×{r.count}</span>
                </span>
                <span className={`tabular-nums font-semibold ${amountColor} ml-2`}>{amountSign}₹{fmt(r.total)}</span>
              </button>
            ))}
          </>
        )}
        {persRows.length > 0 && (
          <>
            <button onClick={() => onScopeClick('personal')}
              className="w-full px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-left text-xs font-semibold text-violet-800 uppercase tracking-wider flex items-center justify-between transition">
              <span>Personal</span>
              <span className="tabular-nums">{amountSign}₹{fmt(persTotal)}</span>
            </button>
            {persRows.map((r) => (
              <button key={r.categoryId} onClick={() => onRowClick(r)}
                className="w-full px-3 py-2 hover:bg-gray-50 text-left text-sm flex items-center justify-between border-b border-gray-50 last:border-0 transition">
                <span className="text-gray-800 truncate flex-1 min-w-0">
                  📁 {r.categoryName}
                  {r.isCreditNote && <span className="text-emerald-600 text-[10px] font-medium ml-1">(refund)</span>}
                  <span className="text-gray-400 text-xs ml-2">×{r.count}</span>
                </span>
                <span className={`tabular-nums font-semibold ${amountColor} ml-2`}>{amountSign}₹{fmt(r.total)}</span>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="px-3 py-2 text-[10px] text-gray-500 bg-gray-50 border-t border-gray-200">
        💡 Click any row to filter the entries list
      </div>
    </div>
  );
}

// Compact vertical stat (label above value) used in the horizontal cash card.
function Stat({
  label, value, colored, bold, arrow, extraClass,
}: {
  label: string;
  value: number;
  colored?: 'emerald' | 'rose';
  bold?: boolean;
  arrow?: boolean;
  extraClass?: string;
}) {
  const valueColor = colored === 'emerald' ? 'text-emerald-700'
    : colored === 'rose' ? 'text-rose-700'
    : 'text-gray-900';
  return (
    <div className={`${extraClass ?? ''} text-left`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
        {label}
        {arrow && <span className="text-gray-400 group-hover:text-gray-700"> →</span>}
      </div>
      <div className={`text-lg tabular-nums ${valueColor} ${bold ? 'font-bold' : 'font-semibold'}`}>
        ₹{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}
      </div>
    </div>
  );
}

