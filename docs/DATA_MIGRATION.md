# Data migration — v1 (medication-level) → v2 (sales-driven + groups)

The `redesign` branch introduces a new data model:

- `medications` removed; reminders are computed per customer from their **latest sale**
- `sales_transactions` is the daily upload target (one row per bill/receipt)
- `groups` + `customer_groups` many-to-many for tagging
- Phone (`customers.phone`) is the natural key (unique among active customers)
- `import_batches` audits every upload
- `customer_next_reminder` view powers the dashboard

This is a **destructive** migration — old `medications` and `reminder_history` rows are dropped. The old `customers` rows are also dropped; we re-import them from `CUSCELLDATA.xlsx`.

## Step 1 — Apply the schema migration

1. Open your Supabase project → **SQL Editor**
2. Copy the entire contents of [`supabase/migrations/001_groups_and_sales.sql`](../supabase/migrations/001_groups_and_sales.sql)
3. Paste into a new query and **Run**

This will:
- Drop old `customers`, `medications`, `reminder_history`, `customer_reminders`
- Create `groups`, `customers`, `customer_groups`, `sales_transactions`, `import_batches`, `reminders`
- Create views: `customer_next_reminder`, `customer_with_groups`
- Seed 9 default groups (Regular, Diabetes, BP & Heart, Thyroid, Chronic-Other, Senior Citizens, Family Account, Staff/Doctor, One-time)

## Step 2 — Configure env for the import script

The import script needs **service-role** access to bypass RLS and bulk-insert.

Add to `.env.local` in the project root (never commit this file — it's in `.gitignore`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Get these from Supabase → **Settings → API**.

## Step 3 — Run the one-time import

This imports:
- `CUSCELLDATA.xlsx`              → `customers` (master list, 404 rows)
- `CUSTOMERREMINDER.DATA.xlsx`    → `sales_transactions` (~85 rows)
- `REMINDER DATA.xlsx`             → `sales_transactions` (~74 rows, deduped by `feed_no`)

Paths are hardcoded to `C:\Users\nares\OneDrive\Documents\Shyam\*.xlsx`. Edit
`scripts/import-master-data.mjs` if your files live elsewhere.

```bash
node scripts/import-master-data.mjs
```

Expected output:

```
📂  Reading master: ...CUSCELLDATA.xlsx
   → 404 unique customers
🧑‍🤝‍🧑  Importing 404 master customers…
   ✓ Inserted 404 new customers.
🏷️   Assigning 'regular' group to all active customers…
   ✓ Tagged ~404 customers as 'regular'.
📂  Reading sales:  ...CUSTOMERREMINDER.DATA.xlsx
📂  Reading sales:  ...REMINDER DATA.xlsx
   → 159 unique sales (deduped by FeedNo)
💰  Importing 159 sales transactions…
   ↳ auto-creating N new customers (unknown phones)…
   ↳ inserting 159 sales…
   ✓ Sales imported. Breakdown:
      exact phone match        : X
      fuzzy name match         : Y
      auto-created new customer: Z
      unmatched (review)       : 0
🎉  Done.
```

## Matching logic during sales import

For each sale row, the script tries to resolve `customer_id`:

1. **Exact phone match** against `customers.phone` → use that id
2. If phone not in master, **fuzzy name match** (Levenshtein ≥ 0.80 similarity) against all customer names → use that id
3. Otherwise, **auto-create** a new `customers` row with `source='sale_import'`, tagged into `regular` group

The `match_confidence` column on each `sales_transactions` row records which path was taken, and `fuzzy_match_score` stores the similarity (0–1).

Staff can review auto-created customers later and merge if they're duplicates of existing ones.

## Step 4 — Daily operations

Going forward, export the sales register from your billing software daily as Excel/CSV and upload it at **/dashboard/sales-upload**. The same matching logic runs and new sales appear on the dashboard immediately.

Expected columns (case-insensitive):

- **Required**: `FeedNo`, `FeedDate`, `Phone`
- **Optional**: `Cust`, `NetAmt`, `ForDays`, `CustAd4`

Reminder date = `FeedDate + ForDays` (computed by a database trigger).

## Rollback

The migration is destructive — there is no automatic rollback. Before running in production, take a Supabase snapshot (or use the pg_dump command under **Settings → Database → Backups**).
