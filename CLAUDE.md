# Shree Shyam Pharmacy — Claude Code guide

A Next.js 14 + Supabase app for Shree Shyam Pharmacy (Ameerpet, Hyderabad). Public marketing site at `/`, password-protected staff dashboard at `/dashboard` for customer reminders, billing, payments, deliveries, cheques, and WhatsApp outreach.

## Stack

- **Next.js 16** + **React 19** (App Router, RSC where possible; most dashboard pages are `'use client'`)
- **TypeScript** strict mode, `@/*` path alias for project root
- **Tailwind CSS 3.4** + **lucide-react** icons
- **Supabase** (`@supabase/supabase-js`) — Postgres + (RLS disabled, see migrations 002/008/009)
- **date-fns 3** for date math, **exceljs** for Excel imports
- **ESLint 9** flat config (`eslint.config.mjs`)
- **PWA** via `components/ServiceWorkerRegistration.tsx` + `public/`

Deployed on **Vercel** (auto-deploy from `main`).

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # next lint
```

`.env.local` must be filled in before the dashboard works — see "Environment" below.

## Project layout

```
app/
  page.tsx                 # public landing
  (public)/...             # public-facing pages
  dashboard/               # STAFF tier — gated by APP_PASSWORD
    layout.tsx             # AuthProvider + ProtectedRoute wrapper
    page.tsx               # reminders home
    customers/             # customer CRUD + statements
    deliveries/            # daily delivery book
    payments/, pending/    # payment recording, FIFO allocation
    cheques/               # cheque ledger (migration 010, 015)
    reports/, daily-summary/, monthly-summary/, aging/, top-customers/
    history/               # reminder send history
    whatsapp/, broadcast/  # outreach (manual wa.me click-to-chat)
    groups/                # customer group tagging
  manager/                 # MANAGER tier — gated by MANAGER_PASSWORD (migration 016)
    layout.tsx             # ManagerAuthProvider + ManagerProtectedRoute wrapper
    page.tsx               # manager home (tile grid)
    daily-book/
      page.tsx             # daily transaction entry (CRUD)
      denomination/        # cash denomination counter → CASH COUNT entry
      sales-summary/       # by-date × channel pivot
      expense-summary/     # by-date × category pivot
      closing-balance/     # daily cash reconciliation
      banks/               # account balances + ledgers
        page.tsx           # overview of all accounts
        [id]/page.tsx      # full ledger for one account
      import/              # bulk Excel import (DAILYBOOK_SSP_*.xlsx)
      reconciliation/      # daily-book sales vs payments cross-check
  api/
    login/route.ts         # server-side password check — accepts tier='staff'|'manager'
    send-reminder/route.ts # records reminder send events
  offline/                 # PWA offline fallback

components/                # all UI (client components, flat — no nested folders)
lib/
  supabase.ts              # client + ALL TypeScript interfaces for tables/views
  constants.ts             # PHARMACY_INFO, status colors, WhatsApp templates
  whatsapp.ts              # wa.me URL builder + message formatting
  utils.ts                 # date/currency helpers
  sales-import.ts          # Excel → sales_transactions parser (uses exceljs)
  useEscapeKey.ts          # modal close hook

scripts/                   # one-off imports + SQL maintenance (see scripts/README.md)
supabase/
  schema.sql               # legacy v1 schema (medication-level) — kept for reference
  migrations/001…015.sql   # source of truth, applied in order via Supabase SQL editor

