import { PHARMACY_INFO, WHATSAPP_TEMPLATES } from './constants';
import { supabase } from './supabase';

/**
 * Generate a WhatsApp click-to-chat URL.
 * Accepts any phone format — strips non-digits, prepends 91 if 10-digit.
 */
export function generateWhatsAppUrl(phone: string, message: string): string {
  let cleanPhone = String(phone).replace(/[\s\-\(\)+]/g, '');
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

type Lang = 'en' | 'te' | 'hi';

function daysPhrase(daysUntilRefill: number, lang: Lang): string {
  const absDays = Math.abs(daysUntilRefill);
  if (daysUntilRefill < 0) {
    if (lang === 'te') return `${absDays} రోజుల క్రితం అయిపోయాయి`;
    if (lang === 'hi') return `${absDays} दिन पहले खत्म हो गई हैं`;
    return `ran out ${absDays} day${absDays > 1 ? 's' : ''} ago`;
  }
  if (daysUntilRefill === 0) {
    if (lang === 'te') return 'ఈ రోజు అయిపోతాయి';
    if (lang === 'hi') return 'आज खत्म हो रही हैं';
    return 'will run out today';
  }
  if (daysUntilRefill === 1) {
    if (lang === 'te') return 'రేపు అయిపోతాయి';
    if (lang === 'hi') return 'कल खत्म हो रही हैं';
    return 'will run out tomorrow';
  }
  if (lang === 'te') return `${daysUntilRefill} రోజుల్లో అయిపోతాయి`;
  if (lang === 'hi') return `${daysUntilRefill} दिनों में खत्म हो जाएँगी`;
  return `will run out in ${daysUntilRefill} days`;
}

/**
 * Generate a customer-level refill reminder message (no medication detail).
 */
export function generateReminderMessage(
  customerName: string,
  daysUntilRefill: number,
  language: Lang = 'en',
): string {
  const phrase = daysPhrase(daysUntilRefill, language);
  if (language === 'te') return WHATSAPP_TEMPLATES.refillReminderTelugu(customerName, phrase);
  if (language === 'hi') return WHATSAPP_TEMPLATES.refillReminderHindi(customerName, phrase);
  return WHATSAPP_TEMPLATES.refillReminder(customerName, phrase);
}

/**
 * Open a new-tab WhatsApp chat pre-filled with the reminder.
 * Returns true if the window opened.
 */
export function openWhatsAppReminder(
  phone: string,
  customerName: string,
  daysUntilRefill: number,
  language: Lang = 'en',
): boolean {
  const message = generateReminderMessage(customerName, daysUntilRefill, language);
  const url = generateWhatsAppUrl(phone, message);
  return window.open(url, '_blank', 'noopener,noreferrer') !== null;
}

/** Format 10-digit Indian number as "XXXXX XXXXX" */
export function formatPhoneDisplay(phone: string): string {
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) return `${clean.slice(0, 5)} ${clean.slice(5)}`;
  if (clean.length === 12 && clean.startsWith('91')) return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  return phone;
}

/**
 * Generate an outstanding-due reminder message ("you owe ₹X, please clear it").
 * Used by the /dashboard/pending bulk-send action.
 */
export function generateDueMessage(
  customerName: string,
  outstandingAmount: number,
  language: Lang = 'en',
): string {
  const amt = `₹${Math.round(outstandingAmount).toLocaleString('en-IN')}`;
  const customer = customerName.trim();

  if (language === 'te') {
    return `🏥 *${PHARMACY_INFO.name}*

నమస్కారం ${customer} గారు,

మీ బకాయి *${amt}* ఉంది. దయచేసి సౌకర్యంగా ఉన్నప్పుడు చెల్లించండి.

📍 ${PHARMACY_INFO.address}
📞 ${PHARMACY_INFO.phone}

ధన్యవాదాలు! 🙏`;
  }
  if (language === 'hi') {
    return `🏥 *${PHARMACY_INFO.name}*

Namaste ${customer} ji,

आपका बकाया *${amt}* है। कृपया जब सुविधा हो भुगतान कर दीजिए।

📍 ${PHARMACY_INFO.address}
📞 ${PHARMACY_INFO.phone}

धन्यवाद! 🙏`;
  }
  return `🏥 *${PHARMACY_INFO.name}*

Namaste ${customer} ji,

This is a friendly reminder that your outstanding balance is *${amt}*.
Please clear it at your convenience — visit us or pay online.

📍 ${PHARMACY_INFO.address}
📞 ${PHARMACY_INFO.phone}

Thank you! 🙏`;
}

