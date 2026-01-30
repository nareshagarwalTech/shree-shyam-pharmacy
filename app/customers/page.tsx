'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Customer, Medication } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import Header from '@/components/Header';
import Toast from '@/components/Toast';
import { Search, Plus, Edit2, Trash2, Pill, ChevronDown, ChevronUp } from 'lucide-react';

interface CustomerWithMeds extends Customer {
  medications: Medication[];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithMeds[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchCustomers = useCallback(async () => {
    try {
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (customersError) throw customersError;

      // Fetch medications for each customer
      const customersWithMeds: CustomerWithMeds[] = await Promise.all(
        (customersData || []).map(async (customer) => {
          const { data: meds } = await supabase
            .from('medications')
            .select('*')
            .eq('customer_id', customer.id)
            .eq('is_active', true);
          
          return { ...customer, medications: meds || [] };
        })
      );

      setCustomers(customersWithMeds);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setToast({ message: 'Failed to load customers', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = customers.filter(c => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      c.medications.some(m => m.name.toLowerCase().includes(query))
    );
  });

  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    if (!confirm(`Are you sure you want to delete ${customerName}? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', customerId);

      if (error) throw error;

      setCustomers(customers.filter(c => c.id !== customerId));
      setToast({ message: `${customerName} deleted`, type: 'success' });
    } catch (error) {
      console.error('Error deleting customer:', error);
      setToast({ message: 'Failed to delete customer', type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">All Customers</h1>
            <p className="text-gray-500">{customers.length} total customers</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 w-64"
              />
            </div>
          </div>
        </div>

        {/* Customer List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner"></div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-gray-500">No customers found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCustomers.map((customer) => (
              <div 
                key={customer.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Customer Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedCustomer(
                    expandedCustomer === customer.id ? null : customer.id
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-700 font-semibold">
                        {customer.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                      <p className="text-sm text-gray-500">{formatPhoneDisplay(customer.phone)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {customer.medications.length} medication(s)
                    </span>
                    {expandedCustomer === customer.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedCustomer === customer.id && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    {/* Address */}
                    {customer.address && (
                      <p className="text-sm text-gray-600 mb-4">
                        <span className="font-medium">Address:</span> {customer.address}
                      </p>
                    )}

                    {/* Medications */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-700">Medications</h4>
                      {customer.medications.length === 0 ? (
                        <p className="text-sm text-gray-500">No medications added</p>
                      ) : (
                        <div className="grid gap-3">
                          {customer.medications.map((med) => (
                            <div 
                              key={med.id}
                              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200"
                            >
                              <Pill className="w-5 h-5 text-primary-500" />
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{med.name}</p>
                                <p className="text-sm text-gray-500">
                                  {med.quantity} units • {med.daily_dosage}/day • 
                                  Refill: {formatDate(med.refill_date)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => handleDeleteCustomer(customer.id, customer.name)}
                        className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
