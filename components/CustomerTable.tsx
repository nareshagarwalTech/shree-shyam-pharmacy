'use client';

import { CustomerReminder } from '@/lib/supabase';
import { STATUS_CONFIG } from '@/lib/constants';
import { formatDate, getDaysText } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import { MessageCircle } from 'lucide-react';

interface CustomerTableProps {
  reminders: CustomerReminder[];
  onSendReminder: (reminder: CustomerReminder) => void;
}

export default function CustomerTable({ reminders, onSendReminder }: CustomerTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="table-wrapper">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Medication
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Refill Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Last Reminded
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reminders.map((reminder) => {
              const statusConfig = STATUS_CONFIG[reminder.status];
              
              return (
                <tr 
                  key={`${reminder.customer_id}-${reminder.medication_id}`}
                  className="table-row-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {reminder.customer_name}
                    </div>
                    {reminder.address && (
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">
                        {reminder.address}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatPhoneDisplay(reminder.phone)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {reminder.medication_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {reminder.quantity} × {reminder.daily_dosage}/day
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">
                      {formatDate(reminder.refill_date)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {getDaysText(reminder.days_until_refill)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`
                      inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                      ${statusConfig.color}
                    `}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`}></span>
                      {statusConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {reminder.last_reminder_sent 
                      ? formatDate(reminder.last_reminder_sent)
                      : <span className="text-gray-400">Never</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onSendReminder(reminder)}
                      className="whatsapp-btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-medium rounded-lg transition-all"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
