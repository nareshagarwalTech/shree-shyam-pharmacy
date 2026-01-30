import { PHARMACY_INFO, WHATSAPP_TEMPLATES } from './constants';

/**
 * Generate WhatsApp click-to-chat URL
 * Opens WhatsApp with pre-filled message
 */
export function generateWhatsAppUrl(phone: string, message: string): string {
  // Clean phone number - remove spaces, dashes, etc.
  let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  
  // Add country code if not present (India = 91)
  if (!cleanPhone.startsWith('+') && !cleanPhone.startsWith('91')) {
    cleanPhone = '91' + cleanPhone;
  }
  if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.substring(1);
  }
  
  // URL encode the message
  const encodedMessage = encodeURIComponent(message);
  
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

/**
 * Generate reminder message based on days until refill
 */
export function generateReminderMessage(
  customerName: string,
  medicationName: string,
  daysUntilRefill: number,
  language: 'english' | 'telugu' = 'english'
): string {
  let daysText: string;
  
  if (daysUntilRefill < 0) {
    const overdueDays = Math.abs(daysUntilRefill);
    daysText = language === 'telugu' 
      ? `${overdueDays} రోజులు ఆలస్యమైంది` 
      : `is overdue by ${overdueDays} day${overdueDays > 1 ? 's' : ''}`;
  } else if (daysUntilRefill === 0) {
    daysText = language === 'telugu' 
      ? 'ఈ రోజు రీఫిల్ చేయాలి' 
      : 'needs refill today';
  } else if (daysUntilRefill === 1) {
    daysText = language === 'telugu' 
      ? 'రేపు రీఫిల్ చేయాలి' 
      : 'needs refill tomorrow';
  } else {
    daysText = language === 'telugu' 
      ? `${daysUntilRefill} రోజుల్లో రీఫిల్ చేయాలి` 
      : `is due for refill in ${daysUntilRefill} days`;
  }
  
  if (language === 'telugu') {
    return WHATSAPP_TEMPLATES.refillReminderTelugu(customerName, medicationName, daysText);
  }
  
  return WHATSAPP_TEMPLATES.refillReminder(customerName, medicationName, daysText);
}

/**
 * Open WhatsApp with reminder message
 * Returns true if window was opened
 */
export function openWhatsAppReminder(
  phone: string,
  customerName: string,
  medicationName: string,
  daysUntilRefill: number,
  language: 'english' | 'telugu' = 'english'
): boolean {
  const message = generateReminderMessage(customerName, medicationName, daysUntilRefill, language);
  const url = generateWhatsAppUrl(phone, message);
  
  // Open in new tab
  const newWindow = window.open(url, '_blank');
  
  return newWindow !== null;
}

/**
 * Format phone number for display
 */
export function formatPhoneDisplay(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  
  // Indian format: XXXXX XXXXX
  if (clean.length === 10) {
    return `${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  
  // With country code
  if (clean.length === 12 && clean.startsWith('91')) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  
  return phone;
}

/**
 * Validate Indian phone number
 */
export function isValidIndianPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  
  // 10 digits starting with 6-9
  if (clean.length === 10 && /^[6-9]/.test(clean)) {
    return true;
  }
  
  // 12 digits with 91 prefix
  if (clean.length === 12 && clean.startsWith('91') && /^91[6-9]/.test(clean)) {
    return true;
  }
  
  return false;
}
