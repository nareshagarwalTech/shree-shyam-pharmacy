import { createClient } from '@supabase/supabase-js';

// Build-time resilience: if env vars are missing (e.g. on Vercel Preview
// deployments without their own Supabase config, or orphan projects), use
// placeholder strings so createClient doesn't throw during module load /
// "Collecting page data". At runtime in the real environment the proper
// values are present and the client works normally.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------------------------------------------------------
// Database types — mirror of supabase/migrations/001_groups_and_sales.sql
// ---------------------------------------------------------------------------

export interface Group {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  phone: string;
  name: string;
  alternate_phone?: string | null;
  address?: string | null;
  email?: string | null;
  preferred_language: 'en' | 'te' | 'hi';
  reminder_buffer_days: number;
  whatsapp_opt_out: boolean;
  whatsapp_opt_out_at?: string | null;
  reminders_paused_until?: string | null;
  notes?: string | null;
  source: 'manual' | 'master_import' | 'sale_import';
  is_active: boolean;
  /** Set by Reminder Upload (migration 012). Drives the refill reminder date. */
  reminder_last_purchase_date?: string | null;
  /** Days the medicines from the latest purchase will last (migration 012). */
  reminder_for_days?: number | null;
  created_at: string;
  updated_at: string;
}

/** Legacy: per-customer payment mode on `sales_transactions.payment_mode`
 *  (migration 003). Not to be confused with the Daily Book `PaymentMode`
 *  interface (migration 019). */
export type LegacyPaymentMode = 'cash' | 'online' | 'credit' | null;

// Migration 005 — payments table is the source of truth for received money
export type PaymentChannel = 'cash' | 'online' | 'cheque' | 'card' | 'other';

// Migration 006/007 — message templates
export type TemplateKind = 'refill' | 'due' | 'marketing';

