/**
 * AiSensy WhatsApp Business API client.
 *
 * AiSensy is the BSP. Once a Meta-approved utility template is created in their
 * console, sending is a single POST against their campaign endpoint.
 *
 * Docs: https://docs.aisensy.com/
 */

export interface AiSensySendResult {
  ok: boolean;
  messageId?: string;        // wamid... — from Meta, used to correlate webhook updates
  apiResponse?: unknown;
  error?: string;
}

interface AiSensySendArgs {
  apiKey: string;            // AiSensy API key (long JWT-ish string)
  campaignName: string;      // = template name configured in AiSensy
  destination: string;       // 12-digit "91XXXXXXXXXX"
  userName: string;          // shown in AiSensy logs only
  templateParams: string[];  // {{1}}, {{2}}, ... in template body order
  mediaUrl?: string;         // for templates with header image/document
  source?: string;           // analytics tag
}

const ENDPOINT = 'https://backend.aisensy.com/campaign/t1/api/v2';

export async function sendAiSensyTemplate(
  args: AiSensySendArgs,
): Promise<AiSensySendResult> {
  if (!args.apiKey) return { ok: false, error: 'AISENSY_API_KEY not configured' };
  if (!/^91\d{10}$/.test(args.destination)) {
    return { ok: false, error: `invalid destination: ${args.destination}` };
  }

  const body = {
    apiKey: args.apiKey,
    campaignName: args.campaignName,
    destination: args.destination,
    userName: args.userName,
    templateParams: args.templateParams,
    source: args.source ?? 'shree-shyam-pharmacy-dashboard',
    media: args.mediaUrl ? { url: args.mediaUrl, filename: 'image.jpg' } : {},
    buttons: [],
    carouselCards: [],
    location: {},
    paramsFallbackValue: {},
  };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    return { ok: false, error: `network error: ${e.message}` };
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response — capture status
  }

  if (!res.ok) {
    return {
      ok: false,
      apiResponse: json,
      error: json?.message || json?.error || `HTTP ${res.status}`,
    };
  }

  // AiSensy success shapes vary; common fields: { submitted: true, id: 'wamid...' }
  const messageId =
    json?.data?.[0]?.id ||
    json?.data?.id ||
    json?.id ||
    json?.messageId;

  return {
    ok: json?.submitted !== false && json?.success !== false,
    messageId,
    apiResponse: json,
  };
}

/**
 * Format a phone number to '91XXXXXXXXXX' (12 digits, no plus).
 */
export function formatDestination(rawPhone: string): string {
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return '91' + digits;
  return digits;   // best-effort; caller should validate
}

/**
 * Build the parameter array for the refill_reminder utility template.
 * Template body (proposed text — confirm exact wording in AiSensy console):
 *
 *   Hello {{1}}, your prescription refill is due on {{2}}.
 *   Please reply or call +91 9100855455 to place your order.
 *   - Shree Shyam Pharmacy, Ameerpet
 *
 * So {{1}} = customer name, {{2}} = formatted reminder date.
 */
export function buildReminderParams(opts: {
  customerName: string;
  reminderDateISO: string | null;   // 'YYYY-MM-DD'
}): string[] {
  const date = opts.reminderDateISO
    ? new Date(opts.reminderDateISO).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'soon';
  return [opts.customerName.trim(), date];
}
