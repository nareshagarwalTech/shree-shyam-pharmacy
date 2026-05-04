'use client';

import { CustomerNextReminder } from '@/lib/supabase';
import { STATUS_CONFIG } from '@/lib/constants';
import { formatDate, getDaysText } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/whatsapp';
import { MessageCircle, CheckSquare, Square } from 'lucide-react';

interface Props {
  reminders: CustomerNextReminder[];
  onSendReminder: (r: CustomerNextReminder) => void;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export default function CustomerTable({
  reminders,
  onSendReminder,
  selected,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const allSelected =
    selected && reminders.length > 0 && reminders.every((r) => selected.has(r.customer_id));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="table-wrapper">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {onToggleSelect && (
                <th className="px-2 py-3 w-10">
                  <button
                    onClick={onToggleSelectAll}
                    className="text-gray-500 hover:text-emerald-600"
                    aria-label="Select all"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
              )}
              <Th>Customer</Th>
              <Th>Groups</Th>
              <Th>Last Purchase</Th>
              <Th>Reminder Date</Th>
              <Th>Status</Th>
              <Th>Last Reminded</Th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reminders.map((r) => {
              const cfg = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.ok;
              const canSend =
                r.status !== 'opted_out' && r.status !== 'no_sales' && r.status !== 'paused';
              return (
                <tr key={r.customer_id} className="table-row-hover transition-colors">
                  {onToggleSelect && (
                    <td className="px-2 py-3">
                      {canSend && (
                        <button
                          onClick={() => onToggleSelect(r.customer_id)}
                          className="text-gray-400 hover:text-emerald-600"
                          aria-label="Select"
                        >
                          {selected?.has(r.customer_id) ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.customer_name}</div>
                    <div className="text-xs text-gray-500">{formatPhoneDisplay(r.phone)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {r.group_names && r.group_names.length > 0 ? (
                      <span className="truncate inline-block max-w-[200px]">
                        {r.group_names.slice(0, 2).join(', ')}
                        {r.group_names.length > 2 ? `, +${r.group_names.length - 2}` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.last_purchase_date ? (
                      <>
                        <div className="text-sm text-gray-900">
                          {formatDate(r.last_purchase_date)}
                        </div>
                        <div className="text-xs text-gray-500">
                          #{r.last_feed_no}
                          {r.last_for_days ? ` · ${r.last_for_days}d` : ''}
                          {r.last_amount != null ? ` · ₹${r.last_amount}` : ''}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.reminder_date ? (
                      <>
                        <div className="text-sm text-gray-900">{formatDate(r.reminder_date)}</div>
                        <div className="text-xs text-gray-500">
                          {getDaysText(r.days_until_reminder ?? 0)}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.last_reminder_sent ? (
                      formatDate(r.last_reminder_sent)
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onSendReminder(r)}
                      disabled={!canSend}
                      className="whatsapp-btn inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20BD5A] disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
      {children}
    </th>
  );
}
