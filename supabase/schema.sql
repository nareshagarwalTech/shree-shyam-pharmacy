-- Shree Shyam Pharmacy Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers table
CREATE TABLE customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    alternate_phone VARCHAR(15),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on phone for quick lookup
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);

-- Medications table (for each customer's medications)
CREATE TABLE medications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 30,
    daily_dosage INTEGER NOT NULL DEFAULT 1,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    refill_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for refill date queries
CREATE INDEX idx_medications_refill_date ON medications(refill_date);
CREATE INDEX idx_medications_customer ON medications(customer_id);

-- Reminder history table
CREATE TABLE reminder_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp', -- whatsapp, sms, call
    status VARCHAR(50) NOT NULL DEFAULT 'sent', -- sent, delivered, failed
    message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_by VARCHAR(255) DEFAULT 'staff'
);

-- Create index for history queries
CREATE INDEX idx_reminder_history_customer ON reminder_history(customer_id);
CREATE INDEX idx_reminder_history_sent_at ON reminder_history(sent_at);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medications_updated_at
    BEFORE UPDATE ON medications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for dashboard - customers with upcoming refills
CREATE OR REPLACE VIEW customer_reminders AS
SELECT 
    c.id as customer_id,
    c.name as customer_name,
    c.phone,
    c.address,
    m.id as medication_id,
    m.name as medication_name,
    m.quantity,
    m.daily_dosage,
    m.refill_date,
    m.refill_date - CURRENT_DATE as days_until_refill,
    CASE 
        WHEN m.refill_date < CURRENT_DATE THEN 'overdue'
        WHEN m.refill_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'urgent'
        WHEN m.refill_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'soon'
        ELSE 'ok'
    END as status,
    (
        SELECT sent_at 
        FROM reminder_history rh 
        WHERE rh.customer_id = c.id 
        AND rh.medication_id = m.id
        ORDER BY sent_at DESC 
        LIMIT 1
    ) as last_reminder_sent
FROM customers c
JOIN medications m ON c.id = m.customer_id
WHERE c.is_active = true AND m.is_active = true
ORDER BY m.refill_date ASC;

-- Row Level Security (RLS) - Optional but recommended
-- Uncomment if you want to add authentication later

-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reminder_history ENABLE ROW LEVEL SECURITY;

-- Sample data for testing (optional - remove in production)
-- INSERT INTO customers (name, phone, address) VALUES
-- ('Ramesh Kumar', '9876543210', 'Kukatpally, Hyderabad'),
-- ('Lakshmi Devi', '9123456789', 'Ameerpet, Hyderabad'),
-- ('Venkat Rao', '9988776655', 'Secunderabad');

-- INSERT INTO medications (customer_id, name, quantity, daily_dosage, start_date, refill_date)
-- SELECT id, 'Metformin 500mg', 30, 2, CURRENT_DATE - INTERVAL '25 days', CURRENT_DATE + INTERVAL '5 days'
-- FROM customers WHERE phone = '9876543210';
