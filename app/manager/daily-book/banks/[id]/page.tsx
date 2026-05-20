'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  supabase,
  Account,
  DailyBookBankLedgerRow,
  DailyBookAccountBalance,
} from '@/lib/supabase';
import { ArrowLeft, Landmark, Calendar, Wallet } from 'lucide-react';

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function isoNDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

export default function AccountLedgerPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState<DailyBookAccountBalance | null>(null);
  const [rows, setRows] = useState<DailyBookBankLedgerRow[]>([]);
  const [from, setFrom] = useState(isoNDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [acc, bal, ledger] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', accountId).single(),
      supabase.from('daily_book_account_balances').select('*').eq('account_id', accountId).single(),
      supabase.from('daily_book_bank_ledger').select('*')
        .eq('account_id', accountId)
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_date', { ascending: false }),
    ]);
    if (acc.data) setAccount(acc.data as Account);
    if (bal.data) setBalance(bal.data as DailyBookAccountBalance);
    setRows((ledger.data ?? []) as DailyBookBankLedgerRow[]);
    setLoading(false);
  }, [accountId, from, to]);

  useEffect(() => { load(); }, [load]);

  const Icon = account?.kind === 'cash' ? Wallet : Landmark;
  const accent = account?.kind === 'cash' ? 'amber' : 'purple';

  return (
    <div className={`min-h-screen bg-gradient-to-br from-${accent}-50/40 via-white to-${accent}-50/40`}>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager/daily-book/banks" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-purple-600 font-semibold">Manager · Daily Book · Ledger</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Icon className="w-5 h-5 text-purple-600" /> {account?.name ?? 'Loading…'}
            </h1>
          </div>
          {balance && (
            <div className="text-right">
              <div className="text-xs text-gray-500">Current</div>
              <div className={`text-lg font-bold ${Number(balance.current_balance) < 0 ? 'text-rose-700' : 'text-gray-900'}`}>
                ₹{fmtINR(Number(balance.current_balance))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left  px-3 py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Opening</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Credit (IN)</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Debit (OUT)</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Net</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Closing</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400">No movement in this range.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.entry_date} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{r.entry_date}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{r.opening_bal != null ? '₹' + fmtINR(Number(r.opening_bal)) : '—'}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{Number(r.total_credit) > 0 ? '+₹' + fmtINR(Number(r.total_credit)) : '—'}</td>
                    <td className="px-3 py-2 text-right text-rose-700">{Number(r.total_debit) > 0 ? '−₹' + fmtINR(Number(r.total_debit)) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${Number(r.net_change) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {Number(r.net_change) >= 0 ? '+' : ''}₹{fmtINR(Number(r.net_change))}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900">₹{fmtINR(Number(r.closing_bal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
