# Shree Shyam Pharmacy - Customer Reminder System

A simple, free web application to manage customer medication refill reminders with WhatsApp integration.

## Features

- 📋 **Customer Management** - Add, edit, delete customers
- 💊 **Medication Tracking** - Track multiple medications per customer
- 🔔 **Smart Reminders** - Color-coded dashboard (overdue, due soon, upcoming)
- 📱 **WhatsApp Integration** - One-click reminder sending via WhatsApp Web
- 📊 **Import from Excel** - Bulk import customers from spreadsheet
- 📈 **Reminder History** - Track when reminders were sent
- 🔍 **Search & Filter** - Quickly find customers
- 📱 **Mobile Friendly** - Works on phone/tablet

## Tech Stack

- **Frontend**: Next.js 14 + React + TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL) - Free tier
- **Hosting**: Vercel - Free tier
- **WhatsApp**: wa.me links (no API needed, free)

## Setup Instructions

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click "New Project"
3. Name it `shree-shyam-pharmacy`
4. Set a database password (save it!)
5. Select region: Mumbai (ap-south-1) for best performance
6. Wait for project to be created (~2 minutes)

### Step 2: Setup Database Tables

1. In Supabase dashboard, go to **SQL Editor**
2. Copy and paste the contents of `supabase/schema.sql`
3. Click "Run"

### Step 3: Get Supabase Credentials

1. Go to **Settings** → **API**
2. Copy:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - `anon` public key

### Step 4: Deploy to Vercel

1. Push this code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign up
3. Click "Import Project" and select your repo
4. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
5. Click "Deploy"

### Local Development

```bash
# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev

# Open http://localhost:3000
```

## Usage Guide

### Adding Customers

1. Click "Add Customer" button
2. Fill in customer details
3. Add medications with quantity and daily dosage
4. System auto-calculates refill dates

### Sending Reminders

1. Dashboard shows customers needing reminders
2. Click WhatsApp button next to customer
3. WhatsApp Web opens with pre-filled message
4. Send the message
5. System automatically logs the reminder

### Importing from Excel

1. Prepare Excel/CSV with columns:
   - `name` (required)
   - `phone` (required, 10 digits)
   - `address` (optional)
   - `medication` (optional)
   - `quantity` (optional)
   - `daily_dosage` (optional)
   - `start_date` (optional, DD-MM-YYYY)
2. Click "Import" button
3. Upload file
4. Review and confirm

## Customization

### Change WhatsApp Message

Edit the message template in `lib/whatsapp.ts`

### Change Reminder Timing

Edit `REMINDER_DAYS` in `lib/constants.ts`:
- `OVERDUE`: 0 (past refill date)
- `URGENT`: 3 (3 days before)
- `SOON`: 7 (7 days before)

### Change Pharmacy Details

Edit `PHARMACY_INFO` in `lib/constants.ts`

## Support

For issues or questions, contact the developer.

## License

MIT - Free to use and modify