// ============================================================================
// Reminder type detection + message picker
// ============================================================================

export type ReminderKind = 'due' | 'refill' | 'combined';

export interface ReminderPick {
  kind: ReminderKind;
  message: string;
  templateName: string;     // for the reminders.template_name column
  reasonLabel: string;      // for UI ("₹15,340 outstanding · refill 2 days overdue")
}

// Editable templates from migration 006/007
export interface MessageTemplate {
  id: string;
  slug: string;
  kind: 'refill' | 'due' | 'marketing';
  language: Lang;
  label: string;
  body: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface RenderVars {
  customer_name: string;
  outstanding: number;          // raw number; rendered as ₹X,XXX
  days_until_refill: number | null;
  phone?: string;
  address?: string | null;
  last_purchase_date?: string | null;
}

/**
 * Render a template body, substituting {{placeholders}} with values.
 * Unknown placeholders are left in place (helps debug).
 */
export function renderTemplate(body: string, vars: RenderVars, lang: Lang = 'en'): string {
  const customerName = vars.customer_name.trim();
  const firstName = customerName.split(/\s+/)[0] || customerName;
  const outRupees = `₹${Math.round(vars.outstanding).toLocaleString('en-IN')}`;
  const days = vars.days_until_refill;
  const renderedDaysPhrase =
    days === null || days === undefined ? '' : daysPhrase(days, lang);
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const dict: Record<string, string> = {
    customer_name:        customerName,
    customer_first_name:  firstName,
    outstanding:          outRupees,
    outstanding_amount:   String(Math.round(vars.outstanding)),
    days_until_refill:    days === null || days === undefined ? '' : String(days),
    days_phrase:          renderedDaysPhrase,
    phone:                vars.phone || '',
    address:              vars.address || '',
    last_purchase_date:   vars.last_purchase_date || '',
    shop_name:            PHARMACY_INFO.name,
    shop_phone:           PHARMACY_INFO.phone,
    shop_address:         PHARMACY_INFO.address,
    date:                 today,
  };

  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, key) => {
    const k = String(key).toLowerCase();
    return dict[k] !== undefined ? dict[k] : `{{${key}}}`;
  });
}

/**
 * Load all active message templates from Supabase.
 * Cache on the client and pass to pickReminderFromTemplates.
 */
export async function loadMessageTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('is_active', true)
    .order('kind')
    .order('language');
  if (error) {
    console.error('loadMessageTemplates:', error.message);
    return [];
  }
  return (data || []) as MessageTemplate[];
}

/**
 * Build a ReminderPick using DB-loaded templates (preferred over the hardcoded
 * pickReminder()). Falls back to the hardcoded version if no template matches.
 */
export function pickReminderFromTemplates(opts: {
  customerName: string;
  outstanding: number;
  daysUntilRefill: number | null;
  language?: Lang;
  phone?: string;
  address?: string | null;
  lastPurchaseDate?: string | null;
  templates: MessageTemplate[];
}): ReminderPick | null {
  const lang = opts.language ?? 'en';
  const owesMoney = opts.outstanding > 0;
  const refillDue = opts.daysUntilRefill !== null && opts.daysUntilRefill <= 7;
  if (!owesMoney && !refillDue) return null;

  const parts: string[] = [];
  if (owesMoney) {
    parts.push(`₹${Math.round(opts.outstanding).toLocaleString('en-IN')} outstanding`);
  }
  if (refillDue) {
    const d = opts.daysUntilRefill!;
    parts.push(
      d < 0 ? `refill ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue` :
      d === 0 ? 'refill due today' :
      d === 1 ? 'refill due tomorrow' :
      `refill in ${d} days`
    );
  }
  const reasonLabel = parts.join(' · ');

  const wantedKind: 'refill' | 'due' = owesMoney ? 'due' : 'refill';
  const tmpl =
    opts.templates.find((t) => t.is_active && t.kind === wantedKind && t.language === lang) ||
    opts.templates.find((t) => t.is_active && t.kind === wantedKind && t.language === 'en');

  if (!tmpl) {
    // Fallback to hardcoded
    const fallback = pickReminder({
      customerName: opts.customerName,
      outstanding: opts.outstanding,
      daysUntilRefill: opts.daysUntilRefill,
      language: lang,
    });
    return fallback;
  }

  const message = renderTemplate(tmpl.body, {
    customer_name: opts.customerName,
    outstanding: opts.outstanding,
    days_until_refill: opts.daysUntilRefill,
    phone: opts.phone,
    address: opts.address,
    last_purchase_date: opts.lastPurchaseDate,
  }, lang);

  return {
    kind: refillDue && owesMoney ? 'combined' : wantedKind,
    message,
    templateName: tmpl.slug,
    reasonLabel,
  };
}

