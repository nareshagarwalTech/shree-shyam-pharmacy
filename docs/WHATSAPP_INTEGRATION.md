# WhatsApp Business API integration — setup

## State of play (April 2026)

You already have:
- ✅ Meta Business Manager account: **Shree Shyam Pharmacy** (`business_id=1055277609345664`)
- ✅ WhatsApp Business Account (WABA): **shyam Pharmacy** (`waba_id=935364945518255`)
- ✅ Account status: **Approved**

Remaining steps before reminders can be sent server-side via the API.

## Step 1 — Add a payment method to Meta Business

WABA requires a payment method even though India's free tier (1,000 conversations/month) covers our volume. Without one, sends fail with `payment_required`.

1. Open https://business.facebook.com/billing_hub/payment_settings (the "Payment settings" button on your WABA summary page goes here too)
2. Click **Add payment method**
3. Add a credit card or bank account in INR

Free tier: 1,000 service + 1,000 utility conversations/month free. Above that, **₹0.115 per utility message in India**.

## Step 2 — Sign up for AiSensy

AiSensy is the BSP we'll use as a thin layer over Meta — it manages templates, billing, and webhooks for us.

1. Go to https://aisensy.com → **Get Started Free**
2. Sign in with the same Facebook account that owns the WABA
3. AiSensy will detect your existing WABA and ask to connect it
4. Click **Continue** through the Meta system-user prompts (this gives AiSensy permission to send on your WABA's behalf)
5. Choose a plan: **Free Forever** is enough to start (₹50 free credit, ₹0.145/utility message after)

Cost estimate: **78 reminders × ₹0.145 = ~₹11/month** at current volume. Free credit covers ~340 messages.

## Step 3 — Migrate phone number to Cloud API

Currently your number is on the **WhatsApp Business app**. To send via the API it must move to **Cloud API**.

1. In AiSensy onboarding flow, when prompted for "register a phone number," choose:
   - **Use existing number** — backup chats first; AiSensy will guide migration
   - OR **Use a new number** (recommended) — buy a new SIM, never previously on WhatsApp

⚠️ Important: a Cloud API number cannot also be on regular WhatsApp. If you migrate the existing one, it will be deleted from the WhatsApp Business app on your phone.

## Step 4 — Submit the utility template

In AiSensy → **Templates** → **Create New** → **Submit to Meta**:

| Field | Value |
|---|---|
| **Name** | `refill_reminder_en` |
| **Category** | `UTILITY` (NOT marketing — utility is what we want) |
| **Language** | English (en) |
| **Header** | None (or text "Shree Shyam Pharmacy") |
| **Body** | See below |
| **Footer** | `Reply STOP to opt out.` |
| **Buttons** | None for v1 |

### Body text (copy exactly)

```
Hello {{1}}, this is a reminder that your prescription refill is due on {{2}}. Please reply or call +91 9100855455 to place your order.

- Shree Shyam Pharmacy, Ameerpet
```

Sample values for AiSensy preview: `{{1}} = Ramesh Kumar`, `{{2}} = 02 May 2026`.

After submission Meta reviews it — usually **24-48 hours**. Status moves through `Pending → Approved`. Once approved, you can send.

(Optional) Submit two more templates with same body, languages `te` (Telugu) and `hi` (Hindi). I'll route per customer's `preferred_language`.

## Step 5 — Get the API key + paste into env

Once template is **Approved**:

1. AiSensy → **Manage** → **API Key**
2. Copy the long JWT-style key
3. Open `.env.local` (and Vercel → Settings → Environment Variables for **Production** + **Preview**)
4. Paste:

```
AISENSY_API_KEY=<the long JWT>
AISENSY_CAMPAIGN_EN=refill_reminder_en
AISENSY_CAMPAIGN_NAME=refill_reminder_en
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<any random string, e.g. 'shree-shyam-2026-xyz'>
```

5. Vercel **Redeploy** the redesign branch.

## Step 6 — Wire the webhook

So we know when each message is delivered / read / failed:

1. In AiSensy → **Webhooks** (or "Settings → Webhooks")
2. Webhook URL: `https://shreeshyampharmacy.com/api/whatsapp-webhook`
3. Verify Token: paste the same value you set for `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: **messages** (incoming) + **statuses** (sent/delivered/read/failed)
5. Click **Save** — AiSensy will call our endpoint to verify; should succeed instantly

That's it. After this, every Send button in the dashboard will:
- Hit `/api/send-reminder` (server-side)
- Call AiSensy with the approved template
- Insert a `reminders` row with `status='sent'` and the wa_message_id from Meta
- Receive webhook updates → moves through `delivered → read`
- Inbound STOP messages auto-set `customers.whatsapp_opt_out = true`

## How it behaves before you complete steps 1-6

Without `AISENSY_API_KEY`, the dashboard's Send button gracefully falls back to **wa.me click-to-chat** (the previous behaviour) and writes the reminder row with `send_method='manual_walink'`. So nothing breaks while you're waiting for Meta template approval.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Send failed: AISENSY_API_KEY not configured` (banner) | Env var missing in Vercel for current environment |
| `Send failed: Number is not registered` | Phone number not migrated to Cloud API yet |
| `Send failed: Template not approved` | Wait for Meta review or check exact name match |
| Status stuck on `sent` (never `delivered`) | Webhook not configured — go to Step 6 |
| `Send failed: payment_required` | Step 1 incomplete |
