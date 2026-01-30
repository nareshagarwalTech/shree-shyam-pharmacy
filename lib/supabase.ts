import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database
export interface Customer {
  id: string;
  name: string;
  phone: string;
  alternate_phone?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Medication {
  id: string;
  customer_id: string;
  name: string;
  quantity: number;
  daily_dosage: number;
  start_date: string;
  refill_date: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReminderHistory {
  id: string;
  customer_id: string;
  medication_id?: string;
  channel: 'whatsapp' | 'sms' | 'call';
  status: 'sent' | 'delivered' | 'failed';
  message?: string;
  sent_at: string;
  sent_by: string;
}

export interface CustomerReminder {
  customer_id: string;
  customer_name: string;
  phone: string;
  address?: string;
  medication_id: string;
  medication_name: string;
  quantity: number;
  daily_dosage: number;
  refill_date: string;
  days_until_refill: number;
  status: 'overdue' | 'urgent' | 'soon' | 'ok';
  last_reminder_sent?: string;
}

// Customer with medications
export interface CustomerWithMedications extends Customer {
  medications: Medication[];
}
