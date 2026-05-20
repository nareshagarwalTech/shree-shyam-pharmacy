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

export type PaymentMode = 'cash' | 'online' | 'credit' | null;

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
  payment_mode: PaymentMode;
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
  bank_id: string | null;
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

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_credit_note: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SaleChannel {
  id: string;
  name: string;
  slug: string;
  default_account_id: string | null;
  has_commission: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export type DailyEntryType =
  | 'sale'
  | 'expense'
  | 'cash_count'
  | 'bank_transfer'
  | 'cash_deposit';

export interface DailyEntry {
  id: string;
  entry_date: string;                    // ISO date YYYY-MM-DD
  entry_type: DailyEntryType;
  narration: string | null;
  txn_amount: number;
  settled_amount: number | null;
  account_id: string | null;
  transfer_to_account_id: string | null;
  expense_category_id: string | null;
  sale_channel_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CashDenomination {
  id: string;
  count_date: string;                    // ISO date
  denomination: 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1;
  count: number;
  daily_entry_id: string | null;
  created_at: string;
}

// Migration 017 — per-account, per-period opening balances
export interface AccountOpeningBalance {
  id: string;
  account_id: string;
  effective_date: string;                // ISO date — balance "as of start of this day"
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Views (computed)

export interface DailyBookSalesSummary {
  entry_date: string;
  pos_txn: number;
  pos_settled: number;
  pos_commission: number;
  qr_txn: number;
  qr_settled: number;
  qr_commission: number;
  online_amt: number;
  credit_amt: number;
  cash_sales: number;
  total_sales: number;
  entry_count: number;
}

export interface DailyBookExpenseSummary {
  entry_date: string;
  purchase: number;
  salary: number;
  rent: number;
  electricity: number;
  transport: number;
  diesel: number;
  home_expenses: number;
  bank_charges: number;
  other: number;
  clearing: number;
  total_expense: number;
  cr_note: number;
  net_expense: number;
}

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
  /** Most recent monthly opening balance amount, if any (migration 017). */
  monthly_opening_amount: number | null;
  /** Effective date of the most recent monthly opening (migration 017). */
  monthly_opening_date: string | null;
  /** Sum of movements since the baseline date (monthly opening or inception). */
  movements_since_baseline: number;
  /** Computed current balance using the baseline. */
  current_balance: number;
  /** Total lifetime movement (all entries, ignoring monthly openings). Kept for compatibility. */
  lifetime_net: number;
  is_active: boolean;
  sort_order: number;
}

export interface DailyBookClosingBalance {
  entry_date: string;
  opening_cash: number;
  cash_sales: number;
  cash_expenses: number;
  cash_cr_note: number;
  cash_deposits_out: number;
  actual_cash: number | null;
  expected_cash: number;
  cash_diff: number | null;
}

export interface DailyBookPaymentReconciliation {
  entry_date: string;
  daily_book_cash: number;
  payments_cash: number;
  cash_diff: number;
  daily_book_online: number;
  payments_online: number;
  online_diff: number;
  daily_book_pos_qr: number;
  payments_pos_qr: number;
  pos_qr_diff: number;
  daily_book_total: number;
  payments_total: number;
  total_diff: number;
}

