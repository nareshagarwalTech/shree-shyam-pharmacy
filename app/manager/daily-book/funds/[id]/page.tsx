'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  supabase,
  Account,
  Category,
  PaymentMode,
  DailyEntry,
  FundBalance,
} from '@/lib/supabase';
import {
  ArrowLeft, Coins, Calendar, Wallet, Landmark, CreditCard,
} from 'lucide-react';

function fmtINR(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

interface ModeBreakdown {
  mode_id: string;
  mode_name: string;
  in: number;
  out: number;
  net: number;
}
interface AccountBreakdown {
  account_id: string;
  account_name: string;
  in: number;
  out: number;
  net: number;
}

export default function FundDetailPage() {
  const params = useParams<{ id: string }>();
  const fundId = params.id;

  const [fund, setFund]           = useState<Category | null>(null);
  const [balance, setBalance]     = useState<FundBalance | null>(null);
  const [entries, setEntries]     = useState<DailyEntry[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [modes, setModes]         = useState<PaymentMode[]>([]);
  const [loading, setLoading]     = useState(true);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const modeById    = useMemo(() => new Map(modes.map((m) => [m.id, m])),    [modes]);

  const load = useCallback(async () => {
    setLoading(true);
    const [cat, bal, ents, accs, mds] = await Promise.all([
      supabase.from('categories').select('*').eq('id', fundId).single(),
      supabase.from('daily_book_fund_balances').select('*').eq('category_id', fundId).maybeSingle(),
      supabase.from('daily_entries').select('*').eq('category_id', fundId).eq('txn_type', 'entry').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').order('sort_order'),
      supabase.from('payment_modes').select('*').order('sort_order'),
    ]);
    if (cat.data) setFund(cat.data as Category);
    setBalance((bal.data ?? null) as FundBalance | null);
    setEntries((ents.data ?? []) as DailyEntry[]);
    if (accs.data) setAccounts(accs.data as Account[]);
    if (mds.data)  setModes(mds.data as PaymentMode[]);
    setLoading(false);
  }, [fundId]);

  useEffect(() => { load(); }, [load]);

  // Per-mode breakdown
  const modeBreakdown = useMemo<ModeBreakdown[]>(() => {
    const m = new Map<string, ModeBreakdown>();
    for (const e of entries) {
      if (!e.mode_id) continue;
      const mode = modeById.get(e.mode_id);
      const key = e.mode_id;
      const cur = m.get(key) ?? { mode_id: key, mode_name: mode?.name ?? '?', in: 0, out: 0, net: 0 };
      const amt = Number(e.txn_amount);
      if (e.direction === 'income')  cur.in  += amt;
      if (e.direction === 'expense') cur.out += amt;
      cur.net = cur.in - cur.out;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => Math.abs(b.in + b.out) - Math.abs(a.in + a.out));
  }, [entries, modeById]);

  // Per-account breakdown
  const accountBreakdown = useMemo<AccountBreakdown[]>(() => {
    const m = new Map<string, AccountBreakdown>();
    for (const e of entries) {
      if (!e.account_id) continue;
      const acc = accountById.get(e.account_id);
      const key = e.account_id;
      const cur = m.get(key) ?? { account_id: key, account_name: acc?.name ?? '?', in: 0, out: 0, net: 0 };
      const amt = Number(e.txn_amount);
      if (e.direction === 'income')  cur.in  += amt;
      if (e.direction === 'expense') cur.out += amt;
      cur.net = cur.in - cur.out;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => Math.abs(b.in + b.out) - Math.abs(a.in + a.out));
  }, [entries, accountById]);

  const totalIn  = Number(balance?.total_in ?? 0);
  const totalOut = Number(balance?.total_out ?? 0);
  const remaining = Number(balance?.current_balance ?? 0);
  const negative = remaining < 0;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }
  if (!fund) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
        <div>Fund not found.</div>
        <Link href="/manager/daily-book" className="text-violet-600 hover:underline">← Back to Daily Book</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50/40 via-white to-indigo-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager/daily-book" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-violet-600 font-semibold flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> Fund Detail
            </div>
            <h1 className="font-display font-bold text-gray-900">📌 {fund.name}</h1>
          </div>
          <span className={`px-2 py-1 text-xs font-semibold rounded ${fund.scope === 'business' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>
            {fund.scope}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Summary card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center sm:text-left">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total In</div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums">+₹{fmtINR(totalIn)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Out</div>
              <div className="text-2xl font-bold text-rose-700 tabular-nums">−₹{fmtINR(totalOut)}</div>
            </div>
            <div className="text-center sm:text-right">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Remaining</div>
              <div className={`text-3xl font-bold tabular-nums ${negative ? 'text-rose-700' : remaining === 0 ? 'text-gray-500' : 'text-violet-700'}`}>
                ₹{fmtINR(remaining)}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div>{entries.length} entries</div>
            {balance?.last_activity_date && (
              <div>Last activity: <span className="text-gray-700 font-medium">{balance.last_activity_date}</span></div>
            )}
          </div>
        </div>

        {/* Per-mode breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-cyan-600" />
            <div className="font-semibold text-gray-900 text-sm">By Payment Mode</div>
          </div>
          {modeBreakdown.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">No entries yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Mode</th>
                  <th className="text-right px-3 py-2 font-semibold text-emerald-700">In</th>
                  <th className="text-right px-3 py-2 font-semibold text-rose-700">Out</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Net</th>
                </tr>
              </thead>
              <tbody>
                {modeBreakdown.map((r) => (
                  <tr key={r.mode_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">💳 {r.mode_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.in > 0 ? '+₹' + fmtINR(r.in) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{r.out > 0 ? '−₹' + fmtINR(r.out) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${r.net >= 0 ? 'text-violet-700' : 'text-rose-700'}`}>
                      {r.net >= 0 ? '+' : ''}₹{fmtINR(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Per-account breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-purple-600" />
            <div className="font-semibold text-gray-900 text-sm">By Account</div>
          </div>
          {accountBreakdown.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">No entries yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Account</th>
                  <th className="text-right px-3 py-2 font-semibold text-emerald-700">In</th>
                  <th className="text-right px-3 py-2 font-semibold text-rose-700">Out</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Net</th>
                </tr>
              </thead>
              <tbody>
                {accountBreakdown.map((r) => (
                  <tr key={r.account_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {accountById.get(r.account_id)?.kind === 'cash' ? <Wallet className="w-3.5 h-3.5 inline mr-1 text-amber-600" /> : <Landmark className="w-3.5 h-3.5 inline mr-1 text-purple-600" />}
                      {r.account_name}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.in > 0 ? '+₹' + fmtINR(r.in) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{r.out > 0 ? '−₹' + fmtINR(r.out) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${r.net >= 0 ? 'text-violet-700' : 'text-rose-700'}`}>
                      {r.net >= 0 ? '+' : ''}₹{fmtINR(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Chronological entries */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <div className="font-semibold text-gray-900 text-sm">All Entries</div>
            <div className="ml-auto text-xs text-gray-500">{entries.length} total</div>
          </div>
          {entries.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              No entries yet for this fund. Tag any income or expense entry with this category to start tracking.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Narration</th>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700 hidden sm:table-cell">Account</th>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700 hidden sm:table-cell">Mode</th>
                  <th className="text-right px-3 py-2 font-semibold text-emerald-700">In</th>
                  <th className="text-right px-3 py-2 font-semibold text-rose-700">Out</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const acc = e.account_id ? accountById.get(e.account_id) : null;
                  const mode = e.mode_id ? modeById.get(e.mode_id) : null;
                  const amt = Number(e.txn_amount);
                  return (
                    <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{e.entry_date}</td>
                      <td className="px-3 py-2 text-gray-800">
                        {e.narration || <span className="text-gray-400 italic">(no narration)</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">{acc?.short_name ?? acc?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">{mode?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                        {e.direction === 'income' ? '+₹' + fmtINR(amt) : ''}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                        {e.direction === 'expense' ? '−₹' + fmtINR(amt) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
