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
  Megaphone,
  IndianRupee,
  Plus,
  Hourglass,
  Calendar,
  CalendarRange,
  Trophy,
  Settings,
  Wallet,
  Banknote,
  CheckCircle,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

// =============================================================================
// Navigation structure — grouped, with descriptions
// =============================================================================

interface NavItem {
  href: string;
  label: string;
  desc?: string;
  icon: typeof Home;
}

interface NavGroup {
  label: string;
  icon: typeof Home;
  items: NavItem[];
}

const HOME_HREF = '/dashboard';

// Primary CTA — separate from groups for visual emphasis
const NEW_DELIVERY: NavItem = {
  href: '/dashboard/deliveries/new',
  label: 'New Delivery',
  icon: Plus,
};

const GROUPS: NavGroup[] = [
  {
    label: 'WhatsApp',
    icon: MessageCircle,
    items: [
      { href: '/dashboard/whatsapp',                  label: 'WhatsApp Center',   desc: 'Send daily reminders',          icon: MessageCircle },
      { href: '/dashboard/whatsapp/reminder-upload',  label: 'Reminder Upload',   desc: 'Bulk-set refill dates from Excel', icon: Upload },
      { href: '/dashboard/broadcast',                 label: 'Broadcast Offers',  desc: 'Bulk send to groups',           icon: Megaphone },
      { href: '/dashboard/settings/templates',        label: 'Message Templates', desc: 'Edit wording',                  icon: MessageSquareText },
      { href: '/dashboard/history',                   label: 'Sent Log',          desc: 'Audit of all reminders',        icon: History },
    ],
  },
  {
    label: 'Money',
    icon: IndianRupee,
    items: [
      { href: '/dashboard/pending',             label: 'Pending Dues',     desc: 'Customers who owe ₹',      icon: AlertTriangle },
      { href: '/dashboard/aging',               label: 'Aging Report',     desc: '0-30 / 30-60 / 60-90 / 90+', icon: Hourglass },
      { href: '/dashboard/daily-summary',       label: 'Daily Collection', desc: 'Cash + online by date',    icon: Calendar },
      { href: '/dashboard/monthly-summary',     label: 'Monthly Collection', desc: 'Month-over-month trend', icon: CalendarRange },
      { href: '/dashboard/deliveries',          label: 'All Deliveries',   desc: 'Bills + payments list',    icon: Receipt },
    ],
  },
  {
    label: 'Customers',
    icon: Users,
    items: [
      { href: '/dashboard/customers',           label: 'All Customers',    desc: 'Master list',              icon: Users },
      { href: '/dashboard/top-customers',       label: 'Top Customers',    desc: 'Ranked by spend',          icon: Trophy },
      { href: '/dashboard/groups',              label: 'Groups',           desc: 'Tags + segmentation',      icon: Tags },
    ],
  },
  {
    label: 'Cheques',
    icon: Wallet,
    items: [
      { href: '/dashboard/cheques',             label: 'Cheques',          desc: 'Issued cheques + online',     icon: Wallet },
      { href: '/dashboard/cheques/deposits',    label: 'Deposit Schedule', desc: 'What hits the bank when',      icon: Calendar },
      { href: '/dashboard/cheques/parties',     label: 'Parties',          desc: 'Vendors / staff master',      icon: Users },
      { href: '/dashboard/cheques/banks',       label: 'Banks',            desc: 'Bank accounts',                icon: Banknote },
    ],
  },
];

// Right-side overflow menu (low-frequency items)
const SETTINGS_GROUP: NavGroup = {
  label: 'Settings',
  icon: Settings,
  items: [
    { href: '/dashboard/reports',  label: 'Reports Hub',  desc: 'All reports in one place', icon: TrendingUp },
    { href: '/',                   label: 'Public Site',  desc: 'shreeshyampharmacy.com',   icon: Home },
  ],
};

// =============================================================================

