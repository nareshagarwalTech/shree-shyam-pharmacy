'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';
import {
  Calendar,
  CalendarRange,
  Hourglass,
  AlertTriangle,
  TrendingUp,
  Users,
  Receipt,
  History,
  ArrowRight,
  MessageCircle,
} from 'lucide-react';

interface Snapshot {
  outstandingTotal: number;
  pendingCustomers: number;
  todayCollected: number;
  todayBills: number;
  thisMonthCollected: number;
  thisMonthBills: number;
  totalCustomers: number;
  totalBills: number;
}

export default function ReportsHubPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    Promise.all([
      supabase.from('pending_dues').select('outstanding'),
      supabase.from('daily_collection').select('*').eq('date', today).maybeSingle(),
      supabase.from('monthly_collection').select('*').gte('month', monthStart).order('month', { ascending: false }).limit(1),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('sales_transactions').select('id', { count: 'exact', head: true }),
    ]).then(([pending, today, month, custCount, salesCount]) => {
      const monthRow = month.data?.[0];
      setSnap({
        outstandingTotal: (pending.data || []).reduce((s: number, r: any) => s + Number(r.outstanding || 0), 0),
        pendingCustomers: (pending.data || []).length,
        todayCollected: Number(today.data?.total_collected || 0),
        todayBills: Number(today.data?.bills_paid || 0),
        thisMonthCollected: Number(monthRow?.total_collected || 0),
        thisMonthBills: Number(monthRow?.bills_paid || 0),
        totalCustomers: custCount.count || 0,
        totalBills: salesCount.count || 0,
      });
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Reports
          </h1>
          <p className="text-sm text-gray-500">All your business numbers in one place.</p>
        </div>

        {/* Snapshot tiles */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center mb-6">
            <div className="spinner mx-auto" />
          </div>
        ) : snap && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Snap label="Outstanding" value={`₹${snap.outstandingTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub={`${snap.pendingCustomers} customers`} color="red" />
            <Snap label="Today" value={`₹${snap.todayCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub={`${snap.todayBills} bills paid`} color="emerald" />
            <Snap label="This Month" value={`₹${snap.thisMonthCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub={`${snap.thisMonthBills} bills paid`} color="cyan" />
            <Snap label="Customer Base" value={String(snap.totalCustomers)} sub={`${snap.totalBills} total bills`} color="indigo" />
          </div>
        )}

        {/* Reports list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            href="/dashboard/whatsapp"
            icon={<MessageCircle className="w-6 h-6" />}
            title="WhatsApp Center ⭐"
            desc="Send reminders manually via wa.me. Mark sent + filter remaining. Daily-use page."
            color="emerald"
          />
          <ReportCard
            href="/dashboard/daily-summary"
            icon={<Calendar className="w-6 h-6" />}
            title="Daily Collection"
            desc="Money in per day. Cash vs online, same-day vs old-due breakdown."
            color="emerald"
          />
          <ReportCard
            href="/dashboard/monthly-summary"
            icon={<CalendarRange className="w-6 h-6" />}
            title="Monthly Collection"
            desc="Month-over-month trend. Average per bill, MoM percentage."
            color="cyan"
          />
          <ReportCard
            href="/dashboard/pending"
            icon={<AlertTriangle className="w-6 h-6" />}
            title="Pending Dues"
            desc="Customers with outstanding balance. One-click WhatsApp reminders."
            color="red"
          />
          <ReportCard
            href="/dashboard/aging"
            icon={<Hourglass className="w-6 h-6" />}
            title="Aging Report"
            desc="How old is each debt? 0-30, 31-60, 61-90, 90+ buckets."
            color="amber"
          />
          <ReportCard
            href="/dashboard/deliveries"
            icon={<Receipt className="w-6 h-6" />}
            title="All Deliveries"
            desc="Every bill ever recorded. Search, filter by paid/pending."
            color="blue"
          />
          <ReportCard
            href="/dashboard/customers"
            icon={<Users className="w-6 h-6" />}
            title="Customer Master"
            desc="332+ customers with groups, opt-out, language preferences."
            color="indigo"
          />
          <ReportCard
            href="/dashboard/history"
            icon={<History className="w-6 h-6" />}
            title="WhatsApp Log"
            desc="Every reminder sent. Delivery / read status. Failed sends."
            color="purple"
          />
        </div>

        <div className="mt-8 bg-white border border-gray-100 rounded-xl p-5">
          <h2 className="font-display font-semibold text-gray-900 mb-3">Quick tips</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>Click any customer name anywhere → lands on their full statement page (bill history + payments).</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>Pending dues / Aging / Daily / Monthly all support <strong>CSV export</strong> — useful for monthly reconciliations.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>From any reminder send button, replies come back to <Link href="/dashboard/history" className="text-emerald-600 hover:underline">WhatsApp Log</Link> once Cloud API is wired in.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>Use <Link href="/dashboard/deliveries/new" className="text-emerald-600 hover:underline font-medium">+ New Delivery</Link> for daily entry. Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 border rounded">Enter</kbd> to Save &amp; New, <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 border rounded">Esc</kbd> to reset.</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}

function Snap({ label, value, sub, color }: { label: string; value: string; sub: string; color: 'red' | 'emerald' | 'cyan' | 'indigo' }) {
  const map: Record<string, string> = {
    red:     'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    cyan:    'bg-cyan-50 border-cyan-200 text-cyan-700',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
      <div className="text-xs opacity-70 mt-1">{sub}</div>
    </div>
  );
}

function ReportCard({ href, icon, title, desc, color }: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: 'emerald' | 'cyan' | 'red' | 'amber' | 'blue' | 'indigo' | 'purple';
}) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    cyan:    'bg-cyan-100 text-cyan-700',
    red:     'bg-red-100 text-red-700',
    amber:   'bg-amber-100 text-amber-700',
    blue:    'bg-blue-100 text-blue-700',
    indigo:  'bg-indigo-100 text-indigo-700',
    purple:  'bg-purple-100 text-purple-700',
  };
  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-gray-100 hover:border-emerald-300 hover:shadow-md transition-all p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${map[color]}`}>{icon}</div>
        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
      </div>
      <h3 className="font-display font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500">{desc}</p>
    </Link>
  );
}
