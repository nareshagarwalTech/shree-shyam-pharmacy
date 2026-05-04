-- =============================================================================
-- Migration 006: editable WhatsApp message templates
-- =============================================================================
-- Templates were hardcoded in lib/constants.ts. Move them to a DB table so
-- staff can edit wording from the dashboard without redeploying code.
-- Idempotent: drop & recreate.
-- =============================================================================

DROP TABLE IF EXISTS message_templates CASCADE;

CREATE TABLE message_templates (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug        VARCHAR(50)  UNIQUE NOT NULL,        -- e.g. 'refill_en', 'due_te'
    kind        VARCHAR(20)  NOT NULL,                -- 'refill' | 'due'
    language    VARCHAR(10)  NOT NULL,                -- 'en' | 'te' | 'hi'
    label       VARCHAR(100) NOT NULL,                -- human-readable name
    body        TEXT         NOT NULL,
    is_active   BOOLEAN      DEFAULT true,
    is_system   BOOLEAN      DEFAULT false,           -- protected from delete
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_msg_templates_kind_lang ON message_templates(kind, language);

ALTER TABLE message_templates DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_message_templates_updated_at
    BEFORE UPDATE ON message_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Seed: 6 default templates (refill x 3 langs, due x 3 langs)
-- Placeholders supported (case-insensitive):
--   {{customer_name}}        → e.g. 'Ramesh Kumar'
--   {{customer_first_name}}  → e.g. 'Ramesh'
--   {{outstanding}}          → '₹15,340'
--   {{outstanding_amount}}   → '15340'  (no formatting)
--   {{days_phrase}}          → 'will run out in 5 days' / 'ran out 2 days ago'
--   {{days_until_refill}}    → '5'  (negative if overdue)
--   {{phone}}, {{address}}, {{last_purchase_date}}
--   {{shop_name}}, {{shop_phone}}, {{shop_address}}
--   {{date}}                  → today (formatted)
-- =============================================================================
INSERT INTO message_templates (slug, kind, language, label, body, is_system) VALUES

('refill_en', 'refill', 'en', 'Refill reminder · English',
$$🏥 *{{shop_name}}*

Namaste {{customer_name}} ji,

This is a friendly reminder — your medicines {{days_phrase}}.

Please visit us or WhatsApp to place your refill order.

📍 {{shop_address}}
📞 {{shop_phone}}

Thank you for choosing {{shop_name}}! 🙏$$,
true),

('refill_te', 'refill', 'te', 'Refill reminder · Telugu',
$$🏥 *{{shop_name}}*

నమస్కారం {{customer_name}} గారు,

మీ మందులు {{days_phrase}}.

దయచేసి మా షాప్ కి రండి లేదా ఆర్డర్ చేయడానికి WhatsApp చేయండి.

📍 {{shop_address}}
📞 {{shop_phone}}

{{shop_name}} ని ఎంచుకున్నందుకు ధన్యవాదాలు! 🙏$$,
true),

('refill_hi', 'refill', 'hi', 'Refill reminder · Hindi',
$$🏥 *{{shop_name}}*

Namaste {{customer_name}} ji,

आपकी दवाइयाँ {{days_phrase}}।

कृपया दुकान पर आइए या WhatsApp पर ऑर्डर करें।

📍 {{shop_address}}
📞 {{shop_phone}}

धन्यवाद! 🙏$$,
true),

('due_en', 'due', 'en', 'Outstanding due · English',
$$🏥 *{{shop_name}}*

Namaste {{customer_name}} ji,

This is a friendly reminder that your outstanding balance is *{{outstanding}}*.
Please clear it at your convenience — visit us or pay online.

📍 {{shop_address}}
📞 {{shop_phone}}

Thank you! 🙏$$,
true),

('due_te', 'due', 'te', 'Outstanding due · Telugu',
$$🏥 *{{shop_name}}*

నమస్కారం {{customer_name}} గారు,

మీ బకాయి *{{outstanding}}* ఉంది. దయచేసి సౌకర్యంగా ఉన్నప్పుడు చెల్లించండి.

📍 {{shop_address}}
📞 {{shop_phone}}

ధన్యవాదాలు! 🙏$$,
true),

('due_hi', 'due', 'hi', 'Outstanding due · Hindi',
$$🏥 *{{shop_name}}*

Namaste {{customer_name}} ji,

आपका बकाया *{{outstanding}}* है। कृपया जब सुविधा हो भुगतान कर दीजिए।

📍 {{shop_address}}
📞 {{shop_phone}}

धन्यवाद! 🙏$$,
true)

ON CONFLICT (slug) DO NOTHING;
