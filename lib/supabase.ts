import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
