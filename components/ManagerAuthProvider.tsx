'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ManagerAuthContextType {
  isAuthenticated: boolean;
  /** Returns true on success, false on bad password, throws on network/server error. */
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const ManagerAuthContext = createContext<ManagerAuthContextType | null>(null);

// Session duration in milliseconds (12 hours — shorter than staff for extra safety)
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const SESSION_KEY = 'pharmacy_manager_session';

export function ManagerAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const { expiry } = JSON.parse(session);
        if (typeof expiry === 'number' && Date.now() < expiry) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  /**
   * Calls /api/login with tier='manager'. The MANAGER_PASSWORD env var is
   * checked server-side; nothing about it ships in the JS bundle.
   */
  const login = async (password: string): Promise<boolean> => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, tier: 'manager' }),
    });
    if (res.status === 401) return false;
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error || 'Login failed');
    }
    const session = { expiry: Date.now() + SESSION_DURATION };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setIsAuthenticated(true);
    return true;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <ManagerAuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </ManagerAuthContext.Provider>
  );
}

export function useManagerAuth() {
  const context = useContext(ManagerAuthContext);
  if (!context) {
    throw new Error('useManagerAuth must be used within ManagerAuthProvider');
  }
  return context;
}