docs/                      # DATA_MIGRATION.md, WHATSAPP_INTEGRATION.md
```

## Data model (high level)

The DB is **sales-driven**, not medication-driven. Reminders are computed per customer from their latest sale.

Core tables (migration 001):
- `customers` — `phone` is the natural key (unique among `is_active = true`)
- `groups` + `customer_groups` — many-to-many tagging (9 seeded system groups)
- `sales_transactions` — one row per bill/feed; `reminder_date` computed by DB trigger from `feed_date + for_days`
- `import_batches` — audit of every Excel upload
- `reminders` — history of sent reminders (status: queued/sent/delivered/read/failed/cancelled)

Added later:
- `payments` (migration 005) — source of truth for received money; one bill can have many payments (FIFO allocation)
- `message_templates` (006/007) — refill / due / marketing templates with locale variants
- `cheques`, `banks`, `parties` (010, 011, 015) — separate cheque-tracking ledger with deposit schedule
- `accounts`, `expense_categories`, `sale_channels`, `daily_entries`, `cash_denominations` (migration 016) — manager-tier Daily Book; ops-side accounting parallel to customer-side payments

Views the UI reads from:
- `customer_next_reminder` — one row per customer, drives the dashboard (status enum: `overdue | urgent | soon | ok | paused | opted_out | no_sales`)
- `customer_balance`, `customer_aging`, `top_customers`
- `daily_collections`, `monthly_collections`
- `cheque_summary`, `cheque_party_summary`, `cheque_deposit_schedule`
- `daily_book_sales_summary`, `daily_book_expense_summary`, `daily_book_bank_ledger`, `daily_book_account_balances`, `daily_book_closing_balance`, `daily_book_payment_reconciliation` (migration 016)

All TypeScript interfaces live in [lib/supabase.ts](lib/supabase.ts) — keep them in sync when migrations change.

**RLS is disabled** (migrations 002/008/009/016). Auth is **two-tier shared password**:
- `APP_PASSWORD` → staff tier, gates `/dashboard/*`
- `MANAGER_PASSWORD` → manager tier, gates `/manager/*`

Both checked server-side in `/api/login` (body: `{ password, tier?: 'staff' | 'manager' }`). Sessions stored in `localStorage` (24h staff, 12h manager). This is single-tenant by design — not a multi-user identity system.

## Environment

Required in `.env.local` (template at `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...    # server-only, for scripts/
APP_PASSWORD=<staff-shared-password>       # gates /dashboard/*
MANAGER_PASSWORD=<manager-shared-password> # gates /manager/* (added with migration 016)
```

`lib/supabase.ts` falls back to placeholder strings if env vars are missing, so `next build` doesn't blow up on Vercel preview deployments — but actual queries will fail until the real values are set.

In Vercel: set the same vars in Project → Settings → Environment Variables.

## Conventions

- **Components are client-side by default** in the dashboard tree. Use `'use client'` at the top.
- **No nested component folders** — everything sits flat in `components/`.
- **Status enums must match SQL** — `ReminderStatus` in `lib/supabase.ts`, `STATUS_CONFIG` in `lib/constants.ts`, and the `customer_next_reminder` view all need to agree.
- **Phone format** — always `91XXXXXXXXXX` (12 digits, no `+`) for `wa.me` links; see `lib/whatsapp.ts`.
- **Currency** — INR, displayed with `lucide-react`'s `IndianRupee` icon, not the ₹ glyph.
- **Dates** — `date-fns` only. Display format `dd MMM yyyy` (see `DATE_FORMAT`).
- **Imports** — use `@/...` absolute paths, not relative chains.
- **Don't add RLS or auth middleware** — the model is single shared password, not per-user identity.

## Adding a new dashboard page

1. Create `app/dashboard/<slug>/page.tsx` with `'use client'`.
2. Wrap UI in the existing `DashboardHeader` for nav consistency.
3. Read from Supabase via the singleton in `lib/supabase.ts`. If you need a new shape, add the interface to that file and a matching view in a new migration.
4. Add a link from `app/dashboard/page.tsx` (or wherever the entry point lives).

## Adding a new table / view

1. Create the next migration: `supabase/migrations/0XX_<name>.sql`.
2. Apply it manually in the Supabase SQL editor (project `lkptnswaxvswzsnkspdb`) — there is no migration runner.
3. Mirror the new types in `lib/supabase.ts`.
4. If RLS would block service access, disable it explicitly (see migrations 002/008/009 for the pattern).

## Data imports

- `scripts/import-master-data.mjs` — bulk customer import from `CUSCELLDATA.xlsx`
- `scripts/import-delivery-book.mjs` — daily sales upload
- Both need `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) — load `.env.local` and run with `node scripts/<file>.mjs`.

See `docs/DATA_MIGRATION.md` for the full v1 → v2 migration story.

## WhatsApp

Uses **`wa.me` click-to-chat** — free, manual. Staff opens WhatsApp, sends the message, then clicks "Mark Sent" in `/dashboard/whatsapp` to log the send into `reminders`. No Cloud API integration. Templates in `lib/constants.ts` (English, Telugu, Hindi).

See `docs/WHATSAPP_INTEGRATION.md` if a real API is later added.

## Things NOT to do

- Don't enable RLS on existing tables without coordinating — the app assumes service-key-level access from client queries (intentional for this single-tenant setup).
- Don't change `customers.phone` uniqueness logic without checking import scripts and the `customer_next_reminder` view.
- Don't rename `ReminderStatus` enum values — they're used as object keys in `STATUS_CONFIG`.
- Don't introduce a state management library (Redux/Zustand) — current pages use local `useState` + Supabase queries; keep that pattern.
- Don't add per-staff accounts — the product is intentionally single shared password.

## Useful refs

- Repo: https://github.com/nareshagarwalTech/shree-shyam-pharmacy
- Supabase project ref: `lkptnswaxvswzsnkspdb`
- Latest migrations to know: 012 (customer reminder fields), 014 (reminder view excel-first), 015 (cheque ledger period)
