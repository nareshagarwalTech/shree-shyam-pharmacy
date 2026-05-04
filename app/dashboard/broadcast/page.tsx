'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, Group, Customer } from '@/lib/supabase';
import {
  formatPhoneDisplay,
  generateWhatsAppUrl,
  loadMessageTemplates,
  renderTemplate,
  markReminderSent,
  MessageTemplate,
} from '@/lib/whatsapp';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  Megaphone,
  Settings,
  Users,
  Search,
  Send,
  CheckCircle,
  RefreshCw,
  Eye,
} from 'lucide-react';

interface RecipientRow extends Customer {
  // group memberships are not strictly needed here once filtered, kept for display
  group_slugs?: string[];
}

export default function BroadcastPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [customers, setCustomers] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [pickedTemplateId, setPickedTemplateId] = useState<string | 'custom'>('custom');
  const [body, setBody] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());     // group slugs
  const [recipientSearch, setRecipientSearch] = useState('');
  const [hideOptOut, setHideOptOut] = useState(true);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set()); // customer ids
  const [sentInSession, setSentInSession] = useState<Set<string>>(new Set());

  // Load everything
  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    const [tmpls, grps, custs] = await Promise.all([
      loadMessageTemplates(),
      supabase.from('groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('customers')
        .select('*, customer_groups(group_id, groups(slug))')
        .eq('is_active', true)
        .order('name'),
    ]);

    setTemplates(tmpls);
    setGroups((grps.data || []) as Group[]);

    const flat = (custs.data || []).map((c: any) => ({
      ...c,
      group_slugs: (c.customer_groups || []).map((cg: any) => cg.groups?.slug).filter(Boolean),
    })) as RecipientRow[];
    setCustomers(flat);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Marketing templates only
  const marketingTemplates = useMemo(
    () => templates.filter((t) => t.kind === 'marketing'),
    [templates],
  );

  // Auto-fill body when template changes
  useEffect(() => {
    if (pickedTemplateId === 'custom') return;
    const t = templates.find((x) => x.id === pickedTemplateId);
    if (t) setBody(t.body);
  }, [pickedTemplateId, templates]);

  // Compute filtered recipients
  const recipients = useMemo(() => {
    let out = customers;
    if (selectedGroups.size > 0) {
      out = out.filter((c) =>
        (c.group_slugs || []).some((slug) => selectedGroups.has(slug)),
      );
    }
    if (hideOptOut) {
      out = out.filter((c) => !c.whatsapp_opt_out);
    }
    if (recipientSearch) {
      const q = recipientSearch.toLowerCase().trim();
      out = out.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '')),
      );
    }
    return out;
  }, [customers, selectedGroups, hideOptOut, recipientSearch]);

  // Auto-select all visible recipients when filter changes
  useEffect(() => {
    setSelectedRecipients(new Set(recipients.map((r) => r.id)));
  }, [recipients]);

  const selectedRecipientList = useMemo(
    () => recipients.filter((r) => selectedRecipients.has(r.id)),
    [recipients, selectedRecipients],
  );

  const previewRecipient = selectedRecipientList[0] || recipients[0];

  // Render a personalised message for a given recipient
  const messageFor = (c: RecipientRow): string =>
    renderTemplate(body, {
      customer_name:        c.name,
      outstanding:          0,                 // marketing rarely uses; safe default
      days_until_refill:    null,
      phone:                c.phone,
      address:              c.address,
      last_purchase_date:   null,
    }, c.preferred_language);

  // Toggle a recipient
  const toggleRecipient = (id: string) =>
    setSelectedRecipients((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleSelectAll = () =>
    setSelectedRecipients((s) =>
      s.size === recipients.length
        ? new Set()
        : new Set(recipients.map((r) => r.id))
    );

  const toggleGroup = (slug: string) =>
    setSelectedGroups((s) => {
      const n = new Set(s);
      n.has(slug) ? n.delete(slug) : n.add(slug);
      return n;
    });

  // Send: open wa.me for each selected recipient
  const sendAll = async () => {
    if (!body.trim()) {
      return setToast({ message: 'Message body cannot be empty', type: 'error' });
    }
    if (selectedRecipientList.length === 0) {
      return setToast({ message: 'Pick at least one recipient', type: 'error' });
    }
    if (!confirm(
      `Open WhatsApp for ${selectedRecipientList.length} customer(s)?\n\n` +
      'Browser may block more than ~10 popups. Recommended: pick fewer at a time, or use a popup-blocker exception.'
    )) return;

    selectedRecipientList.forEach((c, i) => {
      setTimeout(() => {
        const msg = messageFor(c);
        const url = generateWhatsAppUrl(c.phone, msg);
        window.open(url, '_blank', 'noopener,noreferrer');
      }, i * 350);
    });
    setToast({
      message: `Opened ${selectedRecipientList.length} WhatsApp tabs (staggered).`,
      type: 'success',
    });
  };

  // Mark all selected as sent (record in reminders table)
  const markAllSent = async () => {
    if (selectedRecipientList.length === 0) return;
    if (!confirm(`Record broadcast as sent for ${selectedRecipientList.length} customer(s)?`)) return;

    const tmpl = templates.find((t) => t.id === pickedTemplateId);
    const templateName = tmpl ? tmpl.slug : 'broadcast_custom';

    let ok = 0;
    let fail = 0;
    for (const c of selectedRecipientList) {
      const result = await markReminderSent({
        customerId:        c.id,
        salesTransactionId: null,
        templateName,
        templateLanguage:  c.preferred_language,
        messageContent:    messageFor(c),
      });
      if (result.ok) {
        ok++;
        setSentInSession((prev) => new Set(prev).add(c.id));
      } else {
        fail++;
      }
    }
    setToast({
      message: `Logged ${ok} broadcast${ok === 1 ? '' : 's'}${fail > 0 ? ` · ${fail} failed` : ''}.`,
      type: fail > 0 ? 'error' : 'success',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-purple-600" />
              Broadcast WhatsApp
            </h1>
            <p className="text-sm text-gray-500">
              Send the same message to many customers at once. Pick a template, choose recipients, click <strong>Open WhatsApp for selected</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/settings/templates"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium"
            >
              <Settings className="w-4 h-4" /> Templates
            </Link>
            <button
              onClick={() => fetchAll()}
              className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Template + message */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">1</span>
                Template
              </h2>
              <select
                value={pickedTemplateId}
                onChange={(e) => setPickedTemplateId(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              >
                <option value="custom">— Custom (write fresh) —</option>
                {marketingTemplates.length > 0 && <optgroup label="Marketing">
                  {marketingTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </optgroup>}
              </select>
              {marketingTemplates.length === 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  No marketing templates yet. <Link href="/dashboard/settings/templates" className="underline">Create one</Link> or write a custom message below.
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">2</span>
                Message
              </h2>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={Math.max(8, body.split('\n').length + 1)}
                placeholder="Type your message… use placeholders like {{customer_first_name}} or {{shop_name}}"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 font-mono text-xs focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
              <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                <span>{body.length} chars</span>
                <Link href="/dashboard/settings/templates" className="text-purple-600 hover:underline">
                  See available placeholders
                </Link>
              </div>
            </div>

            {previewRecipient && body && (
              <div className="bg-white rounded-xl border border-purple-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview for <span className="font-bold">{previewRecipient.name}</span>
                </h2>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap font-sans">
                  {messageFor(previewRecipient)}
                </pre>
                <p className="text-[10px] text-gray-400 mt-2">
                  Each recipient will see their own name &amp; details substituted in.
                </p>
              </div>
            )}
          </div>

          {/* Right column: Recipients */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">3</span>
                Recipients ({selectedRecipientList.length} selected of {recipients.length})
              </h2>

              {/* Group filter */}
              <div className="mb-3">
                <div className="text-xs uppercase font-semibold text-gray-500 mb-2">Filter by group (optional)</div>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => {
                    const active = selectedGroups.has(g.slug);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleGroup(g.slug)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                          active ? 'text-white border-transparent' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                        style={active ? { backgroundColor: g.color } : undefined}
                      >
                        {g.icon && <span>{g.icon}</span>}
                        {g.name}
                      </button>
                    );
                  })}
                </div>
                {selectedGroups.size > 0 && (
                  <button
                    onClick={() => setSelectedGroups(new Set())}
                    className="text-xs text-gray-500 hover:text-gray-700 mt-2"
                  >
                    clear group filter
                  </button>
                )}
              </div>

              {/* Search & opt-out toggle */}
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Search name or phone…"
                    className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  />
                </div>
                <label className="text-xs text-gray-600 flex items-center gap-1.5 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={hideOptOut}
                    onChange={(e) => setHideOptOut(e.target.checked)}
                    className="accent-purple-500"
                  />
                  Hide opt-outs
                </label>
              </div>

              {/* Recipient list */}
              {loading ? (
                <div className="py-10 text-center"><div className="spinner mx-auto" /></div>
              ) : recipients.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  No customers match the current filter.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-gray-100 py-2">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-purple-700 hover:underline font-medium"
                    >
                      {selectedRecipients.size === recipients.length ? 'Deselect all' : `Select all ${recipients.length}`}
                    </button>
                    <span className="text-xs text-gray-500">
                      {selectedRecipients.size}/{recipients.length} ticked
                    </span>
                  </div>
                  <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-100">
                    {recipients.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-3 py-2 px-1 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRecipients.has(c.id)}
                          onChange={() => toggleRecipient(c.id)}
                          className="accent-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm truncate flex items-center gap-2">
                            {c.name}
                            {sentInSession.has(c.id) && (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatPhoneDisplay(c.phone)}
                            {c.preferred_language !== 'en' && (
                              <span className="ml-2 px-1 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded uppercase">{c.preferred_language}</span>
                            )}
                            {c.whatsapp_opt_out && (
                              <span className="ml-2 px-1 py-0.5 text-[9px] bg-slate-200 text-slate-700 rounded uppercase">opted out</span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Sticky footer with send actions */}
      {selectedRecipientList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <strong className="text-purple-700">{selectedRecipientList.length}</strong>{' '}
              <span className="text-gray-600">recipient{selectedRecipientList.length === 1 ? '' : 's'} selected</span>
              {sentInSession.size > 0 && (
                <span className="ml-3 text-emerald-700">{sentInSession.size} marked sent</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllSent}
                disabled={selectedRecipientList.length === 0}
                className="flex items-center gap-2 px-3 py-2 border border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-medium rounded-lg text-sm"
              >
                <CheckCircle className="w-4 h-4" /> Mark all sent
              </button>
              <button
                onClick={sendAll}
                disabled={!body.trim() || selectedRecipientList.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium rounded-lg text-sm disabled:bg-gray-300"
              >
                <Send className="w-4 h-4" />
                Open WhatsApp for {selectedRecipientList.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
