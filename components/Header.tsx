'use client';

import { PHARMACY_INFO } from '@/lib/constants';
import { Pill, Menu, X, LogOut } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout } = useAuth();

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-sm">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-gray-900">
                {PHARMACY_INFO.name}
              </h1>
              <p className="text-xs text-gray-500 hidden sm:block">
                {PHARMACY_INFO.tagline}
              </p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/" 
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Dashboard
            </Link>
            <Link 
              href="/customers" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              All Customers
            </Link>
            <Link 
              href="/history" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              History
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-gray-600" />
            ) : (
              <Menu className="w-6 h-6 text-gray-600" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100">
            <nav className="flex flex-col gap-2">
              <Link 
                href="/" 
                className="px-3 py-2 rounded-lg text-sm font-medium text-primary-600 bg-primary-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link 
                href="/customers" 
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                All Customers
              </Link>
              <Link 
                href="/history" 
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                History
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 text-left flex items-center gap-2"
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
