/**
 * GET/POST /api/whatsapp-webhook
 *
 * Receives delivery / read / failed status updates and inbound messages from
 * AiSensy (which forwards Meta's webhook format).
 *
 * Configure in AiSensy console:
 *   Webhook URL:    https://shreeshyampharmacy.com/api/whatsapp-webhook
 *   Verify token:   value of WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
 *
 * Meta-style verification handshake on first save (GET with hub.* params).
 * We use the verify-token check; HMAC signing is out of scope for AiSensy v2.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// --- GET: verification handshake (Meta-style) ---
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode  = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

// --- POST: status + incoming messages ---
export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // Meta forwards in this shape:
  //   { object: 'whatsapp_business_account',
  //     entry: [{ changes: [{ field: 'messages', value: { statuses, messages, ... } }] }] }
  const sb = getServiceClient();
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const v = change?.value || {};

      // Outgoing status updates
      const statuses = Array.isArray(v.statuses) ? v.statuses : [];
      for (const s of statuses) {
        const waId = s.id;       // wamid...
        if (!waId) continue;
        const update: Record<string, any> = {};
        const status = String(s.status || '').toLowerCase();
        if (status === 'sent')      update.status = 'sent';
        if (status === 'delivered') {
          update.status = 'delivered';
          update.delivered_at = new Date(parseInt(s.timestamp, 10) * 1000).toISOString();
        }
        if (status === 'read') {
          update.status = 'read';
          update.read_at = new Date(parseInt(s.timestamp, 10) * 1000).toISOString();
        }
        if (status === 'failed') {
          update.status = 'failed';
          update.failed_reason =
            s.errors?.[0]?.title || s.errors?.[0]?.message || 'failed';
        }
        if (Object.keys(update).length) {
          await sb.from('reminders').update(update).eq('wa_message_id', waId);
        }
      }

      // Inbound messages — log into a future whatsapp_messages table.
      // For now, console-log so it appears in Vercel function logs.
      const messages = Array.isArray(v.messages) ? v.messages : [];
      for (const m of messages) {
        const text = m.text?.body || m.button?.text || '<non-text>';
        const from = m.from;
        const ts = m.timestamp;
        // Detect STOP / unsubscribe
        if (/^(stop|unsubscribe|remove|बंद|நிறுத்தm)/i.test(String(text).trim())) {
          // best-effort opt-out by phone
          await sb
            .from('customers')
            .update({
              whatsapp_opt_out: true,
              whatsapp_opt_out_at: new Date().toISOString(),
            })
            .eq('phone', String(from).replace(/^91/, ''));
        }
        // Future: insert into whatsapp_messages table when migration adds it
        console.log('[whatsapp-webhook] inbound', { from, text, ts });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
