'use client';

import Link from 'next/link';
import { useManagerAuth } from '@/components/ManagerAuthProvider';
import {
  BookOpen,
  Calculator,
  Landmark,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  Wallet,
  Tags,
  CreditCard,
  Scale,
  BarChart3,
  FileText,
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
    desc: 'Log every IN/OUT — business or personal, by mode & category.',
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
    href: '/manager/daily-book/daily-report',
    title: 'Daily Report',
    desc: 'Pick a date → Total Sales, expenses, P&L, cash drawer status. Printable.',
    icon: BarChart3,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    href: '/manager/daily-book/cash-log',
    title: 'Cash Log',
    desc: 'Multi-day cash history: opening, closing, derived sales, totals.',
    icon: Scale,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
  },
  {
    href: '/manager/cheques',
    title: 'Cheques',
    desc: 'Issued cheques + online transfers. Auto-creates linked expense entries on Cleared / Deposited.',
    icon: FileText,
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
  },
  {
    href: '/manager/daily-book/banks',
    title: 'Bank Ledgers',
    desc: 'Running balance per account with full day-by-day ledger.',
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
    href: '/manager/daily-book/categories',
    title: 'Categories',
    desc: 'Manage 4 buckets: biz-in, biz-out, personal-in, personal-out.',
    icon: Tags,
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
  },
  {
    href: '/manager/daily-book/modes',
    title: 'Payment Modes',
    desc: 'Manage Cash, UPI, Online Banking, POS Card, Cheque, etc.',
    icon: CreditCard,
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
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
