# Maintenance scripts

SQL utilities for maintaining the Supabase database. Run these in the
Supabase SQL editor for project `lkptnswaxvswzsnkspdb` after taking a
backup (Database → Backups → "Create backup").

## `cleanup_transactions.sql`

Wipes **all** transaction data:

| Wiped | Preserved |
| --- | --- |
| `sales_transactions` | `customers` |
| `payments` | `groups` |
| `reminders` | `customer_groups` |
|  | `message_templates` |

Use when:
- Resetting a staging environment before re-importing fresh data
- Cleaning up after a test run before the live launch

The script prints `BEFORE` / `AFTER` counts so you can confirm the
right thing happened. The deletes run inside a `BEGIN; … COMMIT;`
block — if anything looks wrong, change `COMMIT;` to `ROLLBACK;` and
re-run.

## `cleanup_transactions_by_date.sql`

Same idea but **scoped to a date range** — only deletes rows whose
`delivery_date` / `payment_date` / `sent_at` falls inside the range
you set at the top of the file. Use this if you only want to wipe a
specific test session and leave older data alone.

Edit the two `\set` lines at the top:

```sql
\set start_date '''2026-05-01'''
\set end_date   '''2026-05-31'''
```

then run the whole file.

## Safety checklist before running either script

1. ✅ Take a fresh database backup in the Supabase dashboard
2. ✅ Confirm you're on the right project (the project ID is shown
   top-left in Supabase — should be `lkptnswaxvswzsnkspdb`)
3. ✅ Verify the `BEFORE` counts match what you expect to wipe
4. ✅ After running, refresh the dashboard and spot-check that
   customer master + groups are still there