// Re-export for places that still import the legacy hardcoded picker

interface PickInput {
  customerName: string;
  outstanding: number;
  daysUntilRefill: number | null;   // negative = overdue
  language?: Lang;
}

/**
 * Decide which type of reminder to send based on the customer's state.
 * Outstanding > 0 takes priority since unpaid bills are more urgent
 * than upcoming refill reminders.
 */
export function pickReminder(opts: PickInput): ReminderPick | null {
  const lang = opts.language ?? 'en';
  const owesMoney = opts.outstanding > 0;
  const refillDue = opts.daysUntilRefill !== null && opts.daysUntilRefill <= 7;

  if (!owesMoney && !refillDue) return null;

  // Reason label assembled from both signals
  const parts: string[] = [];
  if (owesMoney) {
    parts.push(`₹${Math.round(opts.outstanding).toLocaleString('en-IN')} outstanding`);
  }
  if (refillDue) {
    const d = opts.daysUntilRefill!;
    parts.push(
      d < 0 ? `refill ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue` :
      d === 0 ? 'refill due today' :
      d === 1 ? 'refill due tomorrow' :
      `refill in ${d} days`
    );
  }
  const reasonLabel = parts.join(' · ');

  // Outstanding wins — staff probably wants to collect money first
  if (owesMoney) {
    return {
      kind: refillDue ? 'combined' : 'due',
      message: generateDueMessage(opts.customerName, opts.outstanding, lang),
      templateName: refillDue ? 'manual_combined_due_first' : 'manual_due',
      reasonLabel,
    };
  }
  // Pure refill reminder
  return {
    kind: 'refill',
    message: generateReminderMessage(opts.customerName, opts.daysUntilRefill ?? 0, lang),
    templateName: 'manual_refill',
    reasonLabel,
  };
}

// ============================================================================
// Mark reminder as sent (semi-automated workflow)
// ============================================================================

export interface MarkSentArgs {
  customerId: string;
  salesTransactionId?: string | null;
  templateName: string;
  templateLanguage: Lang;
  messageContent: string;
  sentBy?: string;
}

export interface MarkSentResult {
  ok: boolean;
  reminderId?: string;
  error?: string;
}

/**
 * Insert a reminder row recording that staff manually sent a WhatsApp
 * message via wa.me click-to-chat. No external API call — purely a
 * tracking write so the dashboard can show "already sent today" state.
 */
export async function markReminderSent(args: MarkSentArgs): Promise<MarkSentResult> {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      customer_id:           args.customerId,
      sales_transaction_id:  args.salesTransactionId ?? null,
      channel:               'whatsapp',
      send_method:           'manual_walink',
      status:                'sent',
      template_name:         args.templateName,
      template_language:     args.templateLanguage,
      message_content:       args.messageContent,
      sent_at:               new Date().toISOString(),
      sent_by:               args.sentBy ?? 'staff',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, reminderId: data.id };
}

/** Undo a mark-sent — used by the toast undo link. */
export async function undoReminderSent(reminderId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('reminders').delete().eq('id', reminderId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Has this customer already had a reminder sent today (since midnight local)?
 * Used for the "Hide already sent today" filter and to show a check on rows.
 */
export async function getRemindersSentToday(customerIds: string[]): Promise<Map<string, { id: string; sent_at: string }>> {
  if (!customerIds.length) return new Map();
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('reminders')
    .select('id, customer_id, sent_at')
    .in('customer_id', customerIds)
    .eq('channel', 'whatsapp')
    .in('status', ['sent', 'delivered', 'read'])
    .gte('sent_at', todayMidnight.toISOString())
    .order('sent_at', { ascending: false });

  const map = new Map<string, { id: string; sent_at: string }>();
  for (const r of data || []) {
    if (!map.has(r.customer_id)) {
      map.set(r.customer_id, { id: r.id, sent_at: r.sent_at });
    }
  }
  return map;
}

/** Indian 10-digit (starts 6-9) or 12-digit with 91 prefix */
export function isValidIndianPhone(phone: string): boolean {
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10 && /^[6-9]/.test(clean)) return true;
  if (clean.length === 12 && /^91[6-9]/.test(clean)) return true;
  return false;
}

export { PHARMACY_INFO };
