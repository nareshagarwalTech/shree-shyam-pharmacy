'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageTemplate, renderTemplate } from '@/lib/whatsapp';
import DashboardHeader from '@/components/DashboardHeader';
import Toast from '@/components/Toast';
import {
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';

const PLACEHOLDERS = [
  { key: 'customer_name',       desc: 'Full name' },
  { key: 'customer_first_name', desc: 'First word of name only' },
  { key: 'outstanding',         desc: '₹ amount with formatting (e.g., ₹15,340)' },
  { key: 'outstanding_amount',  desc: 'Just the number (15340)' },
  { key: 'days_phrase',         desc: 'e.g., "will run out in 5 days"' },
  { key: 'days_until_refill',   desc: 'Plain number (5, -2, 0)' },
  { key: 'phone',               desc: 'Customer phone' },
  { key: 'address',             desc: 'Customer address' },
  { key: 'last_purchase_date',  desc: 'Date of latest bill' },
  { key: 'shop_name',           desc: 'Pharmacy name' },
  { key: 'shop_phone',          desc: 'Pharmacy phone' },
  { key: 'shop_address',        desc: 'Pharmacy address' },
  { key: 'date',                desc: "Today's date" },
];

const KIND_LABEL: Record<string, string> = { refill: 'Refill reminder', due: 'Outstanding due' };
const LANG_LABEL: Record<string, string> = { en: 'English', te: 'Telugu', hi: 'Hindi' };

interface DraftMap { [id: string]: string; }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .order('kind').order('language');
    if (error) setToast({ message: error.message, type: 'error' });
    else setTemplates((data || []) as MessageTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onChange = (id: string, body: string) =>
    setDrafts((prev) => ({ ...prev, [id]: body }));

  const isDirty = (t: MessageTemplate) => drafts[t.id] !== undefined && drafts[t.id] !== t.body;

  const save = async (t: MessageTemplate) => {
    const newBody = drafts[t.id] ?? t.body;
    if (!newBody.trim()) return setToast({ message: 'Body cannot be empty', type: 'error' });
    setSaving(t.id);
    const { error } = await supabase
      .from('message_templates')
      .update({ body: newBody })
      .eq('id', t.id);
    setSaving(null);
    if (error) setToast({ message: error.message, type: 'error' });
    else {
      setToast({ message: `${t.label} saved.`, type: 'success' });
      setDrafts((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
      fetchAll();
    }
  };

  const reset = (t: MessageTemplate) => {
    setDrafts((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
  };

  const togglePreview = (id: string) =>
    setPreviewing((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Sample data for preview rendering
  const sampleVars = {
    customer_name: 'Ramesh Kumar',
    outstanding: 15340,
    days_until_refill: 5,
    phone: '9100876838',
    address: 'Ameerpet, Hyderabad',
    last_purchase_date: '2026-04-29',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <MessageSquareText className="w-6 h-6 text-emerald-600" />
              WhatsApp Message Templates
            </h1>
            <p className="text-sm text-gray-500">
              Edit the wording sent for refill reminders and outstanding-due reminders.
              Changes apply immediately to all future sends.
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchAll(); }}
            className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Placeholders cheat sheet */}
        <details className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 group">
          <summary className="px-5 py-3 cursor-pointer flex items-center gap-2 text-sm font-medium text-gray-700">
            <Info className="w-4 h-4 text-blue-500" />
            Available placeholders ({PLACEHOLDERS.length}) — click to expand
          </summary>
          <div className="px-5 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm">
              {PLACEHOLDERS.map((p) => (
                <div key={p.key} className="flex items-baseline gap-2">
                  <code className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-mono text-xs whitespace-nowrap">
                    {`{{${p.key}}}`}
                  </code>
                  <span className="text-gray-600 text-xs">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </details>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <MessageSquareText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No templates yet. Run migration 006 in Supabase.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((t) => {
              const dirty = isDirty(t);
              const body = drafts[t.id] ?? t.body;
              const preview = previewing.has(t.id);
              return (
                <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                        t.kind === 'refill' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {KIND_LABEL[t.kind]}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-700 rounded-full uppercase">
                        {LANG_LABEL[t.language] || t.language}
                      </span>
                      <span className="text-sm text-gray-500 font-mono">{t.slug}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePreview(t.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                      >
                        {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {preview ? 'Hide' : 'Show'} preview
                      </button>
                      {dirty && (
                        <button
                          onClick={() => reset(t)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                          title="Discard changes"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                      )}
                      <button
                        onClick={() => save(t)}
                        disabled={!dirty || saving === t.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg"
                      >
                        <Save className="w-4 h-4" />
                        {saving === t.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                    <div className="p-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Template</div>
                      <textarea
                        value={body}
                        onChange={(e) => onChange(t.id, e.target.value)}
                        rows={Math.max(8, body.split('\n').length + 1)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 font-mono text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                      {dirty && (
                        <p className="text-xs text-amber-600 mt-1">Unsaved changes</p>
                      )}
                    </div>
                    {preview && (
                      <div className="p-4 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          Preview (sample data)
                        </div>
                        <pre className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap font-sans">
                          {renderTemplate(body, sampleVars, t.language)}
                        </pre>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Sample customer: {sampleVars.customer_name} · ₹{sampleVars.outstanding} owed · refill in {sampleVars.days_until_refill} days
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
