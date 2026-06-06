'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Account,
  Category,
  PaymentMode,
  DailyEntry,
  EntryScope,
} from '@/lib/supabase';
import {
  ArrowLeft, Calendar, RefreshCw, Printer,
  TrendingUp, TrendingDown, Wallet,
  AlertTriangle, CheckCircle2, Receipt, CreditCard, Tags,
  Briefcase, Home, BarChart3,
} from 'lucide-react';

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
  opening_today: number | string;
  closing_today: number | string;
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}
function fmtINR0(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DailyReportPage() {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [cashRecon, setCashRecon] = useState<CashRecon | null>(null);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const modeById     = useMemo(() => new Map(modes.map((m) => [m.id, m])),     [modes]);
  const accountById  = useMemo(() => new Map(accounts.map((a) => [a.id, a])),  [accounts]);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, a, c, m, r, b] = await Promise.all([
      supabase.from('daily_entries').select('*').eq('entry_date', date),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('payment_modes').select('*').eq('is_active', true).order('sort_order'),
      supabase.rpc('cash_day_reconciliation', { p_date: date }),
      supabase.rpc('daily_book_balances_on', { p_date: date }),
    ]);
    setEntries((e.data ?? []) as DailyEntry[]);
    setAccounts((a.data ?? []) as Account[]);
    setCategories((c.data ?? []) as Category[]);
    setModes((m.data ?? []) as PaymentMode[]);
    const ra = (r.data ?? []) as CashRecon[];
    setCashRecon(ra.length > 0 ? ra[0] : null);
    setBalances((b.data ?? []) as BalanceRow[]);
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Compute all the breakdowns
  const report = useMemo(() => {
    let bizIncomeTotal = 0, persIncomeTotal = 0;
    let bizExpenseTotal = 0, persExpenseTotal = 0;
    let refundIn = 0;
    let transferTotal = 0;

    const salesByMode = new Map<string, { id: string; name: string; amount: number; count: number }>();
    const salesByCategory = new Map<string, { id: string; name: string; amount: number; count: number }>();
    const bizExpenseByCategory = new Map<string, { id: string; name: string; amount: number; count: number }>();
    const persExpenseByCategory = new Map<string, { id: string; name: string; amount: number; count: number }>();
    const persIncomeByCategory = new Map<string, { id: string; name: string; amount: number; count: number }>();

    for (const e of entries) {
      const amt = Number(e.txn_amount);
      if (e.txn_type === 'transfer') { transferTotal += amt; continue; }
      if (e.txn_type !== 'entry') continue;

      const cat = e.category_id ? categoryById.get(e.category_id) : null;
      const mode = e.mode_id ? modeById.get(e.mode_id) : null;

      if (e.direction === 'income') {
        if (e.scope === 'business') {
          bizIncomeTotal += amt;
          if (mode) {
            const cur = salesByMode.get(mode.id) ?? { id: mode.id, name: mode.name, amount: 0, count: 0 };
            cur.amount += amt; cur.count += 1;
            salesByMode.set(mode.id, cur);
          }
          if (cat) {
            const cur = salesByCategory.get(cat.id) ?? { id: cat.id, name: cat.name, amount: 0, count: 0 };
            cur.amount += amt; cur.count += 1;
            salesByCategory.set(cat.id, cur);
          }
        } else if (e.scope === 'personal') {
          persIncomeTotal += amt;
          if (cat) {
            const cur = persIncomeByCategory.get(cat.id) ?? { id: cat.id, name: cat.name, amount: 0, count: 0 };
            cur.amount += amt; cur.count += 1;
            persIncomeByCategory.set(cat.id, cur);
          }
        }
      } else if (e.direction === 'expense') {
        const isRefund = !!cat?.is_credit_note;
        if (e.scope === 'business') {
          if (isRefund) { bizIncomeTotal += amt; refundIn += amt; }
          else {
            bizExpenseTotal += amt;
            if (cat) {
              const cur = bizExpenseByCategory.get(cat.id) ?? { id: cat.id, name: cat.name, amount: 0, count: 0 };
              cur.amount += amt; cur.count += 1;
              bizExpenseByCategory.set(cat.id, cur);
            }
          }
        } else if (e.scope === 'personal') {
          if (isRefund) { persIncomeTotal += amt; refundIn += amt; }
          else {
            persExpenseTotal += amt;
            if (cat) {
              const cur = persExpenseByCategory.get(cat.id) ?? { id: cat.id, name: cat.name, amount: 0, count: 0 };
              cur.amount += amt; cur.count += 1;
              persExpenseByCategory.set(cat.id, cur);
            }
          }
        }
      }
    }

    return {
      bizIncomeTotal, persIncomeTotal,
      bizExpenseTotal, persExpenseTotal, refundIn,
      transferTotal,
      totalIncome: bizIncomeTotal + persIncomeTotal,
      totalExpense: bizExpenseTotal + persExpenseTotal,
      netPnL: bizIncomeTotal + persIncomeTotal - bizExpenseTotal - persExpenseTotal,
      netBusiness: bizIncomeTotal - bizExpenseTotal,
      netPersonal: persIncomeTotal - persExpenseTotal,
      salesByMode: [...salesByMode.values()].sort((a, b) => b.amount - a.amount),
      salesByCategory: [...salesByCategory.values()].sort((a, b) => b.amount - a.amount),
      bizExpenseByCategory: [...bizExpenseByCategory.values()].sort((a, b) => b.amount - a.amount),
      persExpenseByCategory: [...persExpenseByCategory.values()].sort((a, b) => b.amount - a.amount),
      persIncomeByCategory: [...persIncomeByCategory.values()].sort((a, b) => b.amount - a.amount),
    };
  }, [entries, categoryById, modeById]);

  const cashOpening  = cashRecon ? Number(cashRecon.opening) : 0;
  const cashClosing  = cashRecon?.actual_closing != null ? Number(cashRecon.actual_closing) : null;
  const cashDiff     = cashRecon ? Number(cashRecon.cash_diff) : 0;
  const derivedSales = cashRecon ? Number(cashRecon.derived_sales) : 0;
  const cashBalanced = cashClosing != null && Math.abs(cashDiff) < 0.01;
  const cashShort    = cashClosing != null && cashDiff < -0.01;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 print:bg-white">
      {/* Header (hidden on print) */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" /> Daily Report
            </h1>
          </div>
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-50" title="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4 print:py-2 print:space-y-3">
        {/* Date picker — visible always; print-friendly */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 print:border-0 print:p-0 print:bg-transparent">
          <div className="flex items-center gap-2 print:hidden">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            <button onClick={() => setDate(todayISO())} className="text-sm text-emerald-700 hover:text-emerald-800 px-2 py-1">Today</button>
          </div>
          <div className="hidden print:block w-full text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500">Shree Shyam Pharmacy · Daily Report</div>
            <h1 className="text-2xl font-bold text-gray-900">{fmtDate(date)}</h1>
          </div>
          <div className="text-xs text-gray-500 ml-auto print:hidden">
            {fmtDate(date)}
          </div>
        </div>

        {/* Cash status banner */}
        {cashClosing == null ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex items-center gap-2 print:hidden">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <div>
              <strong>Cash drawer not counted yet for this day.</strong> Total Sales below may be incomplete since the auto-derived cash sales won&apos;t appear.
              <Link href="/manager/daily-book" className="ml-2 underline text-amber-900">Enter closing balance →</Link>
            </div>
          </div>
        ) : cashShort ? (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <strong>Cash Short ₹{fmtINR(Math.abs(cashDiff))}</strong>
            <span>— actual cash counted is less than what was expected based on opening + sales − expenses.</span>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <strong>Cash drawer balanced.</strong>
            <span>Closing balance ₹{fmtINR(cashClosing)} matches expected.</span>
          </div>
        )}

        {/* === ACCOUNT BALANCES — opening / movement / closing per account === */}
        {balances.length > 0 && (
          <Card icon={Wallet} iconColor="text-indigo-600" headerBg="bg-indigo-50/50"
                title="Account Balances · Opening → Closing">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left  px-4 py-2 font-semibold text-gray-700">Account</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-700">Opening Balance</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-700">Net Change Today</th>
                    <th className="text-right px-4 py-2 font-semibold text-gray-700">Closing Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => {
                    const opening = Number(b.opening_today);
                    const closing = Number(b.closing_today);
                    const net = closing - opening;
                    const netPositive = net >= 0;
                    const closingNeg = closing < 0;
                    const isCash = b.account_kind === 'cash';
                    return (
                      <tr key={b.account_id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {isCash ? '💵' : '🏦'} {b.account_name}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">
                          ₹{fmtINR(opening)}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                          net === 0 ? 'text-gray-400' : netPositive ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {net === 0 ? '—' : `${netPositive ? '+' : '−'}₹${fmtINR(Math.abs(net))}`}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                          closingNeg ? 'text-rose-700' : 'text-gray-900'
                        }`}>
                          ₹{fmtINR(closing)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="bg-indigo-50 border-t-2 border-indigo-200 font-bold">
                    <td className="px-4 py-2.5 text-indigo-900">TOTAL across all accounts</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-indigo-900">
                      ₹{fmtINR(balances.reduce((s, b) => s + Number(b.opening_today), 0))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-indigo-900">
                      {(() => {
                        const totalNet = balances.reduce((s, b) => s + (Number(b.closing_today) - Number(b.opening_today)), 0);
                        return `${totalNet >= 0 ? '+' : '−'}₹${fmtINR(Math.abs(totalNet))}`;
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-indigo-900">
                      ₹{fmtINR(balances.reduce((s, b) => s + Number(b.closing_today), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="bg-gray-50 px-4 py-2 text-[11px] text-gray-600 border-t border-gray-200">
                💡 Closing Balance of {date} becomes Opening Balance of the next day automatically.
              </div>
            </div>
          </Card>
        )}

        {/* HERO: Total Sales */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-6 text-white shadow-lg print:bg-emerald-700 print:shadow-none">
          <div className="text-xs uppercase tracking-wider text-emerald-100 font-semibold mb-1">
            💰 Total Business Sales (all modes)
          </div>
          <div className="text-4xl sm:text-5xl font-bold tabular-nums">
            ₹{fmtINR0(report.bizIncomeTotal)}
          </div>
          <div className="text-sm text-emerald-100 mt-1">
            Cash, UPI/QR, Online, POS Card, Cheque — combined
            {report.refundIn > 0 && (
              <span className="ml-2 text-xs">· includes ₹{fmtINR0(report.refundIn)} refunds from suppliers</span>
            )}
          </div>
          {cashClosing != null && derivedSales > 0 && (
            <div className="mt-3 text-xs bg-emerald-600/50 rounded px-3 py-1.5 inline-block">
              🟢 Auto-derived from closing balance: <strong>₹{fmtINR0(derivedSales)}</strong>
            </div>
          )}
        </div>

        {/* Sales by Mode + Sales by Category — side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card icon={CreditCard} iconColor="text-cyan-600" headerBg="bg-cyan-50/40" title="Sales by Payment Mode">
            {report.salesByMode.length === 0 ? (
              <Empty>No sales recorded</Empty>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {report.salesByMode.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5 text-gray-800">💳 {m.name} <span className="text-xs text-gray-400">×{m.count}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                        +₹{fmtINR(m.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500 w-16">
                        {((m.amount / report.bizIncomeTotal) * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-cyan-50 border-t-2 border-cyan-200 font-bold">
                    <td className="px-4 py-2.5 text-cyan-900">TOTAL</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-cyan-900">+₹{fmtINR(report.bizIncomeTotal)}</td>
                    <td className="px-4 py-2.5"></td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>

          <Card icon={Tags} iconColor="text-emerald-600" headerBg="bg-emerald-50/40" title="Sales by Category">
            {report.salesByCategory.length === 0 ? (
              <Empty>No sales recorded</Empty>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {report.salesByCategory.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5 text-gray-800">📁 {c.name} <span className="text-xs text-gray-400">×{c.count}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">+₹{fmtINR(c.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold">
                    <td className="px-4 py-2.5 text-emerald-900">TOTAL</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-900">+₹{fmtINR(report.bizIncomeTotal)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* Expenses — Business + Personal */}
        <Card icon={Receipt} iconColor="text-rose-600" headerBg="bg-rose-50/40"
              title="Expenses Today"
              right={<span className="text-rose-700 font-bold tabular-nums">−₹{fmtINR(report.totalExpense)}</span>}>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            <div className="p-3">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Business</span>
                <span className="tabular-nums text-amber-800">−₹{fmtINR(report.bizExpenseTotal)}</span>
              </div>
              {report.bizExpenseByCategory.length === 0 ? (
                <div className="text-xs text-gray-400 italic">no business expenses</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {report.bizExpenseByCategory.map((c) => (
                    <li key={c.id} className="flex items-baseline justify-between">
                      <span className="text-gray-700">{c.name} <span className="text-xs text-gray-400">×{c.count}</span></span>
                      <span className="tabular-nums text-rose-700 font-medium">−₹{fmtINR(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-3">
              <div className="text-xs font-semibold text-violet-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1"><Home className="w-3.5 h-3.5" /> Personal</span>
                <span className="tabular-nums text-violet-800">−₹{fmtINR(report.persExpenseTotal)}</span>
              </div>
              {report.persExpenseByCategory.length === 0 ? (
                <div className="text-xs text-gray-400 italic">no personal expenses</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {report.persExpenseByCategory.map((c) => (
                    <li key={c.id} className="flex items-baseline justify-between">
                      <span className="text-gray-700">{c.name} <span className="text-xs text-gray-400">×{c.count}</span></span>
                      <span className="tabular-nums text-rose-700 font-medium">−₹{fmtINR(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {/* Net P&L */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Total Income</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-700">+₹{fmtINR0(report.totalIncome)}</div>
              <div className="text-[10px] text-gray-500">biz + personal</div>
            </div>
            <div className="border-x border-gray-200">
              <div className="text-xs uppercase tracking-wider text-rose-700 font-semibold">Total Expense</div>
              <div className="text-2xl font-bold tabular-nums text-rose-700">−₹{fmtINR0(report.totalExpense)}</div>
              <div className="text-[10px] text-gray-500">biz + personal</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-600 font-semibold">Net P&amp;L</div>
              <div className={`text-3xl font-bold tabular-nums ${report.netPnL >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {report.netPnL >= 0 ? '+' : '−'}₹{fmtINR0(Math.abs(report.netPnL))}
              </div>
              <div className="text-[10px] text-gray-500">
                Biz {report.netBusiness >= 0 ? '+' : '−'}₹{fmtINR0(Math.abs(report.netBusiness))} ·
                Pers {report.netPersonal >= 0 ? '+' : '−'}₹{fmtINR0(Math.abs(report.netPersonal))}
              </div>
            </div>
          </div>
        </div>

        {/* Personal income (if any) */}
        {report.persIncomeByCategory.length > 0 && (
          <Card icon={Home} iconColor="text-violet-600" headerBg="bg-violet-50/40" title="Personal Income"
                right={<span className="text-emerald-700 font-bold tabular-nums">+₹{fmtINR(report.persIncomeTotal)}</span>}>
            <table className="w-full text-sm">
              <tbody>
                {report.persIncomeByCategory.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 text-gray-800">📁 {c.name} <span className="text-xs text-gray-400">×{c.count}</span></td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">+₹{fmtINR(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Cash drawer reconciliation */}
        <Card icon={Wallet} iconColor="text-amber-600" headerBg="bg-amber-50/40" title="Cash Drawer · Reconciliation">
          <div className="p-4 space-y-2 text-sm max-w-md">
            <Row label="Opening Cash"        value={cashOpening}                                        bold />
            <Row label="+ Manual Cash Sales" value={cashRecon ? Number(cashRecon.manual_sales) : 0}     positive subtle />
            <Row label="+ Derived Cash Sales (auto)" value={derivedSales}                               positive subtle />
            <Row label="+ Non-Sale Cash In"  value={cashRecon ? Number(cashRecon.non_sale_in) : 0}      positive subtle />
            <Row label="+ Refunds (CR.Note)" value={cashRecon ? Number(cashRecon.cr_note_in) : 0}       positive subtle />
            <Row label="+ Transfers In"      value={cashRecon ? Number(cashRecon.deposits_in) : 0}      positive subtle />
            <Row label="− Cash Expenses"     value={cashRecon ? Number(cashRecon.expenses) : 0}         negative subtle />
            <Row label="− Transfers Out"     value={cashRecon ? Number(cashRecon.deposits_out) : 0}     negative subtle />
            <div className="border-t border-dashed border-gray-300 pt-2 flex items-baseline justify-between font-bold">
              <span className="text-gray-900">Closing Cash {cashClosing == null && <span className="text-amber-700 text-xs">(not counted)</span>}</span>
              <span className="tabular-nums text-gray-900">₹{fmtINR(cashClosing ?? Number(cashRecon?.expected_closing ?? 0))}</span>
            </div>
          </div>
        </Card>

        {/* Footer (hidden on print) */}
        <div className="text-xs text-gray-500 text-center pt-2 print:hidden">
          Daily Report · generated {new Date().toLocaleString('en-IN')}
        </div>
        <div className="hidden print:block text-xs text-gray-500 text-center pt-4 border-t border-gray-200 mt-4">
          Generated by Shree Shyam Pharmacy Daily Book
        </div>
      </main>
    </div>
  );
}

// --- Small reusable components ---
function Card({
  title, icon: Icon, iconColor, headerBg, right, children,
}: {
  title: string;
  icon: typeof Receipt;
  iconColor: string;
  headerBg: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden print:break-inside-avoid">
      <div className={`px-4 py-2.5 border-b border-gray-200 ${headerBg} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <div className="font-semibold text-gray-900 text-sm">{title}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-gray-400 text-sm">{children}</div>;
}

function Row({
  label, value, positive, negative, subtle, bold,
}: { label: string; value: number; positive?: boolean; negative?: boolean; subtle?: boolean; bold?: boolean }) {
  const cls = value === 0
    ? 'text-gray-400'
    : negative ? 'text-rose-700'
    : positive ? 'text-emerald-700'
    : 'text-gray-900';
  const sign = negative ? '−' : '';
  return (
    <div className={`flex items-baseline justify-between ${subtle ? 'text-xs' : ''}`}>
      <span className={subtle ? 'text-gray-600' : `text-gray-800 ${bold ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${cls}`}>
        {value === 0 ? '—' : `${sign}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`}
      </span>
    </div>
  );
}
