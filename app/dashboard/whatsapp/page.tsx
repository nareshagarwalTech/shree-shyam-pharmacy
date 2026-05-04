'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, CustomerNextReminder } from '@/lib/supabase';
import {
  formatPhoneDisplay,
  pickReminder,
  generateWhatsAppUrl,
  markReminderSent,
  undoReminderSent,
  getRemindersSentToday,
} from '@/lib/whatsapp';
import { formatDate } from '@/lib/utils';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  Search,
  MessageCircle,
  CheckCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Phone,
  Send,
  Undo2,
} from 'lucide-react';

type FilterKind = 'all' | 'due' | 'refill' | 'overdue';

interface RowState {
  customer: CustomerNextReminder;
  reasonLabel: string;
  templateName: string;
  message: string;
  /** sent today = entry in reminders table since midnight */
  sentToday: { id: string; sent_at: string } | null;
}

export default function WhatsAppCenterPage() {
  const [reminders, setReminders] = useState<CustomerNextReminder[]>([]);
  const [sentToday, setSentToday] = useState<Map<string, { id: string; sent_at: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [hideSent, setHideSent] = useState(true);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; undo?: () => void } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('customer_next_reminder')
      .select('*');
    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      const all = (data || []) as CustomerNextReminder[];
      // Only include those who actually need a reminder (outstanding > 0 OR refill due)
      const needs = all.filter((r) => {
        const outstanding = Number((r as any).outstanding || 0);
        const days = r.days_until_reminder;
        const refillDue = days !== null && days !== undefined && days <= 7;
        return outstanding > 0 || refillDue;
      });
      setReminders(needs);
      // Get sent-today map
      const map = await getRemindersSentToday(needs.map((r) => r.customer_id));
      setSentToday(map);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const rows: RowState[] = useMemo(() => {
    return reminders
      .map((r) => {
        const pick = pickReminder({
          customerName: r.customer_name,
          outstanding: Number((r as any).outstanding || 0),
          daysUntilRefill: r.days_until_reminder,
          language: r.preferred_language,
        });
        if (!pick) return null;
        return {
          customer: r,
          reasonLabel: pick.reasonLabel,
          templateName: pick.templateName,
          message: pick.message,
          sentToday: sentToday.get(r.customer_id) || null,
        };
      })
      .filter((x): x is RowState => x !== null);
  }, [reminders, sentToday]);

  const filtered = useMemo(() => {
    let out = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.customer.customer_name.toLowerCase().includes(q) ||
          r.customer.phone.includes(q.replace(/\D/g, '')),
      );
    }
    if (filter === 'due') {
      out = out.filter((r) => Number((r.customer as any).outstanding || 0) > 0);
    } else if (filter === 'refill') {
      out = out.filter((r) => {
        const d = r.customer.days_until_reminder;
        return d !== null && d !== undefined && d <= 7 && Number((r.customer as any).outstanding || 0) === 0;
      });
    } else if (filter === 'overdue') {
      out = out.filter((r) => {
        const d = r.customer.days_until_reminder;
        return d !== null && d !== undefined && d < 0;
      });
    }
    if (hideSent) {
      out = out.filter((r) => !r.sentToday);
    }
    return out;
  }, [rows, searchQuery, filter, hideSent]);

  const stats = useMemo(() => {
    const total = rows.length;
    const sent = rows.filter((r) => r.sentToday).length;
    return { total, sent, remaining: total - sent };
  }, [rows]);

  const openWA = (r: RowState) => {
    const url = generateWhatsAppUrl(r.customer.phone, r.message);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const markSent = async (r: RowState) => {
    const result = await markReminderSent({
      customerId: r.customer.customer_id,
      salesTransactionId: r.customer.last_sale_id,
      templateName: r.templateName,
      templateLanguage: r.customer.preferred_language,
      messageContent: r.message,
    });
    if (!result.ok) {
      setToast({ message: result.error || 'Failed to mark sent', type: 'error' });
      return;
    }
    // Update local state immediately
    setSentToday((prev) => {
      const next = new Map(prev);
      next.set(r.customer.customer_id, { id: result.reminderId!, sent_at: new Date().toISOString() });
      return next;
    });
    setToast({
      message: `✓ Marked sent: ${r.customer.customer_name}`,
      type: 'success',
      undo: async () => {
        const undo = await undoReminderSent(result.reminderId!);
        if (undo.ok) {
          setSentToday((prev) => {
            const next = new Map(prev);
            next.delete(r.customer.customer_id);
            return next;
          });
        }
      },
    });
  };

  const undoMarkSent = async (r: RowState) => {
    if (!r.sentToday) return;
    const result = await undoReminderSent(r.sentToday.id);
    if (!result.ok) {
      setToast({ message: result.error || 'Undo failed', type: 'error' });
      return;
    }
    setSentToday((prev) => {
      const next = new Map(prev);
      next.delete(r.customer.customer_id);
      return next;
    });
    setToast({ message: 'Reminder un-sent', type: 'success' });
  };

  const openAllRemaining = () => {
    const toSend = filtered.filter((r) => !r.sentToday);
    if (!toSend.length) return;
    if (!confirm(`Open ${toSend.length} WhatsApp tabs? (Browser may block more than ~10)`)) return;
    toSend.forEach((r, i) => {
      setTimeout(() => openWA(r), i * 250);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-emerald-600" />
              WhatsApp Center
            </h1>
            <p className="text-sm text-gray-500">
              Click <strong>Open</strong> to launch the WhatsApp app with the message ready, then click <strong>Mark Sent</strong> after sending.
            </p>
          </div>
          <button
            onClick={() => { setRefreshing(true); fetchAll(); }}
            className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Tile label="Need reminder" value={String(stats.total)} color="indigo" />
          <Tile label="Sent today" value={String(stats.sent)} color="emerald" sub={stats.sent > 0 ? `${Math.round((stats.sent / stats.total) * 100)}% done` : undefined} />
          <Tile label="Remaining" value={String(stats.remaining)} color="amber" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-gray-100 rounded-lg p-1">
                {([
                  { k: 'all',     label: 'All' },
                  { k: 'due',     label: 'Outstanding' },
                  { k: 'refill',  label: 'Refill due' },
                  { k: 'overdue', label: 'Overdue' },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    onClick={() => setFilter(opt.k)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      filter === opt.k ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setHideSent((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border ${
                  hideSent ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}
                title={hideSent ? 'Showing only remaining' : 'Showing everyone'}
              >
                {hideSent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {hideSent ? 'Hide sent' : 'Show all'}
              </button>
              {filtered.filter((r) => !r.sentToday).length > 1 && (
                <button
                  onClick={openAllRemaining}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  <Send className="w-4 h-4" />
                  Open all ({filtered.filter((r) => !r.sentToday).length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">
              {hideSent && stats.sent > 0 ? 'All done for today!' : 'No reminders pending'}
            </h3>
            <p className="text-gray-500">
              {hideSent && stats.sent > 0
                ? `Sent ${stats.sent} reminder${stats.sent === 1 ? '' : 's'} today.`
                : 'No customers currently need a reminder.'}
            </p>
            {hideSent && stats.sent > 0 && (
              <button
                onClick={() => setHideSent(false)}
                className="mt-4 text-sm text-emerald-600 hover:underline"
              >
                Show already-sent reminders
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const sent = r.sentToday;
              const lastSentLabel = sent
                ? formatTime(sent.sent_at)
                : null;
              return (
                <div
                  key={r.customer.customer_id}
                  className={`bg-white rounded-xl border p-4 transition-all ${
                    sent ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/customer/${r.customer.phone}`}
                          className="font-display font-semibold text-gray-900 hover:text-emerald-600"
                        >
                          {r.customer.customer_name}
                        </Link>
                        <span className="text-xs text-gray-500">{formatPhoneDisplay(r.customer.phone)}</span>
                        {r.customer.preferred_language !== 'en' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded uppercase">
                            {r.customer.preferred_language}
                          </span>
                        )}
                        {r.customer.whatsapp_opt_out && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded uppercase">
                            opted out
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-amber-700">{r.reasonLabel}</span>
                        {r.customer.last_purchase_date && (
                          <span className="text-gray-400">
                            · last bill {formatDate(r.customer.last_purchase_date)}
                          </span>
                        )}
                      </div>
                      {r.customer.last_reminder_sent && !sent && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last reminder: {formatDate(r.customer.last_reminder_sent)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setShowPreview(showPreview === r.customer.customer_id ? null : r.customer.customer_id)}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        {showPreview === r.customer.customer_id ? 'Hide' : 'Preview'} message
                      </button>
                      {sent ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-lg">
                            <CheckCircle className="w-4 h-4" />
                            Sent at {lastSentLabel}
                          </span>
                          <button
                            onClick={() => undoMarkSent(r)}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openWA(r)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium rounded-lg text-sm"
                            title="Open WhatsApp with the message"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Open WhatsApp
                          </button>
                          <button
                            onClick={() => markSent(r)}
                            disabled={r.customer.whatsapp_opt_out}
                            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-500 text-emerald-700 hover:bg-emerald-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent font-medium rounded-lg text-sm"
                            title="Record that this reminder was sent"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark Sent
                          </button>
                          <a
                            href={`tel:${r.customer.phone}`}
                            className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Call instead"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {showPreview === r.customer.customer_id && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{r.message}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          action={toast.undo ? { label: 'Undo', onClick: () => { toast.undo!(); setToast(null); } } : undefined}
        />
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function Tile({ label, value, sub, color }: {
  label: string; value: string; sub?: string;
  color: 'indigo' | 'emerald' | 'amber';
}) {
  const map: Record<string, string> = {
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-3xl font-display font-bold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  );
}
