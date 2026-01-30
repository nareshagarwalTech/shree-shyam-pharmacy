import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Your WhatsApp number (with country code, no + sign)
const OWNER_PHONE = process.env.OWNER_WHATSAPP_NUMBER || '919876543210';

// Your app URL
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://shree-shyam-pharmacy.vercel.app';

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch reminders due today or overdue
    const { data: reminders, error } = await supabase
      .from('customer_reminders')
      .select('*')
      .lte('refill_date', today)
      .order('days_until_refill', { ascending: true });

    if (error) throw error;

    const overdueCount = reminders?.filter(r => r.status === 'overdue').length || 0;
    const urgentCount = reminders?.filter(r => r.status === 'urgent').length || 0;
    const todayCount = reminders?.filter(r => r.days_until_refill === 0).length || 0;
    const totalCount = reminders?.length || 0;

    // If no reminders, still log but don't send WhatsApp
    if (totalCount === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No reminders due today',
        sent: false 
      });
    }

    // Create summary message
    const message = generateSummaryMessage(overdueCount, urgentCount, todayCount, totalCount, APP_URL);
    
    // Generate WhatsApp URL for owner
    const whatsappUrl = `https://wa.me/${OWNER_PHONE}?text=${encodeURIComponent(message)}`;

    // Log the cron run
    console.log(`[CRON] Daily summary: ${totalCount} reminders pending`);
    console.log(`[CRON] WhatsApp URL generated for owner`);

    // Return success with details
    return NextResponse.json({ 
      success: true,
      summary: {
        overdue: overdueCount,
        urgent: urgentCount,
        today: todayCount,
        total: totalCount,
      },
      whatsappUrl,
      message: 'Daily summary generated',
    });

  } catch (error) {
    console.error('[CRON] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to generate summary' 
    }, { status: 500 });
  }
}

function generateSummaryMessage(
  overdue: number, 
  urgent: number, 
  today: number, 
  total: number,
  appUrl: string
): string {
  const date = new Date().toLocaleDateString('en-IN', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'short',
    year: 'numeric'
  });

  let urgencyText = '';
  if (overdue > 0) {
    urgencyText = `🔴 ${overdue} OVERDUE - Need immediate attention!\n`;
  }

  return `🏥 *Shree Shyam Pharmacy*
📅 Daily Reminder Summary
${date}

━━━━━━━━━━━━━━━
📊 *Today's Pending Reminders*
━━━━━━━━━━━━━━━
${urgencyText}🟠 Urgent: ${urgent}
🔵 Due Today: ${today}
📋 Total Pending: ${total}

👉 *Open app to send reminders:*
${appUrl}

━━━━━━━━━━━━━━━
_Automated daily summary_`;
}
