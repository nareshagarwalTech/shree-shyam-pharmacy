'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, CustomerReminder } from '@/lib/supabase';
import { PHARMACY_INFO, STATUS_CONFIG } from '@/lib/constants';
import { formatDate, getDaysText, debounce } from '@/lib/utils';
import { openWhatsAppReminder, formatPhoneDisplay } from '@/lib/whatsapp';
import DashboardHeader from '@/components/DashboardHeader';
import StatsCards from '@/components/StatsCards';
import CustomerCard from '@/components/CustomerCard';
import CustomerTable from '@/components/CustomerTable';
import AddCustomerModal from '@/components/AddCustomerModal';
import ImportModal from '@/components/ImportModal';
import Toast from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import DailySummaryWidget from '@/components/DailySummaryWidget';
import { 
  Search, 
  Plus, 
  Upload, 
  LayoutGrid, 
  List,
  RefreshCw
} from 'lucide-react';

type ViewMode = 'cards' | 'table';
type FilterStatus = 'all' | 'overdue' | 'urgent' | 'soon' | 'ok';

// Owner's WhatsApp number - UPDATE THIS
const OWNER_PHONE = '919876543210';

export default function DashboardPage() {
  const [reminders, setReminders] = useState<CustomerReminder[]>([]);
  const [filteredReminders, setFilteredReminders] = useState<CustomerReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReminders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customer_reminders')
        .select('*')
        .order('days_until_refill', { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
      setToast({ message: 'Failed to load data', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  useEffect(() => {
    let filtered = reminders;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.customer_name.toLowerCase().includes(query) ||
        r.phone.includes(query) ||
        r.medication_name.toLowerCase().includes(query)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === filterStatus);
    }

    setFilteredReminders(filtered);
  }, [reminders, searchQuery, filterStatus]);

  const handleSearch = debounce((value: string) => {
    setSearchQuery(value);
  }, 300);

  const handleSendReminder = async (reminder: CustomerReminder) => {
    const opened = openWhatsAppReminder(
      reminder.phone,
      reminder.customer_name,
      reminder.medication_name,
      reminder.days_until_refill
    );

    if (opened) {
      try {
        await supabase.from('reminder_history').insert({
          customer_id: reminder.customer_id,
          medication_id: reminder.medication_id,
          channel: 'whatsapp',
          status: 'sent',
        });
        
        setToast({ message: 'WhatsApp opened! Send the message.', type: 'success' });
        setTimeout(fetchReminders, 1000);
      } catch (error) {
        console.error('Error logging reminder:', error);
      }
    } else {
      setToast({ message: 'Could not open WhatsApp', type: 'error' });
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReminders();
  };

  const stats = {
    overdue: reminders.filter(r => r.status === 'overdue').length,
    urgent: reminders.filter(r => r.status === 'urgent').length,
    soon: reminders.filter(r => r.status === 'soon').length,
    total: reminders.length,
  };

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <DashboardHeader />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!loading && (stats.overdue > 0 || stats.urgent > 0) && (
          <div className="mb-6">
            <DailySummaryWidget 
              stats={stats} 
              ownerPhone={OWNER_PHONE}
              appUrl={appUrl}
            />
          </div>
        )}

        <StatsCards stats={stats} onFilterClick={setFilterStatus} activeFilter={filterStatus} />

        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers, phone, medication..."
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All Status</option>
                <option value="overdue">🔴 Overdue</option>
                <option value="urgent">🟠 Urgent</option>
                <option value="soon">🔵 Due Soon</option>
                <option value="ok">🟢 OK</option>
              </select>

              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'cards' 
                      ? 'bg-white shadow-sm text-emerald-600' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Card View"
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'table' 
                      ? 'bg-white shadow-sm text-emerald-600' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Table View"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium transition-all"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-sm hover:shadow transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Customer</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="spinner"></div>
            </div>
          ) : filteredReminders.length === 0 ? (
            <EmptyState 
              hasCustomers={reminders.length > 0}
              onAddClick={() => setShowAddModal(true)}
              onImportClick={() => setShowImportModal(true)}
            />
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReminders.map((reminder) => (
                <CustomerCard
                  key={`${reminder.customer_id}-${reminder.medication_id}`}
                  reminder={reminder}
                  onSendReminder={handleSendReminder}
                />
              ))}
            </div>
          ) : (
            <CustomerTable
              reminders={filteredReminders}
              onSendReminder={handleSendReminder}
            />
          )}
        </div>

        {!loading && filteredReminders.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Showing {filteredReminders.length} of {reminders.length} reminders
          </div>
        )}
      </main>

      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchReminders();
            setToast({ message: 'Customer added successfully!', type: 'success' });
          }}
        />
      )}

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={(count) => {
            setShowImportModal(false);
            fetchReminders();
            setToast({ message: `Imported ${count} customers successfully!`, type: 'success' });
          }}
        />
      )}

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
