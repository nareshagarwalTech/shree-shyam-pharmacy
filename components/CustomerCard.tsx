'use client';

import { CustomerNextReminder } from '@/lib/supabase';
import { STATUS_CONFIG } from '@/lib/constants';
import { formatDate, getDaysText } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import { MessageCircle, Phone, MapPin, Clock, Calendar, Receipt, CheckSquare, Square } from 'lucide-react';

interface Props {
  reminder: CustomerNextReminder;
  groupColorMap?: Map<string, { color: string; icon?: string | null; name: string }>;
  onSendReminder: (r: CustomerNextReminder) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export default function CustomerCard({
  reminder,
  groupColorMap,
  onSendReminder,
  selected,
  onToggleSelect,
}: Props) {
  const cfg = STATUS_CONFIG[reminder.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.ok;
  const canSend =
    reminder.status !== 'opted_out' &&
    reminder.status !== 'no_sales' &&
    reminder.status !== 'paused';

  return (
    <div
      className={`customer-card bg-white rounded-xl border shadow-sm overflow-hidden ${
        selected ? 'ring-2 ring-emerald-500' : ''
      }`}
    >
      <div className={`h-1.5 ${cfg.dotColor}`} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {onToggleSelect && canSend && (
              <button
                onClick={() => onToggleSelect(reminder.customer_id)}
                className="mt-1 text-gray-400 hover:text-emerald-600"
                aria-label="Select"
              >
                {selected ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-display font-semibold text-gray-900 truncate">
                {reminder.customer_name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-500">
                <Phone className="w-3.5 h-3.5" />
                <span>{formatPhoneDisplay(reminder.phone)}</span>
              </div>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} pulse-dot`} />
            {cfg.label}
          </span>
        </div>

        {reminder.group_slugs?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {reminder.group_slugs.map((slug, i) => {
              const gm = groupColorMap?.get(slug);
              return (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                  style={{
                    borderColor: gm?.color || '#e5e7eb',
                    color: gm?.color || '#6b7280',
                    backgroundColor: gm?.color ? `${gm.color}10` : '#f9fafb',
                  }}
                >
                  {gm?.icon && <span>{gm.icon}</span>}
                  {gm?.name || reminder.group_names[i] || slug}
                </span>
              );
            })}
          </div>
        )}

        <div className="p-2.5 bg-gray-50 rounded-lg mb-3">
          {reminder.last_feed_no ? (
            <>
              <div className="flex items-start gap-2">
                <Receipt className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500">Last purchase</div>
                  <div className="text-sm font-medium text-gray-900">
                    {reminder.last_purchase_date ? formatDate(reminder.last_purchase_date) : '—'}
                    {reminder.last_amount != null && (
                      <span className="text-gray-500"> · ₹{reminder.last_amount}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Bill #{reminder.last_feed_no} · {reminder.last_for_days} day supply
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500 italic">No purchases recorded yet.</div>
          )}
        </div>

        {reminder.reminder_date && (
          <div className="flex items-center gap-4 mb-3 text-sm">
            <div className="flex items-center gap-1.5 text-gray-700">
              <Clock className="w-4 h-4" />
              <span>{getDaysText(reminder.days_until_reminder ?? 0)}</span>
            </div>
            <div className="text-gray-300">•</div>
            <div className="flex items-center gap-1 text-gray-500">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(reminder.reminder_date)}
            </div>
          </div>
        )}

        {reminder.address && (
          <div className="flex items-start gap-1.5 mb-3 text-sm text-gray-500">
            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-1">{reminder.address}</span>
          </div>
        )}

        {reminder.last_reminder_sent && (
          <p className="text-xs text-gray-400 mb-3">
            Last reminder: {formatDate(reminder.last_reminder_sent)}
          </p>
        )}

        <button
          onClick={() => onSendReminder(reminder)}
          disabled={!canSend}
          className="whatsapp-btn w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#25D366] hover:bg-[#20BD5A] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
        >
          <MessageCircle className="w-5 h-5" />
          {reminder.status === 'opted_out'
            ? 'Opted out'
            : reminder.status === 'paused'
            ? 'Paused'
            : reminder.status === 'no_sales'
            ? 'No sales yet'
            : 'Send WhatsApp Reminder'}
        </button>
      </div>
    </div>
  );
}
