# Shree Shyam Pharmacy - Complete Website with PWA

A professional pharmacy website with customer reminder dashboard and PWA (Progressive Web App) support.

## Features

### 🌐 Public Website (/)
- Beautiful landing page with pharmacy info
- Services showcase
- Contact information with Google Maps
- Floating WhatsApp button
- Fully responsive design

### 🔐 Staff Dashboard (/dashboard)
- Password protected
- Customer reminder management
- Add/Import customers
- One-click WhatsApp reminders
- Reminder history

### 📱 PWA Features (NEW!)
- **Install as App** - Add to home screen on any device
- **Offline Support** - Works without internet (cached pages)
- **App-like Experience** - No browser bars, fullscreen
- **Fast Loading** - Cached assets load instantly
- **Future Ready** - Push notifications support built-in

## Setup

### 1. Upload to GitHub
Replace all files in your existing repo with this code.

### 2. Generate App Icons

**Option A: Quick (Recommended)**
1. Go to https://realfavicongenerator.net
2. Upload `/public/icons/icon.svg`
3. Download generated icons
4. Extract to `/public/icons/` folder

**Option B: Manual**
Create PNG files from the SVG in these sizes:
- 72x72, 96x96, 128x128, 144x144
- 152x152, 192x192, 384x384, 512x512

### 3. Update Pharmacy Information

Edit `lib/constants.ts` and `app/(public)/page.tsx`

### 4. Update Password

Edit `components/AuthProvider.tsx`:
```typescript
const APP_PASSWORD = 'YourSecurePassword123';
```

### 5. Deploy

Vercel will auto-deploy after GitHub push.

## How Staff Can Install the App

### On Android:
1. Open website in Chrome
2. Tap "Add to Home Screen" prompt
3. App icon appears on home screen

### On iPhone/iPad:
1. Open website in Safari
2. Tap Share button → "Add to Home Screen"
3. App icon appears on home screen

### On Desktop:
1. Open website in Chrome/Edge
2. Click install icon in address bar

## Costs

| Service | Cost |
|---------|------|
| Hosting | FREE |
| Domain | ₹500-800/year |

## Support

For issues, contact the developer.
