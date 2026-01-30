'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, CustomerReminder } from '@/lib/supabase';
import { PHARMACY_INFO, STATUS_CONFIG } from '@/lib/constants';
import { formatDate, getDaysText, debounce } from '@/lib/utils';
import { openWhatsAppReminder, formatPhoneDisplay } from '@/lib/whatsapp';
import Header from '@/components/Header';
import StatsCards from '@/components/StatsCards';
import CustomerCard from '@/components/CustomerCard';
import CustomerTable from '@/components/CustomerTable';
import AddCustomerModal from '@/components/AddCustomerModal';
import ImportModal from '@/components/ImportModal';
import Toast from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { 
  Search, 
  Plus, 
  Upload, 
  LayoutGrid, 
  List,
  Filter,
  RefreshCw
} from 'lucide-react';

type ViewMode = 'cards' | 'table';
type FilterStatus = 'all' | 'overdue' | 'urgent' | 'soon' | 'ok';

export default function Dashboard() {
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

  // Fetch reminders from database
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

  // Initial load
  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Filter reminders based on search and status
  useEffect(() => {
    let filtered = reminders;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.customer_name.toLowerCase().includes(query) ||
        r.phone.includes(query) ||
        r.medication_name.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === filterStatus);
    }

    setFilteredReminders(filtered);
  }, [reminders, searchQuery, filterStatus]);

  // Debounced search
  const handleSearch = debounce((value: string) => {
    setSearchQuery(value);
  }, 300);

  // Handle WhatsApp reminder
  const handleSendReminder = async (reminder: CustomerReminder) => {
    const opened = openWhatsAppReminder(
      reminder.phone,
      reminder.customer_name,
      reminder.medication_name,
      reminder.days_until_refill
    );

    if (opened) {
      // Log the reminder
      try {
        await supabase.from('reminder_history').insert({
          customer_id: reminder.customer_id,
          medication_id: reminder.medication_id,
          channel: 'whatsapp',
          status: 'sent',
        });
        
        setToast({ message: 'WhatsApp opened! Send the message.', type: 'success' });
        // Refresh to update last reminder sent
        setTimeout(fetchReminders, 1000);
      } catch (error) {
        console.error('Error logging reminder:', error);
      }
    } else {
      setToast({ message: 'Could not open WhatsApp', type: 'error' });
    }
  };

  // Refresh data
  const handleRefresh = () => {
    setRefreshing(true);
    fetchReminders();
  };

  // Stats calculation
  const stats = {
    overdue: reminders.filter(r => r.status === 'overdue').length,
    urgent: reminders.filter(r => r.status === 'urgent').length,
    soon: reminders.filter(r => r.status === 'soon').length,
    total: reminders.length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <StatsCards stats={stats} onFilterClick={setFilterStatus} activeFilter={filterStatus} />

        {/* Action Bar */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers, phone, medication..."
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Filter Dropdown */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              >
                <option value="all">All Status</option>
                <option value="overdue">🔴 Overdue</option>
                <option value="urgent">🟠 Urgent</option>
                <option value="soon">🔵 Due Soon</option>
                <option value="ok">🟢 OK</option>
              </select>

              {/* View Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'cards' 
                      ? 'bg-white shadow-sm text-primary-600' 
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
                      ? 'bg-white shadow-sm text-primary-600' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title="Table View"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>

              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* Import */}
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium transition-all"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>

              {/* Add Customer */}
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium shadow-sm hover:shadow transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Customer</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
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

        {/* Results count */}
        {!loading && filteredReminders.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Showing {filteredReminders.length} of {reminders.length} reminders
          </div>
        )}
      </main>

      {/* Modals */}
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

      {/* Toast */}
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
