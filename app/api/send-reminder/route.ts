/**
 * POST /api/send-reminder
 *
 * Server-side reminder dispatch. Reads the customer + their latest sale,
 * checks opt-out / pause / no-sales, writes a reminders row, and either:
 *   (a) calls AiSensy → updates row with wa_message_id (status='sent')
 *   (b) returns a wa.me fallback URL if AiSensy isn't configured (status='sent', send_method='manual_walink')
 *
 * Body:    { customer_id: string, language?: 'en' | 'te' | 'hi' }
 * Returns: { ok: boolean, reminder_id?: string, fallback_url?: string, error?: string }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendAiSensyTemplate, formatDestination, buildReminderParams } from '@/lib/aisensy';
import { generateReminderMessage, generateWhatsAppUrl } from '@/lib/whatsapp';

type CustomerView = {
  customer_id: string;
  phone: string;
  customer_name: string;
  preferred_language: 'en' | 'te' | 'hi';
  whatsapp_opt_out: boolean;
  reminders_paused_until: string | null;
  status: string;
  last_sale_id: string | null;
  reminder_date: string | null;
  days_until_reminder: number | null;
  reminder_trigger_date: string | null;
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  let body: { customer_id?: string; language?: 'en' | 'te' | 'hi' } = {};
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

  // 1. Read customer + latest sale via the view
  const { data: custData, error: cErr } = await supabase
    .from('customer_next_reminder')
    .select(
      'customer_id, phone, customer_name, preferred_language, whatsapp_opt_out, ' +
      'reminders_paused_until, status, last_sale_id, reminder_date, ' +
      'days_until_reminder, reminder_trigger_date',
    )
    .eq('customer_id', customerId)
    .single<CustomerView>();
  const cust = custData as CustomerView | null;

  if (cErr || !cust) {
    return NextResponse.json(
      { ok: false, error: cErr?.message || 'Customer not found' },
      { status: 404 },
    );
  }

  if (cust.whatsapp_opt_out) {
    return NextResponse.json({ ok: false, error: 'Customer is opted out' }, { status: 409 });
  }
  if (
    cust.reminders_paused_until &&
    new Date(cust.reminders_paused_until) >= new Date()
  ) {
    return NextResponse.json(
      { ok: false, error: `Reminders paused until ${cust.reminders_paused_until}` },
      { status: 409 },
    );
  }

  const language = body.language ?? cust.preferred_language ?? 'en';
  const days = cust.days_until_reminder ?? 0;

  // 2. Idempotency guard: prevent double-send within 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .gte('created_at', fiveMinutesAgo)
    .in('status', ['queued', 'sent', 'delivered', 'read']);
  if ((recentCount ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: 'A reminder was already sent recently. Please wait 5 minutes.' },
      { status: 429 },
    );
  }

  // 3. Insert a queued reminder row
  const { data: reminderRow, error: insErr } = await supabase
    .from('reminders')
    .insert({
      customer_id: customerId,
      sales_transaction_id: cust.last_sale_id,
      scheduled_for: cust.reminder_trigger_date,
      channel: 'whatsapp',
      send_method: 'queued',
      status: 'queued',
      template_language: language,
    })
    .select()
    .single();

  if (insErr || !reminderRow) {
    return NextResponse.json(
      { ok: false, error: insErr?.message || 'Could not create reminder' },
      { status: 500 },
    );
  }

  // 4. Try AiSensy if configured
  const apiKey = process.env.AISENSY_API_KEY;
  const campaignName =
    (language === 'te' && process.env.AISENSY_CAMPAIGN_TE) ||
    (language === 'hi' && process.env.AISENSY_CAMPAIGN_HI) ||
    process.env.AISENSY_CAMPAIGN_EN ||
    process.env.AISENSY_CAMPAIGN_NAME;

  if (apiKey && campaignName) {
    const result = await sendAiSensyTemplate({
      apiKey,
      campaignName,
      destination: formatDestination(cust.phone),
      userName: cust.customer_name,
      templateParams: buildReminderParams({
        customerName: cust.customer_name,
        reminderDateISO: cust.reminder_date,
      }),
      source: `dashboard-${reminderRow.id}`,
    });

    const update: Record<string, any> = {
      send_method: 'api_automated',
      template_name: campaignName,
      sent_at: new Date().toISOString(),
    };

    if (result.ok) {
      update.status = 'sent';
      update.wa_message_id = result.messageId ?? null;
    } else {
      update.status = 'failed';
      update.failed_reason = result.error || 'AiSensy returned non-ok';
    }

    await supabase.from('reminders').update(update).eq('id', reminderRow.id);

    return NextResponse.json({
      ok: result.ok,
      reminder_id: reminderRow.id,
      message_id: result.messageId,
      error: result.ok ? undefined : update.failed_reason,
    });
  }

  // 5. Fallback: no AiSensy configured. Return a wa.me URL the client can open.
  const message = generateReminderMessage(cust.customer_name, days, language);
  const fallbackUrl = generateWhatsAppUrl(cust.phone, message);

  await supabase
    .from('reminders')
    .update({
      send_method: 'manual_walink',
      status: 'sent',
      sent_at: new Date().toISOString(),
      message_content: message,
    })
    .eq('id', reminderRow.id);

  return NextResponse.json({
    ok: true,
    reminder_id: reminderRow.id,
    fallback_url: fallbackUrl,
    fallback_reason:
      'AiSensy not configured — using wa.me click-to-chat. Open the URL to send.',
  });
}
