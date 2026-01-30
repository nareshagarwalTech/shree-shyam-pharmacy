'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import Header from '@/components/Header';
import { MessageCircle, Phone, Calendar, Clock } from 'lucide-react';

interface ReminderLog {
  id: string;
  customer_name: string;
  phone: string;
  medication_name: string;
  channel: string;
  status: string;
  sent_at: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('all');

  const fetchHistory = useCallback(async () => {
    try {
      let query = supabase
        .from('reminder_history')
        .select(`
          id,
          channel,
          status,
          sent_at,
          customers (name, phone),
          medications (name)
        `)
        .order('sent_at', { ascending: false })
        .limit(100);

      // Apply date filter
      if (dateFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        query = query.gte('sent_at', today);
      } else if (dateFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('sent_at', weekAgo.toISOString());
      } else if (dateFilter === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        query = query.gte('sent_at', monthAgo.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedHistory: ReminderLog[] = (data || []).map((item: any) => ({
        id: item.id,
        customer_name: item.customers?.name || 'Unknown',
        phone: item.customers?.phone || '',
        medication_name: item.medications?.name || 'Unknown',
        channel: item.channel,
        status: item.status,
        sent_at: item.sent_at,
      }));

      setHistory(formattedHistory);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return <MessageCircle className="w-4 h-4 text-green-500" />;
      case 'sms':
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'call':
        return <Phone className="w-4 h-4 text-purple-500" />;
      default:
        return <MessageCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Reminder History</h1>
            <p className="text-gray-500">Track all sent reminders</p>
          </div>
          
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>

        {/* History List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner"></div>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No reminders sent yet</h3>
            <p className="text-gray-500">
              When you send WhatsApp reminders, they will appear here
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Medication
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Channel
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900">
                            {formatDate(log.sent_at, 'dd MMM yyyy')}
                          </span>
                          <span className="text-gray-500">
                            {formatDate(log.sent_at, 'hh:mm a')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{log.customer_name}</div>
                        <div className="text-sm text-gray-500">{formatPhoneDisplay(log.phone)}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {log.medication_name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getChannelIcon(log.channel)}
                          <span className="text-sm capitalize text-gray-700">{log.channel}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`
                          inline-flex px-2 py-1 rounded-full text-xs font-medium
                          ${log.status === 'sent' ? 'bg-green-100 text-green-700' : ''}
                          ${log.status === 'delivered' ? 'bg-blue-100 text-blue-700' : ''}
                          ${log.status === 'failed' ? 'bg-red-100 text-red-700' : ''}
                        `}>
                          {log.status}
                        </span>
                      </td>
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
