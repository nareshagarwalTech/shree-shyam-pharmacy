'use client';

import { useState } from 'react';
import { useManagerAuth } from './ManagerAuthProvider';
import { ShieldCheck, Eye, EyeOff, Lock, AlertCircle } from 'lucide-react';
import { PHARMACY_INFO } from '@/lib/constants';

export default function ManagerLoginScreen() {
  const { login } = useManagerAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(password);
      if (!success) {
        setError('Incorrect manager password. Please try again.');
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Try again or contact admin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900">
            {PHARMACY_INFO.name}
          </h1>
          <p className="text-gray-500 mt-1">Manager Console</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <Lock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Manager Login</h2>
              <p className="text-sm text-gray-500">Restricted area — manager password required</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Manager Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter manager password"
                  className={`
                    w-full px-4 py-3 rounded-xl border pr-12
                    ${error ? 'border-red-300 focus:border-red-500' : 'border-gray-200 focus:border-indigo-500'}
                    focus:ring-2 focus:ring-indigo-100 transition-all
                  `}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!password || isLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Verifying...
                </span>
              ) : (
                'Login as Manager'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          Looking for staff dashboard?{' '}
          <a href="/dashboard" className="text-indigo-600 hover:text-indigo-700 underline">
            Go to /dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
