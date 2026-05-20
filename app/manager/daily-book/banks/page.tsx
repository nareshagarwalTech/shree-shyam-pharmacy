'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, DailyBookAccountBalance } from '@/lib/supabase';
import { ArrowLeft, Landmark, ChevronRight, Wallet } from 'lucide-react';

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

export default function BanksOverviewPage() {
  const [balances, setBalances] = useState<DailyBookAccountBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('daily_book_account_balances')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setBalances((data ?? []) as DailyBookAccountBalance[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-purple-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-purple-600" /> Account Balances
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : balances.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No accounts configured.</div>
        ) : (
          balances.map((b) => {
            const Icon = b.account_kind === 'cash' ? Wallet : Landmark;
            const colorClass = b.account_kind === 'cash' ? 'text-amber-600 bg-amber-100' : 'text-purple-600 bg-purple-100';
            return (
              <Link
                key={b.account_id}
                href={`/manager/daily-book/banks/${b.account_id}`}
                className="block bg-white rounded-2xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all p-5"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{b.account_name}</div>
                    <div className="text-xs text-gray-500">
                      Opening: ₹{fmtINR(Number(b.opening_balance))} ·
                      Net change: {Number(b.lifetime_net) >= 0 ? '+' : ''}₹{fmtINR(Number(b.lifetime_net))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Balance</div>
                    <div className={`text-xl font-bold ${Number(b.current_balance) < 0 ? 'text-rose-700' : 'text-gray-900'}`}>
                      ₹{fmtINR(Number(b.current_balance))}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
