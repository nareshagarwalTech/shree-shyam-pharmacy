-- =============================================================================
-- Migration 013: add {{last_purchase_date}} line to refill templates
-- =============================================================================
-- Per user request, the WhatsApp refill reminder should mention when the
-- customer last bought medicines, so the conversation has natural context.
--
-- Migration 006 seeded the bodies with ON CONFLICT DO NOTHING, so a re-run
-- wouldn't change rows that already exist. This migration runs explicit
-- UPDATEs against the seeded slugs (refill_en / refill_te / refill_hi).
-- The "due" templates are unchanged.
--
-- Idempotent: running multiple times leaves the body identical.
-- =============================================================================

UPDATE message_templates
   SET body = $$🏥 *{{shop_name}}*

Namaste {{customer_name}} ji,

Your last purchase was on *{{last_purchase_date}}*. This is a friendly reminder — your medicines {{days_phrase}}.

Please visit us or WhatsApp to place your refill order.

📍 {{shop_address}}
📞 {{shop_phone}}

Thank you for choosing {{shop_name}}! 🙏$$
 WHERE slug = 'refill_en';

UPDATE message_templates
   SET body = $$🏥 *{{shop_name}}*

నమస్కారం {{customer_name}} గారు,

మీ చివరి కొనుగోలు *{{last_purchase_date}}* న జరిగింది. మీ మందులు {{days_phrase}}.

దయచేసి మా షాప్ కి రండి లేదా ఆర్డర్ చేయడానికి WhatsApp చేయండి.

📍 {{shop_address}}
📞 {{shop_phone}}

{{shop_name}} ని ఎంచుకున్నందుకు ధన్యవాదాలు! 🙏$$
 WHERE slug = 'refill_te';

UPDATE message_templates
   SET body = $$🏥 *{{shop_name}}*

Namaste {{customer_name}} ji,

आपकी पिछली खरीद *{{last_purchase_date}}* को थी। आपकी दवाइयाँ {{days_phrase}}।

कृपया दुकान पर आइए या WhatsApp पर ऑर्डर करें।

📍 {{shop_address}}
📞 {{shop_phone}}

धन्यवाद! 🙏$$
 WHERE slug = 'refill_hi';
