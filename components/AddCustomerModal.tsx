'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateRefillDate, toISODateString, todayISO } from '@/lib/utils';
import { isValidIndianPhone } from '@/lib/whatsapp';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';

interface Medication {
  id: string;
  name: string;
  quantity: number;
  daily_dosage: number;
  start_date: string;
}

interface AddCustomerModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCustomerModal({ onClose, onSuccess }: AddCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  
  const [medications, setMedications] = useState<Medication[]>([
    { id: '1', name: '', quantity: 30, daily_dosage: 1, start_date: todayISO() }
  ]);

  const addMedication = () => {
    setMedications([
      ...medications,
      { id: Date.now().toString(), name: '', quantity: 30, daily_dosage: 1, start_date: todayISO() }
    ]);
  };

  const removeMedication = (id: string) => {
    if (medications.length > 1) {
      setMedications(medications.filter(m => m.id !== id));
    }
  };

  const updateMedication = (id: string, field: keyof Medication, value: any) => {
    setMedications(medications.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!phone.trim()) newErrors.phone = 'Phone is required';
    else if (!isValidIndianPhone(phone)) newErrors.phone = 'Enter valid 10-digit phone number';
    if (alternatePhone && !isValidIndianPhone(alternatePhone)) newErrors.alternatePhone = 'Enter valid 10-digit phone number';
    const hasValidMedication = medications.some(m => m.name.trim());
    if (!hasValidMedication) newErrors.medications = 'Add at least one medication';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          alternate_phone: alternatePhone ? alternatePhone.replace(/\D/g, '') : null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (customerError) throw customerError;

      const validMedications = medications.filter(m => m.name.trim());
      if (validMedications.length > 0) {
        const medicationsToInsert = validMedications.map(m => {
          const refillDate = calculateRefillDate(m.start_date, m.quantity, m.daily_dosage);
          return {
            customer_id: customer.id,
            name: m.name.trim(),
            quantity: m.quantity,
            daily_dosage: m.daily_dosage,
            start_date: m.start_date,
            refill_date: toISODateString(refillDate),
          };
        });
        const { error: medError } = await supabase.from('medications').insert(medicationsToInsert);
        if (medError) throw medError;
      }
      onSuccess();
    } catch (error) {
      console.error('Error adding customer:', error);
      setErrors({ submit: 'Failed to add customer. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0 bg-black/50" onClick={onClose}></div>
      
      <div className="modal-content relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-display font-bold text-gray-900">Add New Customer</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="px-6 py-4 space-y-4">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Customer Details</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter customer name"
                  className={`w-full px-3 py-2 rounded-lg border ${errors.name ? 'border-red-300' : 'border-gray-200'} focus:border-primary-500 focus:ring-2 focus:ring-primary-100`}
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    maxLength={10}
                    className={`w-full px-3 py-2 rounded-lg border ${errors.phone ? 'border-red-300' : 'border-gray-200'} focus:border-primary-500 focus:ring-2 focus:ring-primary-100`}
                  />
                  {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alternate Phone</label>
                  <input
                    type="tel"
                    value={alternatePhone}
                    onChange={(e) => setAlternatePhone(e.target.value)}
                    placeholder="Optional"
                    maxLength={10}
                    className={`w-full px-3 py-2 rounded-lg border ${errors.alternatePhone ? 'border-red-300' : 'border-gray-200'} focus:border-primary-500 focus:ring-2 focus:ring-primary-100`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter address (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special notes (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 resize-none"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Medications</h3>
                <button type="button" onClick={addMedication} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
                  <Plus className="w-4 h-4" />Add More
                </button>
              </div>

              {errors.medications && <p className="text-sm text-red-600">{errors.medications}</p>}

              {medications.map((med, index) => (
                <div key={med.id} className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Medication {index + 1}</span>
                    {medications.length > 1 && (
                      <button type="button" onClick={() => removeMedication(med.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={med.name}
                    onChange={(e) => updateMedication(med.id, 'name', e.target.value)}
                    placeholder="Medicine name (e.g., Metformin 500mg)"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                      <input type="number" value={med.quantity} onChange={(e) => updateMedication(med.id, 'quantity', parseInt(e.target.value) || 0)} min="1" className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Per Day</label>
                      <input type="number" value={med.daily_dosage} onChange={(e) => updateMedication(med.id, 'daily_dosage', parseInt(e.target.value) || 1)} min="1" className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                      <input type="date" value={med.start_date} onChange={(e) => updateMedication(med.id, 'start_date', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {errors.submit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Adding...' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
