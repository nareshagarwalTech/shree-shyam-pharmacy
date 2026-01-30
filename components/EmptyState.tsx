'use client';

import { Users, Upload, Plus } from 'lucide-react';

interface EmptyStateProps {
  hasCustomers: boolean;
  onAddClick: () => void;
  onImportClick: () => void;
}

export default function EmptyState({ hasCustomers, onAddClick, onImportClick }: EmptyStateProps) {
  if (hasCustomers) {
    // No results for current filter
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">
          No matching customers
        </h3>
        <p className="text-gray-500 mb-4">
          Try adjusting your search or filter criteria
        </p>
      </div>
    );
  }

  // No customers at all
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center mx-auto mb-6">
        <Users className="w-10 h-10 text-primary-600" />
      </div>
      <h3 className="text-xl font-display font-bold text-gray-900 mb-2">
        Welcome to Shree Shyam Pharmacy
      </h3>
      <p className="text-gray-500 mb-8 max-w-md mx-auto">
        Start by adding your customers manually or import them from an Excel/CSV file to begin tracking medication refill reminders.
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onImportClick}
          className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          <Upload className="w-5 h-5" />
          Import from Excel
        </button>
        <button
          onClick={onAddClick}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Customer
        </button>
      </div>
    </div>
  );
}