export default function DashboardHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { logout } = useAuth();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    if (confirm('Logout?')) logout();
  };

  const isGroupActive = (group: NavGroup) =>
    group.items.some((it) => pathname?.startsWith(it.href) && it.href !== '/');

  const isHomeActive = pathname === HOME_HREF;

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40" ref={containerRef}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-2">

          {/* Logo + brand */}
          <Link href={HOME_HREF} className="flex items-center gap-2 shrink-0 group">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
              <Pill className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="hidden sm:block min-w-0">
              <div className="text-sm font-bold text-gray-900 leading-tight truncate">
                {PHARMACY_INFO.name}
              </div>
              <div className="text-[10px] text-emerald-600 leading-none uppercase tracking-wider">
                Staff
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {/* Home */}
            <Link
              href={HOME_HREF}
              className={navLinkClass(isHomeActive)}
            >
              <LayoutDashboard className="w-4 h-4" />
              Home
            </Link>

            {/* Group dropdowns */}
            {GROUPS.map((g) => {
              const Icon = g.icon;
              const active = isGroupActive(g);
              const open = openGroup === g.label;
              return (
                <div key={g.label} className="relative">
                  <button
                    onClick={() => setOpenGroup(open ? null : g.label)}
                    className={`${navLinkClass(active)} ${open ? 'bg-emerald-50 text-emerald-700' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {g.label}
                    <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <DropdownMenu items={g.items} pathname={pathname || ''} />
                  )}
                </div>
              );
            })}
          </nav>

          {/* Right side: New Delivery CTA + settings + logout */}
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={NEW_DELIVERY.href}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-md text-sm shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">New Delivery</span>
              <span className="md:hidden">New</span>
            </Link>

            {/* Settings dropdown (desktop only) */}
            <div className="relative hidden lg:block">
              <button
                onClick={() => setOpenGroup(openGroup === SETTINGS_GROUP.label ? null : SETTINGS_GROUP.label)}
                className={navLinkClass(false)}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              {openGroup === SETTINGS_GROUP.label && (
                <DropdownMenu items={SETTINGS_GROUP.items} pathname={pathname || ''} alignRight onLogout={handleLogout} />
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-md hover:bg-gray-100"
              aria-label="Open menu"
            >
              {mobileOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 py-2 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            {/* Home */}
            <Link
              href={HOME_HREF}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                isHomeActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Home
            </Link>

            {/* Groups */}
            {GROUPS.map((g) => (
              <div key={g.label} className="mt-2">
                <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <g.icon className="w-3 h-3" />
                  {g.label}
                </div>
                {g.items.map((it) => {
                  const active = pathname?.startsWith(it.href) && it.href !== '/';
                  const ItemIcon = it.icon;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                        active ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <ItemIcon className="w-4 h-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{it.label}</div>
                        {it.desc && <div className="text-[10px] text-gray-500 truncate">{it.desc}</div>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}

            {/* Settings */}
            <div className="mt-2 border-t border-gray-100 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <Settings className="w-3 h-3" />
                Settings
              </div>
              {SETTINGS_GROUP.items.map((it) => {
                const ItemIcon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <ItemIcon className="w-4 h-4 shrink-0" />
                    {it.label}
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 mt-1"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ============================================================================

function navLinkClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
    active
      ? 'text-emerald-700 bg-emerald-50'
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
  }`;
}

interface DropdownProps {
  items: NavItem[];
  pathname: string;
  alignRight?: boolean;
  onLogout?: () => void;
}

function DropdownMenu({ items, pathname, alignRight, onLogout }: DropdownProps) {
  return (
    <div
      className={`absolute top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 z-50 ${
        alignRight ? 'right-0' : 'left-0'
      }`}
    >
      {items.map((it) => {
        const active = pathname?.startsWith(it.href) && it.href !== '/';
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 ${
              active ? 'bg-emerald-50' : ''
            }`}
          >
            <div className={`mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
              active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium truncate ${active ? 'text-emerald-700' : 'text-gray-900'}`}>
                {it.label}
              </div>
              {it.desc && (
                <div className="text-[11px] text-gray-500 truncate">{it.desc}</div>
              )}
            </div>
          </Link>
        );
      })}
      {onLogout && (
        <>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={onLogout}
            className="w-full text-left flex items-start gap-2.5 px-3 py-2 hover:bg-red-50"
          >
            <div className="mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-red-100 text-red-600">
              <LogOut className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-red-600">Logout</div>
              <div className="text-[11px] text-gray-500">End session</div>
            </div>
          </button>
        </>
      )}
    </div>
  );
}
