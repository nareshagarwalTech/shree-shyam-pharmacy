'use client';

import { PHARMACY_INFO } from '@/lib/constants';
import {
  Pill,
  Menu,
  X,
  LogOut,
  Home,
  Users,
  History,
  LayoutDashboard,
  Tags,
  Upload,
  Receipt,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  TrendingUp,
  MessageCircle,
  MessageSquareText,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const PRIMARY = [
  { href: '/dashboard',                label: 'Home',       icon: LayoutDashboard },
  { href: '/dashboard/deliveries',     label: 'Deliveries', icon: Receipt },
  { href: '/dashboard/whatsapp',       label: 'WhatsApp',   icon: MessageCircle },
  { href: '/dashboard/pending',        label: 'Pending',    icon: AlertTriangle },
  { href: '/dashboard/reports',        label: 'Reports',    icon: TrendingUp },
];

const MORE = [
  { href: '/dashboard/customers',          label: 'Customers',          icon: Users },
  { href: '/dashboard/top-customers',      label: 'Top Customers',      icon: TrendingUp },
  { href: '/dashboard/daily-summary',      label: 'Daily Collection',   icon: BarChart3 },
  { href: '/dashboard/monthly-summary',    label: 'Monthly Collection', icon: BarChart3 },
  { href: '/dashboard/aging',              label: 'Aging Report',       icon: AlertTriangle },
  { href: '/dashboard/groups',             label: 'Groups',             icon: Tags },
  { href: '/dashboard/sales-upload',       label: 'Upload Sales',       icon: Upload },
  { href: '/dashboard/history',            label: 'WhatsApp Log',       icon: History },
  { href: '/dashboard/settings/templates', label: 'Message Templates',  icon: MessageSquareText },
  { href: '/',                             label: 'Public site',        icon: Home },
];

export default function DashboardHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { logout } = useAuth();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) logout();
  };

  const linkClass = (href: string) => {
    const active =
      href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname?.startsWith(href);
    return `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
      active
        ? 'text-emerald-700 bg-emerald-50'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-sm">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-gray-900 leading-tight">{PHARMACY_INFO.name}</h1>
              <p className="text-xs text-emerald-600">Staff Dashboard</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {PRIMARY.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                  <Icon className="w-4 h-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}

            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                More <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  {MORE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => setMoreOpen(false)}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            {mobileMenuOpen ? <X className="w-6 h-6 text-gray-600" /> : <Menu className="w-6 h-6 text-gray-600" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-gray-100">
            <nav className="flex flex-col gap-1">
              {[...PRIMARY, ...MORE].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClass(item.href).replace('px-2.5', 'px-3').replace('py-1.5', 'py-2')}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 text-left"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
