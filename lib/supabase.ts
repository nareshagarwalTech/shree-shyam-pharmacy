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

export interface SalesTransaction {
  id: string;
  feed_no: string;
  feed_date: string;                      // ISO date
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
