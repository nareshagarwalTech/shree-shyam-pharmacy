'use client';

import { useState } from 'react';
import { supabase, Group } from '@/lib/supabase';
import { isValidIndianPhone } from '@/lib/whatsapp';
import { X, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  groups: Group[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCustomerModal({ groups, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [language, setLanguage] = useState<'en' | 'te' | 'hi'>('en');
  const [bufferDays, setBufferDays] = useState(2);
  const [notes, setNotes] = useState('');
  const [groupIds, setGroupIds] = useState<Set<string>>(
    new Set(groups.filter((g) => g.slug === 'regular').map((g) => g.id)),
  );

  const toggleGroup = (id: string) =>
    setGroupIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!phone.trim()) e.phone = 'Phone is required';
    else if (!isValidIndianPhone(phone)) e.phone = 'Enter valid 10-digit phone';
    if (altPhone && !isValidIndianPhone(altPhone)) e.altPhone = 'Invalid phone';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const { data: created, error: insertErr } = await supabase
        .from('customers')
        .insert({
          name: name.trim(),
          phone: cleanPhone,
          alternate_phone: altPhone ? altPhone.replace(/\D/g, '').slice(-10) : null,
          address: address.trim() || null,
          preferred_language: language,
          reminder_buffer_days: bufferDays,
          notes: notes.trim() || null,
          source: 'manual',
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.code === '23505' || /duplicate/i.test(insertErr.message)) {
          setErrors({ phone: 'A customer with this phone already exists.' });
        } else {
          setErrors({ submit: insertErr.message });
        }
        return;
      }

      if (groupIds.size > 0 && created) {
        const links = Array.from(groupIds).map((g) => ({ customer_id: created.id, group_id: g }));
        await supabase.from('customer_groups').insert(links);
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setErrors({ submit: err?.message || 'Failed to add customer' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="modal-content relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-xl font-display font-bold text-gray-900">Add Customer</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 min-h-0">
          <div className="px-6 py-4 space-y-4">
            <Field label="Full Name" error={errors.name}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className={inputCls(!!errors.name)}
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (primary)" error={errors.phone}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  maxLength={10}
                  className={inputCls(!!errors.phone)}
                />
              </Field>
              <Field label="Alternate Phone" error={errors.altPhone}>
                <input
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  placeholder="Optional"
                  maxLength={10}
                  className={inputCls(!!errors.altPhone)}
                />
              </Field>
            </div>

            <Field label="Address">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Optional"
                className={inputCls(false)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className={inputCls(false)}
                >
                  <option value="en">English</option>
                  <option value="te">Telugu</option>
                  <option value="hi">Hindi</option>
                </select>
              </Field>

              <Field
                label="Reminder buffer (days before)"
                hint="How many days before the due date to remind."
              >
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={bufferDays}
                  onChange={(e) => setBufferDays(parseInt(e.target.value) || 0)}
                  className={inputCls(false)}
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
                className={`${inputCls(false)} resize-none`}
              />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Groups</label>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = groupIds.has(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-all ${
                        on
                          ? 'text-white border-transparent'
                          : 'text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                      style={on ? { backgroundColor: g.color } : undefined}
                    >
                      {on && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {g.icon && <span>{g.icon}</span>}
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {errors.submit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Adding…' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return `w-full px-3 py-2 rounded-lg border bg-white ${
    hasError ? 'border-red-300' : 'border-gray-200'
  } focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100`;
}
