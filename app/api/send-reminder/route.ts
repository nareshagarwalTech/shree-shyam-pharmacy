/**
 * POST /api/send-reminder
 *
 * Semi-automated reminder dispatch. We removed the direct WhatsApp Cloud API
 * (AiSensy) integration to keep cost at zero — staff send via the WhatsApp
 * app on their phone using a wa.me click-to-chat link, then the dashboard
 * records the send in the `reminders` table for tracking.
 *
 * This endpoint is kept as a server-side helper that:
 *   1. Reads the customer + their latest sale from customer_next_reminder
 *   2. Validates opt-out / pause state
 *   3. Generates a wa.me URL with the appropriate message
 *   4. (Optionally) inserts a reminders row when `mark_sent: true`
 *   5. Returns the wa.me URL so the client can open it
 *
 * Body:    { customer_id: string, language?: 'en'|'te'|'hi', mark_sent?: boolean }
 * Returns: { ok, reminder_id?, fallback_url, message_preview, error? }
 *
 * For finer client-side control, prefer the helpers in lib/whatsapp.ts:
 *   - pickReminder()           → choose message + label
 *   - generateWhatsAppUrl()    → build wa.me URL
 *   - markReminderSent()       → insert reminders row
 *   - undoReminderSent()       → delete it
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  pickReminder,
  generateWhatsAppUrl,
} from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CustomerView = {
  customer_id: string;
  phone: string;
  customer_name: string;
  preferred_language: 'en' | 'te' | 'hi';
  whatsapp_opt_out: boolean;
  reminders_paused_until: string | null;
  last_sale_id: string | null;
  reminder_date: string | null;
  days_until_reminder: number | null;
  outstanding: number | null;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  let body: { customer_id?: string; language?: 'en' | 'te' | 'hi'; mark_sent?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const customerId = body.customer_id;
  if (!customerId) {
    return NextResponse.json({ ok: false, error: 'customer_id is required' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }

  // Read customer + latest sale via the view
  const { data: cust, error: cErr } = await supabase
    .from('customer_next_reminder')
    .select(
      'customer_id, phone, customer_name, preferred_language, whatsapp_opt_out, ' +
        'reminders_paused_until, last_sale_id, reminder_date, days_until_reminder, outstanding',
    )
    .eq('customer_id', customerId)
    .single<CustomerView>();

  if (cErr || !cust) {
    return NextResponse.json(
      { ok: false, error: cErr?.message || 'Customer not found' },
      { status: 404 },
    );
  }
  if (cust.whatsapp_opt_out) {
    return NextResponse.json({ ok: false, error: 'Customer is opted out' }, { status: 409 });
  }
  if (cust.reminders_paused_until && new Date(cust.reminders_paused_until) >= new Date()) {
    return NextResponse.json(
      { ok: false, error: `Reminders paused until ${cust.reminders_paused_until}` },
      { status: 409 },
    );
  }

  const language = body.language ?? cust.preferred_language ?? 'en';

  const pick = pickReminder({
    customerName: cust.customer_name,
    outstanding: Number(cust.outstanding || 0),
    daysUntilRefill: cust.days_until_reminder,
    language,
  });

  if (!pick) {
    return NextResponse.json(
      { ok: false, error: 'Customer has no outstanding balance and no upcoming refill' },
      { status: 409 },
    );
  }

  const fallbackUrl = generateWhatsAppUrl(cust.phone, pick.message);

  // Optionally insert a reminders row
  let reminderId: string | null = null;
  if (body.mark_sent) {
    const { data: rem, error: insErr } = await supabase
      .from('reminders')
      .insert({
        customer_id: customerId,
        sales_transaction_id: cust.last_sale_id,
        channel: 'whatsapp',
        send_method: 'manual_walink',
        status: 'sent',
        template_name: pick.templateName,
        template_language: language,
        message_content: pick.message,
        sent_at: new Date().toISOString(),
        sent_by: 'staff',
      })
      .select('id')
      .single();
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: insErr.message, fallback_url: fallbackUrl },
        { status: 500 },
      );
    }
    reminderId = rem?.id ?? null;
  }

  return NextResponse.json({
    ok: true,
    reminder_id: reminderId,
    fallback_url: fallbackUrl,
    message_preview: pick.message,
    reason_label: pick.reasonLabel,
    kind: pick.kind,
  });
}
