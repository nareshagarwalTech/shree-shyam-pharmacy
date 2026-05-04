// Pharmacy Information - single source of truth
export const PHARMACY_INFO = {
  name: 'Shree Shyam Pharmacy',
  tagline: 'Your Health, Our Priority',
  phone: '+91 9100855455',
  whatsapp: '919100855455',
  email: 'contact@shreeshyampharmacy.com',
  address: 'Dharam Karan Rd, Divyashakti Apartments, Ameerpet, Hyderabad, Telangana 500016',
  shortAddress: 'Ameerpet, Hyderabad',
  mapLink: 'https://maps.google.com/?q=Dharam+Karan+Rd,+Divyashakti+Apartments,+Ameerpet,+Hyderabad',
  serviceAreas: ['Ameerpet', 'SR Nagar', 'Punjagutta', 'Sanjeeva Reddy Nagar'],
  established: '1995',
  yearsExperience: new Date().getFullYear() - 1995,
  happyCustomers: '25,000+',
  licenseNumber: 'DL No. TS/01/HYD/2021-23',
  pharmacistName: 'Naresh Agarwal',
  pharmacistCredentials: 'B.Pharm, Registered Pharmacist',
  hours: {
    weekdays: 'Mon - Sat: 8:00 AM - 10:00 PM',
    sunday: 'Sunday: 9:00 AM - 2:00 PM',
  },
  googleRating: 4.8,
  googleReviews: 312,
};

// Reminder timing settings (in days)
export const REMINDER_DAYS = {
  OVERDUE: 0,      // Past refill date
  URGENT: 3,       // 3 days or less
  SOON: 7,         // 7 days or less
  UPCOMING: 14,    // 14 days or less (for planning)
};

// Status colors for UI — must match SQL view customer_next_reminder.status
export const STATUS_CONFIG = {
  overdue: {
    label: 'Overdue',
    color: 'bg-red-100 text-red-800 border-red-200',
    dotColor: 'bg-red-500',
    priority: 1,
  },
  urgent: {
    label: 'Urgent',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    dotColor: 'bg-amber-500',
    priority: 2,
  },
  soon: {
    label: 'Due Soon',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    dotColor: 'bg-blue-500',
    priority: 3,
  },
  ok: {
    label: 'OK',
    color: 'bg-green-100 text-green-800 border-green-200',
    dotColor: 'bg-green-500',
    priority: 4,
  },
  paused: {
    label: 'Paused',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    dotColor: 'bg-gray-400',
    priority: 5,
  },
  opted_out: {
    label: 'Opted Out',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    dotColor: 'bg-slate-400',
    priority: 6,
  },
  no_sales: {
    label: 'No Sales',
    color: 'bg-stone-100 text-stone-600 border-stone-200',
    dotColor: 'bg-stone-400',
    priority: 7,
  },
} as const;

// WhatsApp message templates — customer-level reminder based on last purchase
export const WHATSAPP_TEMPLATES = {
  refillReminder: (customerName: string, daysText: string) =>
`🏥 *${PHARMACY_INFO.name}*

Namaste ${customerName} ji,

This is a friendly reminder — your medicines ${daysText}.

Please visit us or WhatsApp to place your refill order.

📍 ${PHARMACY_INFO.address}
📞 ${PHARMACY_INFO.phone}

Thank you for choosing ${PHARMACY_INFO.name}! 🙏`,

  refillReminderTelugu: (customerName: string, daysText: string) =>
`🏥 *${PHARMACY_INFO.name}*

నమస్కారం ${customerName} గారు,

మీ మందులు ${daysText}.

దయచేసి మా షాప్ కి రండి లేదా ఆర్డర్ చేయడానికి WhatsApp చేయండి.

📍 ${PHARMACY_INFO.address}
📞 ${PHARMACY_INFO.phone}

${PHARMACY_INFO.name} ని ఎంచుకున్నందుకు ధన్యవాదాలు! 🙏`,

  refillReminderHindi: (customerName: string, daysText: string) =>
`🏥 *${PHARMACY_INFO.name}*

Namaste ${customerName} ji,

आपकी दवाइयाँ ${daysText}।

कृपया दुकान पर आइए या WhatsApp पर ऑर्डर करें।

📍 ${PHARMACY_INFO.address}
📞 ${PHARMACY_INFO.phone}

धन्यवाद! 🙏`,
};

// Pagination
export const PAGE_SIZE = 20;

// Date format for display
export const DATE_FORMAT = 'dd MMM yyyy';
export const DATE_FORMAT_SHORT = 'dd/MM';
