'use client';

import { useState } from 'react';
import { Bell, ExternalLink, Loader2, Send } from 'lucide-react';

interface DailySummary {
  overdue: number;
  urgent: number;
  today: number;
  total: number;
}

interface DailySummaryWidgetProps {
  stats: {
    overdue: number;
    urgent: number;
    soon: number;
    total: number;
  };
  ownerPhone: string;
  appUrl: string;
}

export default function DailySummaryWidget({ stats, ownerPhone, appUrl }: DailySummaryWidgetProps) {
  const [sending, setSending] = useState(false);

  const pendingCount = stats.overdue + stats.urgent;

  const generateMessage = () => {
    const date = new Date().toLocaleDateString('en-IN', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });

    let urgencyText = '';
    if (stats.overdue > 0) {
      urgencyText = `🔴 ${stats.overdue} OVERDUE - Need immediate attention!\n`;
    }

    return `🏥 *Shree Shyam Pharmacy*
📅 Daily Reminder Summary
${date}

━━━━━━━━━━━━━━━
📊 *Today's Pending Reminders*
━━━━━━━━━━━━━━━
${urgencyText}🟠 Urgent: ${stats.urgent}
🔵 Due Soon: ${stats.soon}
📋 Total Pending: ${stats.overdue + stats.urgent + stats.soon}

👉 *Open app to send reminders:*
${appUrl}

━━━━━━━━━━━━━━━
_Daily summary from your app_`;
  };

  const handleSendSummary = () => {
    setSending(true);
    const message = generateMessage();
    const whatsappUrl = `https://wa.me/${ownerPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    setTimeout(() => setSending(false), 1000);
  };

  if (pendingCount === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-4 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold">
              {pendingCount} reminders need attention
            </p>
            <p className="text-sm text-white/80">
              {stats.overdue > 0 && `${stats.overdue} overdue • `}
              {stats.urgent} urgent
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSendSummary}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 bg-white text-primary-600 font-medium rounded-lg hover:bg-white/90 transition-all disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Send Summary
        </button>
      </div>
    </div>
  );
}
