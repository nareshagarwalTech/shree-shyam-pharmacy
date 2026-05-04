-- =============================================================================
-- Migration 007: marketing message templates + broadcast support
-- =============================================================================
-- Extends message_templates to support 'marketing' kind alongside refill/due.
-- Seeds 4 example marketing templates (offers, festival, new stock, generic).
-- Idempotent: ON CONFLICT clauses, safe to re-run.
-- =============================================================================

-- Make sure migration 006 has been applied
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'message_templates') THEN
        RAISE EXCEPTION 'message_templates table missing — apply migration 006 first';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Seed: marketing templates (English defaults; staff can clone for other langs
-- via the dashboard)
-- ---------------------------------------------------------------------------
INSERT INTO message_templates (slug, kind, language, label, body, is_system) VALUES

('marketing_general_en', 'marketing', 'en', 'Generic offer · English',
$$🏥 *{{shop_name}}*

Namaste {{customer_first_name}} ji,

We have a special offer this week — visit us for great deals on regular medicines and health products.

Reply or WhatsApp us to know more.

📍 {{shop_address}}
📞 {{shop_phone}}

— {{shop_name}}$$,
true),

('marketing_festival_en', 'marketing', 'en', 'Festival greeting + offer · English',
$$🎉 *{{shop_name}}* 🎉

Wishing {{customer_first_name}} ji and family a happy and healthy festival season!

As a thank-you, enjoy a special discount on chronic medicines this week.

Visit us or WhatsApp to place an order.

📍 {{shop_address}}
📞 {{shop_phone}}$$,
true),

('marketing_new_stock_en', 'marketing', 'en', 'New stock arrival · English',
$$📦 *{{shop_name}}*

Hi {{customer_first_name}} ji,

Great news — we just received fresh stock of imported supplements, baby care, and seasonal medicines.

Drop by or WhatsApp us if you need anything.

📍 {{shop_address}}
📞 {{shop_phone}}$$,
true),

('marketing_health_tip_en', 'marketing', 'en', 'Monthly health tip · English',
$$💚 *{{shop_name}}* — Monthly Tip

Namaste {{customer_first_name}} ji,

Quick reminder: it's a good time to check your blood pressure / sugar levels. We offer free in-shop screening any time during business hours.

📍 {{shop_address}}
📞 {{shop_phone}}

Take care!$$,
true)

ON CONFLICT (slug) DO UPDATE SET
    kind     = EXCLUDED.kind,
    label    = EXCLUDED.label,
    -- Preserve any custom edits to body — don't overwrite if the template
    -- already exists with custom wording. Only update label/kind metadata.
    body     = CASE
                  WHEN message_templates.body = EXCLUDED.body THEN EXCLUDED.body
                  ELSE message_templates.body
               END;
