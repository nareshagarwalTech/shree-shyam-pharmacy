import { PHARMACY_INFO, WHATSAPP_TEMPLATES } from './constants';

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

/** Indian 10-digit (starts 6-9) or 12-digit with 91 prefix */
export function isValidIndianPhone(phone: string): boolean {
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10 && /^[6-9]/.test(clean)) return true;
  if (clean.length === 12 && /^91[6-9]/.test(clean)) return true;
  return false;
}

export { PHARMACY_INFO };
