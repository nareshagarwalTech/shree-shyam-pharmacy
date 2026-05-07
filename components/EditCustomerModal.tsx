'use client';

import { useState } from 'react';
import useEscapeKey from '@/lib/useEscapeKey';
import { supabase, Customer } from '@/lib/supabase';
import { isValidIndianPhone } from '@/lib/whatsapp';
import { X, Loader2 } from 'lucide-react';

interface Props {
  customer: Customer;
  onClose: () => void;
  onSaved: (updated: Customer) => void;
  onError: (msg: string) => void;
}

export default function EditCustomerModal({ customer, onClose, onSaved, onError }: Props) {
  const [name, setName] = useState(customer.name);
  const phone = customer.phone; // read-only — locked as the unique key
  const [altPhone, setAltPhone] = useState(customer.alternate_phone || '');
  const [address, setAddress] = useState(customer.address || '');
  const [language, setLanguage] = useState(customer.preferred_language);
  const [bufferDays, setBufferDays] = useState(customer.reminder_buffer_days);
  const [notes, setNotes] = useState(customer.notes || '');
  const [saving, setSaving] = useState(false);

  useEscapeKey(onClose, !saving);

  const validate = () => {
    if (!name.trim()) return 'Name required';
    if (altPhone && !isValidIndianPhone(altPhone)) return 'Invalid alternate phone';
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return onError(err);

    setSaving(true);

    // Phone is intentionally NOT in the update — it's the customer's
    // unique key and is read-only in the UI.
    const { data, error } = await supabase
      .from('customers')
      .update({
        name: name.trim(),
        alternate_phone: altPhone ? altPhone.replace(/\D/g, '').slice(-10) : null,
        address: address.trim() || null,
        preferred_language: language,
        reminder_buffer_days: bufferDays,
        notes: notes.trim() || null,
      })
      .eq('id', customer.id)
      .select()
      .single();

    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }

    onSaved(data as Customer);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 modal-overlay" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md modal-content max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-display font-bold text-gray-900 text-lg">Edit Customer</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls(!name.trim())}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone (cannot change)" hint="Phone is the customer's unique key — locked to keep history intact">
              <input
                value={phone}
                readOnly
                disabled
                className={`${inputCls(false)} bg-gray-100 text-gray-500 cursor-not-allowed font-mono`}
              />
            </Field>
            <Field label="Alternate Phone">
              <input
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                maxLength={10}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <Field label="Address">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputCls(false)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred language">
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
            <Field label="Remind this many days early" hint="Send the refill reminder this many days before the medicines run out (e.g. 3 means &lsquo;remind 3 days before&rsquo;).">
              <input
                type="number"
                value={bufferDays}
                min={0}
                max={14}
                onChange={(e) => setBufferDays(parseInt(e.target.value) || 0)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls(false)} resize-none`}
            />
          </Field>

        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-2xl shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-white rounded-lg">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full px-3 py-2 rounded-lg border ${invalid ? 'border-red-300' : 'border-gray-200'} bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100`;
}
