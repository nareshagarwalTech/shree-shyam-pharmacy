'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Cheque,
  Party,
  ChequeDepositScheduleRow,
} from '@/lib/supabase';
import { formatDate, todayISO } from '@/lib/utils';
import Toast from '@/components/Toast';
import {
  ArrowLeft,
  Calendar,
  Banknote,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Download,
  Wallet,
  TrendingUp,
} from 'lucide-react';

type Mode = 'on_or_before' | 'on_date' | 'date_range';

export default function DepositScheduleReport() {
  const [rows, setRows] = useState<ChequeDepositScheduleRow[]>([]);
  const [parties, setParties] = useState<Map<string, Party>>(new Map());
  const [loading, setLoading] = useState(true);

  // Date controls
  const [mode, setMode] = useState<Mode>('on_or_before');
  const [pickDate, setPickDate] = useState<string>(todayISO());
  const [endDate, setEndDate] = useState<string>(todayISO());

  const [bankBalance, setBankBalance] = useState<number>(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const [s, p] = await Promise.all([
      supabase.from('cheque_deposit_schedule').select('*').order('deposit_date'),
      supabase.from('parties').select('*'),
    ]);
    if (s.error) setToast({ message: s.error.message, type: 'error' });
    else setRows((s.data || []) as ChequeDepositScheduleRow[]);
    if (p.data) {
      const map = new Map<string, Party>();
      (p.data as Party[]).forEach((x) => map.set(x.id, x));
      setParties(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filter the schedule rows by the chosen mode + date(s)
  const filteredRows = useMemo(() => {
    if (mode === 'on_date') {
      return rows.filter((r) => r.deposit_date === pickDate);
    }
    if (mode === 'date_range') {
      const from = pickDate;
      const to = endDate;
      return rows.filter((r) => r.deposit_date >= from && r.deposit_date <= to);
    }
    // on_or_before
    return rows.filter((r) => r.deposit_date <= pickDate);
  }, [rows, mode, pickDate, endDate]);

  // Flatten cheques for the detail list
  const detailCheques = useMemo(() => {
    const out: Array<ChequeDepositScheduleRow['cheques'][number] & { deposit_date: string }> = [];
    for (const r of filteredRows) {
      for (const c of r.cheques || []) {
        out.push({ ...c, deposit_date: r.deposit_date });
      }
    }
    out.sort((a, b) => a.deposit_date.localeCompare(b.deposit_date) || b.amount - a.amount);
    return out;
  }, [filteredRows]);

  const totals = useMemo(() => ({
    cheque_count: filteredRows.reduce((s, r) => s + Number(r.cheque_count || 0), 0),
    amount:       filteredRows.reduce((s, r) => s + Number(r.total_amount || 0), 0),
    days:         filteredRows.length,
  }), [filteredRows]);

  const balanceAfter = bankBalance - totals.amount;

  const exportCsv = () => {
    const headers = ['Deposit Date', 'Cheque Date', 'Party', 'Cheque No.', 'Amount', 'Status'];
    const lines = [headers.join(',')];
    for (const c of detailCheques) {
      lines.push([
        c.deposit_date,
        '',
        `"${c.party_name.replace(/"/g, '""')}"`,
        c.is_online ? 'ONLINE' : (c.cheque_no ?? ''),
        c.amount,
        c.status,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deposit-schedule-${pickDate}.csv`;
    a.click();
  };

  const presetToday    = () => { setMode('on_or_before'); setPickDate(todayISO()); };
  const presetTomorrow = () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    setMode('on_or_before'); setPickDate(d.toISOString().slice(0, 10));
  };
  const presetThisWeek = () => {
    const start = new Date();
    const end = new Date(); end.setDate(end.getDate() + 7);
    setMode('date_range');
    setPickDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager/cheques" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Manager · Cheques · Deposits</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" /> Deposit Schedule
            </h1>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-sm text-gray-500 mb-4">
          Pick a date to see all the cheques pending deposit on that day —
          so you know how much money needs to be in the bank.
        </p>

        {/* Date picker controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-6">
          {/* Mode pills */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-3 overflow-x-auto">
            <ModeBtn current={mode} value="on_or_before" onSelect={setMode}>On or before</ModeBtn>
            <ModeBtn current={mode} value="on_date"      onSelect={setMode}>On date</ModeBtn>
            <ModeBtn current={mode} value="date_range"   onSelect={setMode}>Date range</ModeBtn>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {mode === 'date_range' ? 'From date' : mode === 'on_date' ? 'Date' : 'Up to date'}
              </label>
              <input
                type="date"
                value={pickDate}
                onChange={(e) => setPickDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            {mode === 'date_range' && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">To date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            )}
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-gray-500">Quick:</span>
            <button onClick={presetToday}    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 hover:bg-gray-50">Today</button>
            <button onClick={presetTomorrow} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 hover:bg-gray-50">By tomorrow</button>
            <button onClick={presetThisWeek} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 hover:bg-gray-50">Next 7 days</button>
            <button onClick={exportCsv}      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* Headline: how much do you need? */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
          <div className="lg:col-span-2 rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-sm font-medium text-amber-700 uppercase tracking-wide">
                  Amount needed in the bank
                </div>
                <div className="text-3xl sm:text-4xl font-display font-bold text-amber-900 mt-0.5 break-words">
                  ₹{totals.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-amber-700/80 mt-1.5 leading-snug">
                  {totals.cheque_count} cheque{totals.cheque_count === 1 ? '' : 's'} pending on {totals.days} {totals.days === 1 ? 'day' : 'days'}
                  {' · '}
                  {mode === 'on_date'      && <>only on {formatDate(pickDate)}</>}
                  {mode === 'on_or_before' && <>on or before {formatDate(pickDate)}</>}
                  {mode === 'date_range'   && <>between {formatDate(pickDate)} and {formatDate(endDate)}</>}
                </div>
              </div>
            </div>
          </div>

          {/* Bank balance projection */}
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-4 h-4 text-emerald-700" />
              <span className="text-xs sm:text-sm font-medium text-emerald-700 uppercase tracking-wide">
                Bank balance check
              </span>
            </div>
            <input
              type="number"
              placeholder="Enter current balance"
              value={bankBalance || ''}
              onChange={(e) => setBankBalance(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-emerald-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 mb-2"
            />
            {bankBalance > 0 && (
              <div className={`mt-1 text-xs leading-snug ${balanceAfter >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                After deposits:
                <div className={`text-xl font-display font-bold mt-0.5 ${balanceAfter >= 0 ? 'text-emerald-900' : 'text-red-700'}`}>
                  ₹{balanceAfter.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                {balanceAfter < 0 && (
                  <div className="flex items-center gap-1 text-red-700 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Short by ₹{Math.abs(balanceAfter).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* By-day breakdown */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">Nothing pending in this window</h3>
            <p className="text-gray-500 text-sm">No cheques or online transfers are awaiting deposit on the selected date(s).</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRows.map((r) => (
              <div key={r.deposit_date} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-display font-semibold text-gray-900">{formatDate(r.deposit_date)}</h3>
                    <span className="text-xs text-gray-500">
                      {r.cheque_count} {r.cheque_count === 1 ? 'cheque' : 'cheques'}
                    </span>
                  </div>
                  <div className="text-base font-display font-bold text-amber-700">
                    ₹{Number(r.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <ul className="divide-y divide-gray-100">
                  {(r.cheques || []).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{c.party_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                          {c.is_online ? (
                            <span className="inline-flex items-center gap-1 text-cyan-700 font-medium">
                              <CreditCard className="w-3 h-3" /> ONLINE
                            </span>
                          ) : (
                            <span className="font-mono">#{c.cheque_no}</span>
                          )}
                          <span className="text-gray-300">·</span>
                          <span className={
                            c.status === 'pending' ? 'text-amber-700' : 'text-blue-700'
                          }>
                            {c.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-display font-semibold text-gray-900">
                        ₹{Number(c.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Footer total */}
            <div className="bg-gray-100 border-2 border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Total across {totals.days} {totals.days === 1 ? 'day' : 'days'}
              </div>
              <div className="text-xl font-display font-bold text-gray-900">
                ₹{totals.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function ModeBtn({
  current, value, onSelect, children,
}: {
  current: Mode; value: Mode; onSelect: (m: Mode) => void; children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
        active ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
