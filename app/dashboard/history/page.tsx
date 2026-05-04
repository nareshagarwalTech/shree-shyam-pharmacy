'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import DashboardHeader from '@/components/DashboardHeader';
import { MessageCircle, Phone, Calendar, Clock, Receipt, Search, Download } from 'lucide-react';

interface ReminderLog {
  id: string;
  customer_name: string;
  phone: string;
  feed_no: string | null;
  feed_date: string | null;
  channel: string;
  send_method: string;
  status: string;
  template_language: string;
  sent_at: string;
  created_at: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('reminders')
      .select(`
        id, channel, send_method, status, template_language, sent_at, created_at,
        customers ( name, phone ),
        sales_transactions ( feed_no, feed_date )
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (dateFilter === 'today') {
      query = query.gte('created_at', new Date().toISOString().slice(0, 10));
    } else if (dateFilter === 'week') {
      const d = new Date(Date.now() - 7 * 86400000);
      query = query.gte('created_at', d.toISOString());
    } else if (dateFilter === 'month') {
      const d = new Date(Date.now() - 30 * 86400000);
      query = query.gte('created_at', d.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const formatted: ReminderLog[] = (data || []).map((row: any) => ({
      id: row.id,
      customer_name: row.customers?.name || 'Unknown',
      phone: row.customers?.phone || '',
      feed_no: row.sales_transactions?.feed_no ?? null,
      feed_date: row.sales_transactions?.feed_date ?? null,
      channel: row.channel,
      send_method: row.send_method,
      status: row.status,
      template_language: row.template_language,
      sent_at: row.sent_at,
      created_at: row.created_at,
    }));
    setHistory(formatted);
    setLoading(false);
  }, [dateFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filtered = useMemo(() => {
    let out = history;
    if (customerFilter) {
      const q = customerFilter.toLowerCase().trim();
      out = out.filter(
        (h) =>
          h.customer_name.toLowerCase().includes(q) ||
          h.phone.includes(q.replace(/\D/g, '')),
      );
    }
    if (statusFilter !== 'all') out = out.filter((h) => h.status === statusFilter);
    return out;
  }, [history, customerFilter, statusFilter]);

  const channelIcon = (ch: string) => {
    if (ch === 'whatsapp') return <MessageCircle className="w-4 h-4 text-green-500" />;
    if (ch === 'sms') return <MessageCircle className="w-4 h-4 text-blue-500" />;
    if (ch === 'call') return <Phone className="w-4 h-4 text-purple-500" />;
    return <MessageCircle className="w-4 h-4 text-gray-500" />;
  };

  const statusChip = (s: string) => {
    const m: Record<string, string> = {
      queued: 'bg-gray-100 text-gray-700',
      sent: 'bg-green-100 text-green-700',
      delivered: 'bg-blue-100 text-blue-700',
      read: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-slate-100 text-slate-700',
    };
    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${m[s] || m.queued}`}>
        {s}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Reminder History</h1>
            <p className="text-sm text-gray-500">Audit log of reminders sent to customers.</p>
          </div>
          <button
            onClick={() => {
              const headers = ['Date', 'Customer', 'Phone', 'Bill', 'Channel', 'Method', 'Lang', 'Status'];
              const lines = [headers.join(',')];
              for (const log of filtered) {
                lines.push([
                  log.sent_at || log.created_at,
                  `"${log.customer_name.replace(/"/g, '""')}"`,
                  log.phone,
                  log.feed_no || '',
                  log.channel,
                  log.send_method,
                  log.template_language,
                  log.status,
                ].join(','));
              }
              const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `reminder-history.csv`;
              a.click();
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter by customer or phone…"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium"
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
            <span className="text-sm text-gray-500 ml-auto">
              {filtered.length} of {history.length} reminders
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {history.length === 0 ? 'No reminders sent yet' : 'No reminders match the filter'}
            </h3>
            <p className="text-gray-500">
              {history.length === 0 ? 'Reminders will appear here once sent.' : 'Try clearing the filter or selecting a different range.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>When</Th>
                    <Th>Customer</Th>
                    <Th>Triggered by (sale)</Th>
                    <Th>Channel</Th>
                    <Th>Method</Th>
                    <Th>Lang</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900">
                            {formatDate(log.sent_at || log.created_at, 'dd MMM yyyy')}
                          </span>
                          <span className="text-gray-500">
                            {formatDate(log.sent_at || log.created_at, 'hh:mm a')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{log.customer_name}</div>
                        <div className="text-sm text-gray-500">{formatPhoneDisplay(log.phone)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {log.feed_no ? (
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <Receipt className="w-4 h-4 text-emerald-500" />
                            <span>#{log.feed_no}</span>
                            {log.feed_date && (
                              <span className="text-gray-400">· {formatDate(log.feed_date)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {channelIcon(log.channel)}
                          <span className="text-sm capitalize text-gray-700">{log.channel}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{log.send_method}</td>
                      <td className="px-4 py-3 text-xs uppercase text-gray-600">{log.template_language}</td>
                      <td className="px-4 py-3">{statusChip(log.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
      {children}
    </th>
  );
}
