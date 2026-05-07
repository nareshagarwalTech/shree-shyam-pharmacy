'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, CustomerNextReminder } from '@/lib/supabase';
import {
  formatPhoneDisplay,
  pickReminderFromTemplates,
  loadMessageTemplates,
  MessageTemplate,
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
  Pencil,
  Settings,
  RotateCcw,
  Calendar,
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
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [sentToday, setSentToday] = useState<Map<string, { id: string; sent_at: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [hideSent, setHideSent] = useState(true);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  // Per-customer message overrides (when staff edits the preview)
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; undo?: () => void } | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data, error }, tmpls] = await Promise.all([
      supabase.from('customer_next_reminder').select('*'),
      loadMessageTemplates(),
    ]);
    setTemplates(tmpls);
    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      const all = (data || []) as CustomerNextReminder[];
      const needs = all.filter((r) => {
        const outstanding = Number((r as any).outstanding || 0);
        const days = r.days_until_reminder;
        const refillDue = days !== null && days !== undefined && days <= 7;
        return outstanding > 0 || refillDue;
      });
      setReminders(needs);
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
        const pick = pickReminderFromTemplates({
          customerName: r.customer_name,
          outstanding: Number((r as any).outstanding || 0),
          daysUntilRefill: r.days_until_reminder,
          language: r.preferred_language,
          phone: r.phone,
          address: r.address,
          // Format ISO date as readable "5 May 2026" for the WhatsApp message body
          lastPurchaseDate: r.last_purchase_date ? formatDate(r.last_purchase_date) : null,
          templates,
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
  }, [reminders, sentToday, templates]);

  // Resolve the message to actually send: edited override > template-rendered
  const messageFor = (r: RowState): string => edits.get(r.customer.customer_id) ?? r.message;
  const isEdited = (r: RowState): boolean => edits.has(r.customer.customer_id);
  const setMessage = (customerId: string, msg: string) =>
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(customerId, msg);
      return next;
    });
  const resetMessage = (customerId: string) =>
    setEdits((prev) => {
      const next = new Map(prev);
      next.delete(customerId);
      return next;
    });

  const filtered = useMemo(() => {
    let out = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.customer.customer_name.toLowerCase().includes(q) ||
          (/\d/.test(q) && r.customer.phone.includes(q.replace(/\D/g, ''))),
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
    let outstanding = 0;
    let refill = 0;
    let overdue = 0;
    let sent = 0;
    for (const r of rows) {
      if (r.sentToday) sent += 1;
      const owes = Number((r.customer as any).outstanding || 0) > 0;
      const d = r.customer.days_until_reminder;
      const isOverdue = d !== null && d !== undefined && d < 0;
      if (owes) {
        outstanding += 1;
      } else if (isOverdue) {
        overdue += 1;
      } else if (d !== null && d !== undefined && d <= 7) {
        refill += 1;
      }
    }
    const total = rows.length;
    return { total, outstanding, overdue, refill, sent, remaining: total - sent };
  }, [rows]);

  const openWA = (r: RowState) => {
    const url = generateWhatsAppUrl(r.customer.phone, messageFor(r));
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const markSent = async (r: RowState) => {
    const result = await markReminderSent({
      customerId: r.customer.customer_id,
      salesTransactionId: r.customer.last_sale_id,
      templateName: isEdited(r) ? `${r.templateName} (edited)` : r.templateName,
      templateLanguage: r.customer.preferred_language,
      messageContent: messageFor(r),
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
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/dashboard/whatsapp/reminder-upload"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium text-sm"
              title="Upload sales register to refresh reminder dates"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reminder Upload</span>
              <span className="sm:hidden">Upload</span>
            </Link>
            <Link
              href="/dashboard/settings/templates"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm"
              title="Edit message templates"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Templates</span>
            </Link>
            <button
              onClick={() => { setRefreshing(true); fetchAll(); }}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stat tiles — one per category, click to filter */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3">
          <Tile
            label="Outstanding"
            sub="customers who owe ₹"
            value={String(stats.outstanding)}
            color="red"
            active={filter === 'due'}
            onClick={() => setFilter(filter === 'due' ? 'all' : 'due')}
          />
          <Tile
            label="Overdue refill"
            sub="refill date passed"
            value={String(stats.overdue)}
            color="amber"
            active={filter === 'overdue'}
            onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
          />
          <Tile
            label="Refill due"
            sub="due in next 7 days"
            value={String(stats.refill)}
            color="indigo"
            active={filter === 'refill'}
            onClick={() => setFilter(filter === 'refill' ? 'all' : 'refill')}
          />
          <Tile
            label="Sent today"
            sub={stats.total > 0 ? `${Math.round((stats.sent / stats.total) * 100)}% of ${stats.total}` : undefined}
            value={String(stats.sent)}
            color="emerald"
          />
        </div>
        <div className="text-xs text-gray-500 mb-6">
          {stats.total === 0
            ? 'No customers need a reminder right now.'
            : `${stats.remaining} of ${stats.total} customers still need a reminder today. Tap a tile above to filter.`}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-6">
          <div className="flex flex-col gap-3">
            <div className="relative w-full">
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
              <div className="flex bg-gray-100 rounded-lg p-1 w-full sm:w-auto overflow-x-auto">
                {([
                  { k: 'all',     label: 'All' },
                  { k: 'due',     label: 'Outstanding' },
                  { k: 'refill',  label: 'Refill' },
                  { k: 'overdue', label: 'Overdue' },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    onClick={() => setFilter(opt.k)}
                    className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
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
                <span className="hidden sm:inline">{hideSent ? 'Hide sent' : 'Show all'}</span>
              </button>
              {filtered.filter((r) => !r.sentToday).length > 1 && (
                <button
                  onClick={openAllRemaining}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white ml-auto"
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
                  className={`bg-white rounded-xl border p-3 sm:p-4 transition-all ${
                    sent ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {/* Identity */}
                  <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/dashboard/customer/${r.customer.phone}`}
                          className="font-display font-semibold text-gray-900 hover:text-emerald-600 break-words"
                        >
                          {r.customer.customer_name}
                        </Link>
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
                      <a
                        href={`tel:${r.customer.phone}`}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 mt-0.5"
                      >
                        <Phone className="w-3 h-3" />
                        {formatPhoneDisplay(r.customer.phone)}
                      </a>
                      <div className="text-sm mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-amber-700">{r.reasonLabel}</span>
                      </div>
                      {r.customer.last_purchase_date && (
                        <div className="text-xs text-gray-600 mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-md">
                          <Calendar className="w-3 h-3 text-emerald-600" />
                          <span className="font-medium text-emerald-800">Last purchase:</span>
                          <span className="text-emerald-700">{formatDate(r.customer.last_purchase_date)}</span>
                          {r.customer.last_for_days && (
                            <span className="text-gray-500">· {r.customer.last_for_days} day supply</span>
                          )}
                        </div>
                      )}
                      {r.customer.last_reminder_sent && !sent && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last reminder: {formatDate(r.customer.last_reminder_sent)}
                        </div>
                      )}
                    </div>
                    {sent && (
                      <span className="inline-flex shrink-0 items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-md">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Sent {lastSentLabel}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setShowPreview(showPreview === r.customer.customer_id ? null : r.customer.customer_id)}
                      className={`text-xs underline flex items-center gap-1 mr-auto ${
                        isEdited(r) ? 'text-amber-600 font-medium' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {isEdited(r) && <Pencil className="w-3 h-3" />}
                      {showPreview === r.customer.customer_id ? 'Hide' : isEdited(r) ? 'Edited' : 'Preview / Edit'} message
                    </button>
                    {sent ? (
                      <button
                        onClick={() => undoMarkSent(r)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md border border-gray-200"
                        title="Undo mark sent"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Undo
                      </button>
                    ) : (
                      <>
                        <a
                          href={`tel:${r.customer.phone}`}
                          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md border border-gray-200"
                          title="Call customer"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => markSent(r)}
                          disabled={r.customer.whatsapp_opt_out}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 border border-emerald-500 text-emerald-700 hover:bg-emerald-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent font-medium rounded-md text-sm"
                          title="Mark reminder as sent"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Mark sent
                        </button>
                        <button
                          onClick={() => openWA(r)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium rounded-md text-sm"
                          title="Open WhatsApp with the message"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Open WhatsApp
                        </button>
                      </>
                    )}
                  </div>

                  {showPreview === r.customer.customer_id && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase font-semibold text-gray-500">
                          {isEdited(r) ? 'Edited message (sent as-is to WhatsApp)' : 'Message preview — edit below to customise'}
                        </span>
                        <div className="flex items-center gap-2">
                          {isEdited(r) && (
                            <button
                              onClick={() => resetMessage(r.customer.customer_id)}
                              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
                              title="Reset to template"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset to template
                            </button>
                          )}
                          <Link
                            href="/dashboard/settings/templates"
                            className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700"
                          >
                            <Settings className="w-3 h-3" />
                            Edit template
                          </Link>
                        </div>
                      </div>
                      <textarea
                        value={messageFor(r)}
                        onChange={(e) => setMessage(r.customer.customer_id, e.target.value)}
                        rows={Math.max(6, messageFor(r).split('\n').length + 1)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white font-sans text-xs text-gray-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        placeholder="Type your message…"
                      />
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                        <span>{messageFor(r).length} chars</span>
                        <span>·</span>
                        <span>This edit applies only to <strong className="text-gray-700">{r.customer.customer_name}</strong> for this session — to change wording for everyone, edit the <Link href="/dashboard/settings/templates" className="text-emerald-600 hover:underline">template</Link>.</span>
                      </div>
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

function Tile({ label, value, sub, color, active, onClick }: {
  label: string; value: string; sub?: string;
  color: 'indigo' | 'emerald' | 'amber' | 'red';
  active?: boolean;
  onClick?: () => void;
}) {
  const map: Record<string, string> = {
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  };
  const base = `rounded-xl border p-3 sm:p-4 text-left transition-all ${map[color]}`;
  const interactive = onClick
    ? 'hover:shadow-sm cursor-pointer'
    : 'cursor-default';
  const ring = active ? 'ring-2 ring-offset-2 ring-emerald-500' : '';

  const inner = (
    <>
      <div className="text-[11px] sm:text-xs font-semibold opacity-80 leading-tight uppercase tracking-wide">{label}</div>
      <div className="text-2xl sm:text-3xl font-display font-bold mt-1">{value}</div>
      {sub && <div className="text-[10px] sm:text-xs opacity-70 mt-1 leading-tight">{sub}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${interactive} ${ring}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={`${base} ${interactive}`}>{inner}</div>;
}
