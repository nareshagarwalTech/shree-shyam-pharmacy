'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  supabase,
  Account,
  CashDenomination,
  DailyEntry,
} from '@/lib/supabase';
import { ArrowLeft, Calculator, Save, Calendar, CheckCircle2 } from 'lucide-react';

const DENOMS: { value: 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1; label: string; kind: 'note' | 'coin' }[] = [
  { value: 500, label: '₹ 500',  kind: 'note' },
  { value: 200, label: '₹ 200',  kind: 'note' },
  { value: 100, label: '₹ 100',  kind: 'note' },
  { value: 50,  label: '₹ 50',   kind: 'note' },
  { value: 20,  label: '₹ 20',   kind: 'note' },
  { value: 10,  label: '₹ 10',   kind: 'note' },
  { value: 5,   label: '₹ 5',    kind: 'coin' },
  { value: 2,   label: '₹ 2',    kind: 'coin' },
  { value: 1,   label: '₹ 1',    kind: 'coin' },
];

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export default function DenominationPage() {
  const [date, setDate] = useState(todayISO());
  const [counts, setCounts] = useState<Record<number, string>>({});  // string for controlled input
  const [cashAccount, setCashAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load CASH account + any existing denomination breakdown for the date
  const load = useCallback(async () => {
    const [acc, denoms] = await Promise.all([
      supabase.from('accounts').select('*').eq('kind', 'cash').limit(1).single(),
      supabase.from('cash_denominations').select('*').eq('count_date', date),
    ]);
    if (acc.data) setCashAccount(acc.data as Account);
    const map: Record<number, string> = {};
    for (const d of (denoms.data ?? []) as CashDenomination[]) {
      map[d.denomination] = String(d.count);
    }
    setCounts(map);
    setSavedAt(null);
    setError(null);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return DENOMS.map((d) => {
      const count = parseInt(counts[d.value] ?? '0', 10) || 0;
      return { ...d, count, total: count * d.value };
    });
  }, [counts]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  const handleSave = async () => {
    setError(null);
    if (!cashAccount) { setError('CASH account not configured.'); return; }
    if (grandTotal <= 0) { setError('Enter at least one denomination count.'); return; }

    setSaving(true);
    try {
      // 1. Create the CASH COUNT daily_entry
      const { data: entryData, error: entryErr } = await supabase
        .from('daily_entries')
        .insert({
          entry_date: date,
          entry_type: 'cash_count',
          narration: 'CLOSING BALANCE',
          txn_amount: grandTotal,
          account_id: cashAccount.id,
        })
        .select('id')
        .single();
      if (entryErr) throw new Error(entryErr.message);

      const dailyEntryId = (entryData as Pick<DailyEntry, 'id'>).id;

      // 2. Upsert each denomination row (one per denom per date)
      const denomRows = rows
        .filter((r) => r.count > 0)
        .map((r) => ({
          count_date: date,
          denomination: r.value,
          count: r.count,
          daily_entry_id: dailyEntryId,
        }));

      // Delete prior rows for this date first (replace, don't merge)
      await supabase.from('cash_denominations').delete().eq('count_date', date);
      if (denomRows.length) {
        const { error: dErr } = await supabase.from('cash_denominations').insert(denomRows);
        if (dErr) throw new Error(dErr.message);
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-white to-orange-50/40">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/manager" className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-amber-600 font-semibold">Manager · Daily Book</div>
            <h1 className="font-display font-bold text-gray-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-600" /> Denomination Counter
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
          <button
            onClick={() => setDate(todayISO())}
            className="text-sm text-amber-600 hover:text-amber-700 px-2 py-1"
          >
            Today
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider">Denomination</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider">Count</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.value} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-gray-800">{r.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{r.kind}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={counts[r.value] ?? ''}
                      onChange={(e) => setCounts((c) => ({ ...c, [r.value]: e.target.value }))}
                      placeholder="0"
                      className="w-24 px-3 py-1.5 text-right border border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                    {r.total > 0 ? `₹${fmtINR(r.total)}` : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
              <tr className="bg-amber-50 border-t-2 border-amber-200">
                <td className="px-4 py-3 font-bold text-amber-900" colSpan={2}>TOTAL</td>
                <td className="px-4 py-3 text-right font-bold text-amber-900 text-lg">
                  ₹{fmtINR(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
            {error}
          </div>
        )}

        {savedAt && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Saved at {savedAt} — created a CASH COUNT entry for ₹{fmtINR(grandTotal)} on {date}.
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/manager/daily-book"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Back to Daily Book
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || grandTotal === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save as CASH COUNT'}
          </button>
        </div>
      </main>
    </div>
  );
}