export interface Payment {
  id: string;
  customer_id: string;
  sales_transaction_id: string | null;
  amount: number;
  mode: PaymentChannel;
  payment_date: string;          // ISO date
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface SalesTransaction {
  id: string;
  feed_no: string;
  feed_date: string;                      // ISO date (legacy alias of delivery_date)
  customer_phone: string;
  customer_id: string | null;
  customer_name_raw: string | null;
  address_raw: string | null;
  net_amount: number | null;
  for_days: number | null;
  reminder_date: string | null;           // computed by DB trigger
  match_confidence: 'exact' | 'fuzzy' | 'unmatched' | 'auto_created';
  fuzzy_match_score: number | null;
  notes: string | null;
  import_batch_id: string | null;
  imported_at: string;
  // Migration 003 — delivery + payment fields
  bill_no_label: string | null;
  delivery_date: string | null;
  prev_pending: number | null;
  total_due: number | null;
  customer_paid: number | null;
  change_given: number | null;
  balance_left: number | null;
  payment_mode: LegacyPaymentMode;
  payment_date: string | null;
  delivery_notes: string | null;
}

// Roll-up views — updated for migration 005 (payments table)
export interface CustomerBalance {
  customer_id: string;
  customer_name: string;
  phone: string;
  alternate_phone: string | null;
  address: string | null;
  preferred_language: 'en' | 'te' | 'hi';
  whatsapp_opt_out: boolean;
  total_billed: number;
  total_collected: number;
  total_change_given: number;
  outstanding: number;
  bill_count: number;
  payment_count: number;
  last_delivery_date: string | null;
  last_payment_date: string | null;
  balance_status: 'PENDING' | 'CLEAR';
}

// Migration 005 — sourced from payments table
export interface DailyCollection {
  date: string;                    // ISO date — payment_date
  payment_count: number;           // number of payment events
  unique_customers: number;
  cash_received: number;
  online_received: number;
  other_received: number;
  total_collected: number;
  change_given: number;
  billed_same_day: number;
  old_due_collected: number;
  // Backward-compat alias (deprecated)
  bills_paid?: number;
}

export interface MonthlyCollection {
  month: string;                   // first-of-month ISO date
  month_label: string;             // 'YYYY-MM'
  payment_count: number;
  unique_customers: number;
  cash_received: number;
  online_received: number;
  total_collected: number;
  avg_per_payment: number;
  // Backward-compat alias (deprecated)
  bills_paid?: number;
  avg_per_bill?: number;
}

export interface CustomerAging {
  customer_id: string;
  customer_name: string;
  phone: string;
  oldest_age_days: number;
  oldest_unpaid_date: string | null;
  outstanding: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  unpaid_bill_count: number;
}

export interface TopCustomer {
  customer_id: string;
  customer_name: string;
  phone: string;
  bill_count: number;
  payment_count: number;
  total_billed: number;
  total_collected: number;
  outstanding: number;
  last_delivery_date: string | null;
  last_payment_date: string | null;
  avg_days_to_pay: number | null;
}

export interface Reminder {
  id: string;
  customer_id: string;
  sales_transaction_id: string | null;
  scheduled_for: string | null;
  channel: 'whatsapp' | 'sms' | 'call';
  send_method: 'manual_walink' | 'api_automated' | 'api_bulk_manual';
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
  wa_message_id: string | null;
  template_name: string | null;
  template_language: string;
  message_content: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_reason: string | null;
  sent_by: string;
  created_at: string;
}

// Status categories for the dashboard — match SQL view
export type ReminderStatus =
  | 'overdue'
  | 'urgent'
  | 'soon'
  | 'ok'
  | 'paused'
  | 'opted_out'
  | 'no_sales';

// One row per customer — read by the dashboard
export interface CustomerNextReminder {
  customer_id: string;
  phone: string;
  customer_name: string;
  alternate_phone: string | null;
  address: string | null;
  preferred_language: 'en' | 'te' | 'hi';
  reminder_buffer_days: number;
  whatsapp_opt_out: boolean;
  reminders_paused_until: string | null;
  notes: string | null;
  last_sale_id: string | null;
  last_feed_no: string | null;
  last_purchase_date: string | null;
  last_for_days: number | null;
  reminder_date: string | null;
  last_amount: number | null;
  reminder_trigger_date: string | null;
  days_until_reminder: number | null;
  status: ReminderStatus;
  last_reminder_sent: string | null;
  group_slugs: string[];
  group_names: string[];
}

// For the customer management page
export interface CustomerWithGroups extends Customer {
  groups: Array<Pick<Group, 'id' | 'name' | 'slug' | 'color' | 'icon'>>;
  total_sales: number;
  total_spent: number | null;
  last_purchase_date: string | null;
}

export interface ImportBatch {
  id: string;
  filename: string | null;
  source_type: 'master_customers' | 'daily_sales';
  uploaded_by: string;
  row_count: number;
  success_count: number;
  skipped_count: number;
  error_count: number;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cheques module — migration 010
// ---------------------------------------------------------------------------

/** @deprecated Bank table was dropped in migration 026 — use Account instead.
 *  This stub kept only for any legacy reference; remove when no callers remain. */
export interface Bank {
  id: string;
  name: string;
  short_name: string | null;
  account_no: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PartyCategory = 'pharma' | 'staff' | 'service' | 'utility' | 'other';

export interface Party {
  id: string;
  name: string;
  short_name: string | null;
  category: PartyCategory;
  contact_phone: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ChequeStatus = 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';

export interface Cheque {
  id: string;
  party_id: string | null;
  /** Account the cheque was drawn on (migration 026 — was bank_id). Required. */
  account_id: string;
  is_online: boolean;
  cheque_no: string | null;
  online_ref: string | null;
  amount: number;
  /** "Cheque Date" — date written on the cheque */
  issue_date: string;
  /** Required when status moves past 'pending' (i.e. deposited / cleared / bounced). */
  deposit_date: string | null;
  status: ChequeStatus;
  remarks: string | null;
  /** Accounting ledger reference (migration 015). */
  ledger_no?: string | null;
  /** First date of the invoice period this cheque settles (migration 015). */
  period_from?: string | null;
  /** Last date of the invoice period this cheque settles (migration 015). */
  period_to?: string | null;
  /** Business expense category (migration 027). Required for the trigger to
   *  auto-create a linked daily_entries row on cleared/deposited cheques. */
  expense_category_id?: string | null;
  /** Auto-maintained by the trigger — points at the linked daily_entries row
   *  (or NULL when cheque is pending/bounced/cancelled). */
  linked_entry_id?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface ChequeSummary {
  pending_count: number;
  pending_amount: number;
  cleared_count: number;
  cleared_amount: number;
  bounced_count: number;
  bounced_amount: number;
  cancelled_count: number;
  total_count: number;
  total_amount: number;
}

export interface ChequePartySummary {
  party_id: string;
  party_name: string;
  short_name: string | null;
  category: PartyCategory;
  contact_phone: string | null;
  is_active: boolean;
  total_cheques: number;
  total_issued: number;
  cleared_count: number;
  cleared_amount: number;
  pending_count: number;
  pending_amount: number;
  bounced_count: number;
  bounced_amount: number;
  last_cheque_date: string | null;
  last_deposit_date: string | null;
}

export interface ChequeDepositScheduleRow {
  deposit_date: string;
  cheque_count: number;
  total_amount: number;
  cheques: Array<{
    id: string;
    cheque_no: string | null;
    is_online: boolean;
    amount: number;
    party_name: string;
    status: ChequeStatus;
  }>;
}

// ---------------------------------------------------------------------------
// Daily Book module — migration 016 (manager-only feature)
// ---------------------------------------------------------------------------

export type AccountKind = 'cash' | 'bank' | 'pos' | 'qr' | 'other';

export interface Account {
  id: string;
  name: string;
  short_name: string | null;
  kind: AccountKind;
  opening_balance: number;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Daily Book v2 — migration 019 (redesign: Direction × Scope model)
// ---------------------------------------------------------------------------

/** The direction of a single daily_entries row — what the money did. */
export type EntryDirection = 'income' | 'expense';
export type EntryScope     = 'business' | 'personal';
export type TxnType        = 'entry' | 'cash_count' | 'transfer';

/** Category direction: 'income' / 'expense' for direction-locked categories,
 *  'shared' for funds that flow in AND out (e.g. Chit Fund collection). */
export type CategoryDirection = 'income' | 'expense' | 'shared';

export interface PaymentMode {
  id: string;
  name: string;
  slug: string;
  has_commission: boolean;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  /** 'income' / 'expense' / 'shared' (migration 021). Shared categories can
   *  be used on both income and expense entries; their running balance is
   *  shown on the Dashboard Funds panel. */
  direction: CategoryDirection;
  scope: EntryScope;
  /** TRUE for refund-style categories (money flowing back in via an expense entry).
   *  Only meaningful for direction='expense'. */
  is_credit_note: boolean;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyEntry {
  id: string;
  /** Transaction date — when it actually happened. */
  entry_date: string;                    // ISO YYYY-MM-DD
  /** When bank actually credited the money. Optional, used for income with
   *  delayed settlement (POS/QR). Defaults to entry_date in views. */
  settlement_date: string | null;
  txn_type: TxnType;
  /** Required when txn_type='entry'. NULL for cash_count / transfer. */
  direction: EntryDirection | null;
  scope: EntryScope | null;
  account_id: string | null;
  /** Only used for txn_type='transfer' (destination account). */
  transfer_to_account_id: string | null;
  /** Required when txn_type='entry'. */
  mode_id: string | null;
  /** Required when txn_type='entry'. Must match direction+scope. */
  category_id: string | null;
  txn_amount: number;
  /** Gross-minus-commission, for INCOME with commission mode. */
  settled_amount: number | null;
  narration: string | null;
  notes: string | null;
  /** Set on auto-created BANK CHARGES expense rows; points back to source income. */
  linked_entry_id: string | null;
  linked_role: 'auto_bank_charges' | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CashDenomination {
  id: string;
  count_date: string;
  denomination: 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1;
  count: number;
  daily_entry_id: string | null;
  created_at: string;
}

// Migration 017 — per-account, per-period opening balances
export interface AccountOpeningBalance {
  id: string;
  account_id: string;
  effective_date: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// --- Views ---

export interface DailyBookBankLedgerRow {
  account_id: string;
  account_name: string;
  account_short_name: string | null;
  account_kind: AccountKind;
  entry_date: string;
  total_credit: number;
  total_debit: number;
  net_change: number;
  opening_bal: number | null;
  closing_bal: number;
}

export interface DailyBookAccountBalance {
  account_id: string;
  account_name: string;
  account_short_name: string | null;
  account_kind: AccountKind;
  opening_balance: number;
  monthly_opening_amount: number | null;
  monthly_opening_date: string | null;
  movements_since_baseline: number;
  current_balance: number;
  lifetime_net: number;
  is_active: boolean;
  sort_order: number;
}

// Migration 021 — running balance per shared (fund) category
export interface FundBalance {
  category_id: string;
  category_name: string;
  category_slug: string;
  scope: EntryScope;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  total_in: number;
  total_out: number;
  current_balance: number;
  entry_count: number;
  last_activity_date: string | null;
}

export interface DailyBookSummaryRow {
  entry_date: string;
  direction: EntryDirection;
  scope: EntryScope;
  category_id: string;
  category_name: string;
  category_slug: string;
  mode_id: string;
  mode_name: string;
  total: number;
  entry_count: number;
}

