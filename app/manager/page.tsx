'use client';

import Link from 'next/link';
import { useManagerAuth } from '@/components/ManagerAuthProvider';
import {
  BookOpen,
  Calculator,
  TrendingUp,
  Receipt,
  Landmark,
  Upload,
  Scale,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  Wallet,
} from 'lucide-react';
import { PHARMACY_INFO } from '@/lib/constants';

interface Tile {
  href: string;
  title: string;
  desc: string;
  icon: typeof BookOpen;
  iconBg: string;
  iconColor: string;
}

const TILES: Tile[] = [
  {
    href: '/manager/daily-book',
    title: 'Daily Entry',
    desc: 'Record sales, expenses, cash counts, bank transfers.',
    icon: BookOpen,
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  {
    href: '/manager/daily-book/denomination',
    title: 'Denomination Counter',
    desc: 'Count physical cash by note/coin. Saves a CASH COUNT entry.',
    icon: Calculator,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    href: '/manager/daily-book/sales-summary',
    title: 'Sales Summary',
    desc: 'Daily totals by channel — POS, QR, Online, Credit, Cash.',
    icon: TrendingUp,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    href: '/manager/daily-book/expense-summary',
    title: 'Expense Summary',
    desc: 'Daily breakdown by category — purchase, salary, rent, etc.',
    icon: Receipt,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    href: '/manager/daily-book/closing-balance',
    title: 'Closing Balance',
    desc: 'Daily cash reconciliation — opening + sales − expenses vs actual count.',
    icon: Scale,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    href: '/manager/daily-book/banks',
    title: 'Bank Ledgers',
    desc: 'Running balance per bank account with full ledger.',
    icon: Landmark,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    href: '/manager/daily-book/accounts',
    title: 'Accounts & Opening',
    desc: 'Set per-account inception + monthly opening balances.',
    icon: Wallet,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    href: '/manager/daily-book/import',
    title: 'Import Excel',
    desc: 'Bulk-import past DAILYBOOK_SSP_*.xlsx files into the database.',
    icon: Upload,
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
  },
  {
    href: '/manager/daily-book/reconciliation',
    title: 'Reconciliation',
    desc: 'Compare daily book sales vs customer-payments table. Spot mismatches.',
    icon: ShieldCheck,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
  },
];

export default function ManagerHomePage() {
  const { logout } = useManagerAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/40">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-indigo-600 font-semibold">
                Manager Console
              </div>
              <div className="font-display font-bold text-gray-900">
                {PHARMACY_INFO.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Staff Dashboard
            </Link>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900">
            Daily Book
          </h1>
          <p className="text-gray-600 mt-1">
            Manage daily operations, sales, expenses, and bank ledgers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.href}
                href={tile.href}
                className="group bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className={`w-11 h-11 ${tile.iconBg} rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 ${tile.iconColor}`} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{tile.title}</h3>
                <p className="text-sm text-gray-500 leading-snug">{tile.desc}</p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
