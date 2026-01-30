'use client';

import { CustomerReminder } from '@/lib/supabase';
import { STATUS_CONFIG } from '@/lib/constants';
import { formatDate, getDaysText } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import { MessageCircle, Phone, MapPin, Clock, Pill } from 'lucide-react';

interface CustomerCardProps {
  reminder: CustomerReminder;
  onSendReminder: (reminder: CustomerReminder) => void;
}

export default function CustomerCard({ reminder, onSendReminder }: CustomerCardProps) {
  const statusConfig = STATUS_CONFIG[reminder.status];
  
  return (
    <div className={`
      customer-card bg-white rounded-xl border shadow-sm overflow-hidden
      ${statusConfig.color}
    `}>
      {/* Status Bar */}
      <div className={`h-1.5 ${statusConfig.dotColor}`}></div>
      
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-gray-900 truncate">
              {reminder.customer_name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
              <Phone className="w-3.5 h-3.5" />
              <span>{formatPhoneDisplay(reminder.phone)}</span>
            </div>
          </div>
          
          {/* Status Badge */}
          <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            ${statusConfig.color}
          `}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} pulse-dot`}></span>
            {statusConfig.label}
          </span>
        </div>

        {/* Medication */}
        <div className="flex items-start gap-2 mb-3 p-2.5 bg-gray-50 rounded-lg">
          <Pill className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{reminder.medication_name}</p>
            <p className="text-xs text-gray-500">
              {reminder.quantity} units • {reminder.daily_dosage}/day
            </p>
          </div>
        </div>

        {/* Refill Info */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Clock className="w-4 h-4" />
            <span>{getDaysText(reminder.days_until_refill)}</span>
          </div>
          <div className="text-gray-400">•</div>
          <div className="text-gray-500">
            {formatDate(reminder.refill_date)}
          </div>
        </div>

        {/* Address (if available) */}
        {reminder.address && (
          <div className="flex items-start gap-1.5 mb-4 text-sm text-gray-500">
            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-1">{reminder.address}</span>
          </div>
        )}

        {/* Last Reminder */}
        {reminder.last_reminder_sent && (
          <p className="text-xs text-gray-400 mb-3">
            Last reminder: {formatDate(reminder.last_reminder_sent)}
          </p>
        )}

        {/* WhatsApp Button */}
        <button
          onClick={() => onSendReminder(reminder)}
          className="whatsapp-btn w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium rounded-lg transition-all"
        >
          <MessageCircle className="w-5 h-5" />
          Send WhatsApp Reminder
        </button>
      </div>
    </div>
  );
}
