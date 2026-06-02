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
  TrendingUp, Wallet, Briefcase, Home,
  Landmark, ArrowRight, Settings, Coins,
} from 'lucide-react';
import DailyEntryModal from '@/components/DailyEntryModal';

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

export default function DailyBookPage() {
  const [date, setDate] = useState(todayISO());
  const [filterScope, setFilterScope]         = useState<FilterScope>('all');
  const [filterDirection, setFilterDirection] = useState<FilterDirection>('all');

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modes, setModes]         = useState<PaymentMode[]>([]);
  const [balances, setBalances]   = useState<BalanceRow[]>([]);
  const [funds, setFunds]         = useState<FundBalance[]>([]);
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
    const [entriesRes, balancesRes, fundsRes] = await Promise.all([
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
    ]);
    setEntries((entriesRes.data ?? []) as DailyEntry[]);
    setBalances((balancesRes.data ?? []) as BalanceRow[]);
    setFunds((fundsRes.data ?? []) as FundBalance[]);
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
  useEffect(() => { if (!loading) loadEntries(); }, [date, loading, loadEntries]);

  // Filtered + totals (4-bucket)
  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (filterScope !== 'all' && e.scope !== filterScope) {
        // cash_count and transfer have null scope — keep them visible only when scope=='all'
        if (e.txn_type === 'entry') return false;
        return false;
      }
      if (filterDirection !== 'all' && e.direction !== filterDirection) {
        if (e.txn_type === 'entry') return false;
        return false;
      }
      return true;
    });
  }, [entries, filterScope, filterDirection]);

  const buckets = useMemo(() => {
    const acc = { bizIn: 0, bizOut: 0, persIn: 0, persOut: 0 };
    for (const e of entries) {
      if (e.txn_type !== 'entry' || e.direction == null || e.scope == null) continue;
      const cat = e.category_id ? categoryById.get(e.category_id) : null;
      const isRefund = !!(cat?.is_credit_note);
      const amt = Number(e.txn_amount);
      // Refunds (cat.is_credit_note=true on an EXPENSE) flip the sign in the totals
      const effectiveDir: EntryDirection = isRefund && e.direction === 'expense' ? 'income' : e.direction;

      if (e.scope === 'business' && effectiveDir === 'income')  acc.bizIn  += amt;
      if (e.scope === 'business' && effectiveDir === 'expense') acc.bizOut += amt;
      if (e.scope === 'personal' && effectiveDir === 'income')  acc.persIn += amt;
      if (e.scope === 'personal' && effectiveDir === 'expense') acc.persOut += amt;
    }
    return acc;
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

        {/* Account Balances panel — Opening / Movements / Closing per account for selected day */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-violet-50/50 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-violet-600" />
              <div>
                <div className="font-semibold text-gray-900 text-sm">Account Balances</div>
                <div className="text-xs text-gray-500">for {date}</div>
              </div>
            </div>
            <Link
              href="/manager/daily-book/accounts"
              className="text-xs text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
              title="Set opening balances"
            >
              <Settings className="w-3.5 h-3.5" /> Set Opening
            </Link>
          </div>
          {loading ? (
            <div className="py-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : balances.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">No active accounts.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left  px-3 py-2 font-semibold text-gray-700">Account</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">Opening</th>
                    <th className="text-right px-3 py-2 font-semibold text-emerald-700">+ Credit</th>
                    <th className="text-right px-3 py-2 font-semibold text-rose-700">− Debit</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-700">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => {
                    const opening = Number(b.opening_today);
                    const credit = Number(b.credit_today);
                    const debit = Number(b.debit_today);
                    const closing = Number(b.closing_today);
                    const negative = closing < 0;
                    return (
                      <tr key={b.account_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-gray-900">{b.account_name}</div>
                          {b.monthly_opening_date && (
                            <div className="text-[10px] text-violet-600">
                              monthly opening since {b.monthly_opening_date}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">₹{fmtINR(opening)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                          {credit > 0 ? '+₹' + fmtINR(credit) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">
                          {debit > 0 ? '−₹' + fmtINR(debit) : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${negative ? 'text-rose-700' : 'text-gray-900'}`}>
                          ₹{fmtINR(closing)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-200">
                💡 Closing of {date} becomes opening of the next day automatically.
              </div>
            </div>
          )}
        </div>

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

        {/* 4-bucket stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={Briefcase} label="Business In"  value={buckets.bizIn}  color="emerald" />
          <Tile icon={Briefcase} label="Business Out" value={buckets.bizOut} color="rose"    />
          <Tile icon={Home}      label="Personal In"  value={buckets.persIn} color="emerald" />
          <Tile icon={Home}      label="Personal Out" value={buckets.persOut}color="rose"    />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NetTile label="Net Business" value={buckets.bizIn - buckets.bizOut} />
          <NetTile label="Net Personal" value={buckets.persIn - buckets.persOut} />
        </div>

        {/* Entries */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="font-semibold text-gray-900">
              {visible.length} {visible.length === 1 ? 'entry' : 'entries'}
              {(filterScope !== 'all' || filterDirection !== 'all') && (
                <span className="text-sm text-gray-500 ml-2 font-normal">filtered from {entries.length}</span>
              )}
            </div>
            <div className="text-xs text-gray-500">Click a row to view / edit</div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No entries for this date {(filterScope !== 'all' || filterDirection !== 'all') && '(in filter)'}.
              <div className="mt-2">
                <button onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="text-indigo-600 hover:text-indigo-700 underline text-sm">Add the first one</button>
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

function Tile({
  icon: Icon, label, value, color,
}: { icon: typeof TrendingUp; label: string; value: number; color: 'emerald' | 'rose' }) {
  const cls = color === 'emerald'
    ? { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-900' }
    : { bg: 'bg-rose-50',    icon: 'bg-rose-100 text-rose-600',       text: 'text-rose-900'    };
  return (
    <div className={`rounded-xl border border-gray-200 p-3 ${cls.bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cls.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-xs text-gray-600 font-medium">{label}</div>
      </div>
      <div className={`text-xl font-bold ${cls.text}`}>₹{new Intl.NumberFormat('en-IN').format(value)}</div>
    </div>
  );
}

function NetTile({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div className={`rounded-xl border p-3 ${positive ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      <div className={`text-2xl font-bold ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
        {positive ? '+' : ''}₹{new Intl.NumberFormat('en-IN').format(value)}
      </div>
    </div>
  );
}
