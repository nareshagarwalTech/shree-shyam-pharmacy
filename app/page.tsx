'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { PHARMACY_INFO } from '@/lib/constants';

// ============================================================================
// ICONS
// ============================================================================
const WhatsAppIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

const PhoneIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const MapPinIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const SearchIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const UploadIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" />
  </svg>
);

const MenuIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const StarIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const ShieldIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const HomeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

// ============================================================================
// LOGO
// ============================================================================
const Logo = ({ size = 44 }: { size?: number }) => (
  <div className="relative" style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2f8658" />
          <stop offset="100%" stopColor="#1f6f4a" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#brandGrad)" />
      <rect x="42" y="22" width="16" height="56" rx="3" fill="#faf7f0" />
      <rect x="22" y="42" width="56" height="16" rx="3" fill="#faf7f0" />
      <circle cx="50" cy="50" r="5" fill="#d4a843" />
    </svg>
  </div>
);

// ============================================================================
// HELPERS
// ============================================================================
const openWhatsApp = (message: string) => {
  window.open(
    `https://wa.me/${PHARMACY_INFO.whatsapp}?text=${encodeURIComponent(message)}`,
    '_blank',
    'noopener,noreferrer'
  );
};

// ============================================================================
// PAGE
// ============================================================================
export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    openWhatsApp(`Hi! I'd like to know the price and availability of: ${q}`);
    setSearchQuery('');
    searchInputRef.current?.blur();
  };

  const areaText = PHARMACY_INFO.serviceAreas.slice(0, 3).join(' · ');

  return (
    <div className="min-h-screen bg-cream-100 text-gray-900">
      {/* ================ Pincode / service bar ================ */}
      <div className="bg-brand-700 text-cream-50 text-xs sm:text-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPinIcon className="w-4 h-4 text-mustard-400 shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-cream-50">Serving {areaText}</span>
              <span className="hidden sm:inline text-cream-200"> · Delivery in under 45 min</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-cream-100">
            <span>{PHARMACY_INFO.hours.weekdays}</span>
            <span className="text-cream-300">|</span>
            <a href={`tel:${PHARMACY_INFO.phone}`} className="font-medium hover:text-mustard-400">
              {PHARMACY_INFO.phone}
            </a>
          </div>
        </div>
      </div>

      {/* ================ Navigation ================ */}
      <nav
        className={`sticky top-0 z-40 bg-cream-100 transition-shadow ${
          scrolled ? 'shadow-md' : 'border-b border-cream-300'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <Logo />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-brand-700 text-lg sm:text-xl leading-tight">
                {PHARMACY_INFO.name}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <StarIcon className="w-3 h-3 text-mustard-500" />
                <span>
                  {PHARMACY_INFO.googleRating} · Since {PHARMACY_INFO.established}
                </span>
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <a href="#services" className="text-gray-700 hover:text-brand-700 font-medium">
              Services
            </a>
            <a href="#about" className="text-gray-700 hover:text-brand-700 font-medium">
              About
            </a>
            <a href="#contact" className="text-gray-700 hover:text-brand-700 font-medium">
              Contact
            </a>
            <Link href="/dashboard" className="text-gray-600 hover:text-brand-700 text-sm">
              Staff Login
            </Link>
            <button
              onClick={() => openWhatsApp('Hi! I would like to order medicines.')}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-full shadow-sm transition-all"
            >
              <WhatsAppIcon className="w-5 h-5" />
              WhatsApp Us
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 text-gray-700"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-cream-300 bg-cream-50">
            <div className="px-4 py-3 flex flex-col gap-1">
              <a
                href="#services"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-gray-700 font-medium"
              >
                Services
              </a>
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-gray-700 font-medium"
              >
                About
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-gray-700 font-medium"
              >
                Contact
              </a>
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 text-gray-600 text-sm"
              >
                Staff Login
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ================ Hero ================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-100 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-mustard-300 rounded-full blur-3xl opacity-30" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-10 lg:py-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 border border-brand-200 rounded-full text-brand-700 text-xs font-semibold mb-5">
                <ShieldIcon className="w-4 h-4" />
                Your Trusted Ameerpet Pharmacy · {PHARMACY_INFO.yearsExperience}+ Years
              </div>

              <h2 className="font-display text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                Genuine medicines,
                <span className="block text-brand-700">fair prices, delivered fast.</span>
              </h2>

              <p className="text-lg text-gray-700 mb-2 max-w-xl">
                Send your prescription on WhatsApp. Get an honest price quote in minutes.
                Same-day delivery across Ameerpet and nearby areas.
              </p>
              <p className="text-sm text-gray-600 mb-7">
                No apps to install. No account needed. Just message us like you&apos;d message a friend.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <button
                  onClick={() =>
                    openWhatsApp(
                      'Hi! I would like to send my prescription for a price quote and delivery.'
                    )
                  }
                  className="flex items-center justify-center gap-3 px-6 py-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl shadow-lg shadow-brand-600/20 transition-all hover:shadow-brand-600/30"
                >
                  <WhatsAppIcon className="w-5 h-5" />
                  Send Prescription on WhatsApp
                </button>
                <a
                  href={`tel:${PHARMACY_INFO.phone}`}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-brand-600 text-brand-700 font-semibold rounded-2xl hover:bg-brand-50 transition-all"
                >
                  <PhoneIcon className="w-5 h-5" />
                  Call {PHARMACY_INFO.phone}
                </a>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-cream-300">
                <Stat value={PHARMACY_INFO.happyCustomers} label="Happy Customers" />
                <Stat value={`${PHARMACY_INFO.yearsExperience}+`} label="Years Serving" />
                <Stat
                  value={
                    <span className="inline-flex items-center gap-1">
                      {PHARMACY_INFO.googleRating}
                      <StarIcon className="w-4 h-4 text-mustard-500" />
                    </span>
                  }
                  label={`${PHARMACY_INFO.googleReviews} reviews`}
                />
              </div>
            </div>

            {/* Right — Rx upload card */}
            <div className="bg-white rounded-3xl shadow-xl shadow-brand-900/5 border border-cream-300 p-6 lg:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-mustard-500 rounded-xl flex items-center justify-center text-white shadow-md">
                  <UploadIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-xl text-gray-900">
                    Get a price quote now
                  </h3>
                  <p className="text-sm text-gray-600">Three simple steps, no waiting in queues.</p>
                </div>
              </div>

              <ol className="space-y-3 mb-6">
                {[
                  'Take a clear photo of your prescription',
                  'WhatsApp it to us — we reply with prices and availability',
                  'Confirm order. Delivered to your door same day.',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-semibold text-sm flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-gray-700 pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>

              <button
                onClick={() =>
                  openWhatsApp(
                    'Hi! I want to send my prescription photo for a price quote.'
                  )
                }
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl flex items-center justify-center gap-3 transition-all"
              >
                <WhatsAppIcon className="w-5 h-5" />
                Open WhatsApp
              </button>

              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <CheckIcon className="w-4 h-4 text-brand-600" />
                  100% Genuine
                </span>
                <span className="flex items-center gap-1">
                  <CheckIcon className="w-4 h-4 text-brand-600" />
                  COD Available
                </span>
                <span className="flex items-center gap-1">
                  <CheckIcon className="w-4 h-4 text-brand-600" />
                  GST Bill
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================ Search bar ================ */}
      <section className="bg-cream-100 pb-8 -mt-2">
        <div className="max-w-4xl mx-auto px-4">
          <form
            onSubmit={handleSearch}
            className="bg-white rounded-2xl shadow-md shadow-brand-900/5 border border-cream-300 p-2 flex items-center gap-2"
          >
            <SearchIcon className="w-5 h-5 text-gray-400 ml-3 shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              placeholder="Search a medicine or brand — e.g. Dolo 650, Metformin…"
              className="flex-1 px-2 py-3 bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
              aria-label="Search medicines"
            />
            <button
              type="submit"
              className="px-4 py-3 sm:px-6 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-all whitespace-nowrap"
            >
              <span className="hidden sm:inline">Ask on WhatsApp</span>
              <span className="sm:hidden">Search</span>
            </button>
          </form>
          <p className="text-center text-xs text-gray-500 mt-2">
            We reply on WhatsApp with price, stock, and generic alternatives.
          </p>
        </div>
      </section>

      {/* ================ Quick action tiles ================ */}
      <section id="services" className="py-12 lg:py-16 bg-cream-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading
            eyebrow="How can we help"
            title="Everything you need, one message away"
            sub="Tap a tile. WhatsApp opens with the right message ready to send."
          />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mt-8">
            <ActionTile
              icon="💊"
              title="Order Medicines"
              desc="Branded & generic, best prices"
              popular
              onClick={() =>
                openWhatsApp('Hi! I want to order medicines. Here are the details:')
              }
            />
            <ActionTile
              icon="📋"
              title="Upload Prescription"
              desc="Send Rx photo, get quote"
              onClick={() =>
                openWhatsApp(
                  'Hi! I would like to send my prescription for a price quote.'
                )
              }
            />
            <ActionTile
              icon="🔁"
              title="Refill Reminders"
              desc="Never miss a dose"
              onClick={() =>
                openWhatsApp(
                  'Hi! I would like to set up automatic refill reminders for my regular medicines.'
                )
              }
            />
            <ActionTile
              icon="🧪"
              title="Book Lab Tests"
              desc="Home sample collection"
              onClick={() =>
                openWhatsApp(
                  'Hi! I want to book a lab test with home sample collection.'
                )
              }
            />
            <ActionTile
              icon="🏥"
              title="Medical Equipment"
              desc="BP monitors, glucometers, etc."
              onClick={() =>
                openWhatsApp(
                  'Hi! I want to inquire about medical equipment (BP monitor, glucometer, etc.).'
                )
              }
            />
            <ActionTile
              icon="📞"
              title="Call the Store"
              desc={PHARMACY_INFO.phone}
              href={`tel:${PHARMACY_INFO.phone}`}
            />
          </div>
        </div>
      </section>

      {/* ================ Condition shortcuts ================ */}
      <section className="py-12 lg:py-16 bg-cream-100">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading
            eyebrow="Shop by need"
            title="Chronic care, made easy"
            sub="Regular meds for long-term conditions — we remember so you don't have to."
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-8">
            {[
              { icon: '🩸', title: 'Diabetes', sub: 'Metformin, Insulin, Test strips', color: 'from-brand-600 to-brand-700' },
              { icon: '❤️', title: 'BP & Heart', sub: 'Telmisartan, Rosuvastatin', color: 'from-mustard-500 to-mustard-600' },
              { icon: '🦋', title: 'Thyroid', sub: 'Thyronorm, Eltroxin', color: 'from-brand-500 to-brand-600' },
              { icon: '✨', title: 'Skin & Hair', sub: 'Dermat-prescribed meds', color: 'from-mustard-400 to-mustard-500' },
            ].map((c) => (
              <button
                key={c.title}
                onClick={() =>
                  openWhatsApp(
                    `Hi! I'm looking for ${c.title.toLowerCase()} medicines. Can you help?`
                  )
                }
                className={`text-left rounded-2xl p-5 lg:p-6 bg-gradient-to-br ${c.color} text-white hover:scale-[1.02] hover:shadow-xl transition-all`}
              >
                <div className="text-3xl mb-3">{c.icon}</div>
                <div className="font-display font-bold text-lg">{c.title}</div>
                <div className="text-xs opacity-90 mt-1">{c.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ================ About the shop ================ */}
      <section id="about" className="py-12 lg:py-16 bg-cream-50">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-mustard-700 bg-mustard-300/30 px-3 py-1 rounded-full mb-4">
              About the shop
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Serving Ameerpet families since {PHARMACY_INFO.established}.
            </h2>
            <p className="text-gray-700 mb-4 leading-relaxed">
              We started as a small neighbourhood shop on Dharam Karan Road and grew by doing
              one thing well — giving honest advice and fair prices to the families that trust us.
              Three decades later, you&apos;ll still find the same face behind the counter and
              the same ledger of regular customers.
            </p>
            <p className="text-gray-700 mb-6 leading-relaxed">
              Today we combine that old-school trust with modern convenience — WhatsApp ordering,
              price transparency, and delivery to your door.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge>B.Pharm Registered Pharmacist</Badge>
              <Badge>Licensed Drug Dealer</Badge>
              <Badge>GST Billing</Badge>
              <Badge>Cold-chain refrigeration</Badge>
            </div>
          </div>

          <div className="relative">
            <div className="aspect-[4/5] rounded-3xl bg-gradient-to-br from-brand-700 to-brand-800 overflow-hidden flex items-center justify-center text-cream-50 p-8 shadow-xl">
              <div className="text-center">
                <Logo size={96} />
                <div className="mt-4 font-display text-2xl font-bold">{PHARMACY_INFO.name}</div>
                <div className="text-cream-200 text-sm mt-1">Est. {PHARMACY_INFO.established}</div>
                <div className="mt-6 inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 text-sm">
                  <MapPinIcon className="w-4 h-4 text-mustard-400" />
                  {PHARMACY_INFO.shortAddress}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl p-4 shadow-xl border border-cream-300 max-w-[200px]">
              <div className="flex items-center gap-1 mb-1">
                {[...Array(5)].map((_, i) => (
                  <StarIcon key={i} className="w-4 h-4 text-mustard-500" />
                ))}
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {PHARMACY_INFO.googleRating} on Google
              </div>
              <div className="text-xs text-gray-500">
                {PHARMACY_INFO.googleReviews}+ verified reviews
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================ Trust strip ================ */}
      <section className="py-8 bg-brand-700 text-cream-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <TrustItem
              big={`${PHARMACY_INFO.yearsExperience}+`}
              label="Years in business"
            />
            <TrustItem big="100%" label="Genuine medicines" />
            <TrustItem
              big={
                <span className="inline-flex items-center gap-1">
                  {PHARMACY_INFO.googleRating}
                  <StarIcon className="w-5 h-5 text-mustard-400" />
                </span>
              }
              label="Google rating"
            />
            <TrustItem big="25K+" label="Happy customers" />
          </div>
          <div className="mt-6 pt-6 border-t border-brand-600 text-center text-sm text-cream-200">
            <span className="block sm:inline">
              Licensed Pharmacist · <span className="text-cream-50 font-medium">{PHARMACY_INFO.pharmacistName}</span> ({PHARMACY_INFO.pharmacistCredentials})
            </span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{PHARMACY_INFO.licenseNumber}</span>
          </div>
        </div>
      </section>

      {/* ================ Testimonials ================ */}
      <section className="py-12 lg:py-16 bg-cream-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading
            eyebrow="Neighbours speak"
            title={`${PHARMACY_INFO.happyCustomers} families across Hyderabad`}
            sub="Real words from real customers in and around Ameerpet."
          />

          <div className="grid md:grid-cols-3 gap-5 mt-8">
            {[
              {
                name: 'Ramesh Kumar',
                loc: 'Ameerpet',
                text: 'Best prices in Hyderabad. I save ₹500+ every month on my diabetes medicines, and delivery is always on time.',
                initials: 'RK',
              },
              {
                name: 'Priya Sharma',
                loc: 'SR Nagar',
                text: 'Ordering on WhatsApp is so convenient. Send a photo of the prescription, get a quote in minutes, same-day delivery. Very reliable.',
                initials: 'PS',
              },
              {
                name: 'Dr. Venkat Rao',
                loc: 'Punjagutta',
                text: 'As a doctor, I recommend Shree Shyam to my patients. Genuine medicines, honest pricing, and they actually know their pharmacy.',
                initials: 'VR',
              },
            ].map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-sm border border-cream-300 flex flex-col"
              >
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, j) => (
                    <StarIcon key={j} className="w-4 h-4 text-mustard-500" />
                  ))}
                </div>
                <p className="text-gray-700 mb-5 flex-1 leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3 pt-4 border-t border-cream-200">
                  <div className="w-10 h-10 rounded-full bg-brand-600 text-white font-semibold flex items-center justify-center">
                    {t.initials}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================ Contact ================ */}
      <section id="contact" className="py-12 lg:py-16 bg-cream-100">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading
            eyebrow="Visit us"
            title="Stop by the shop anytime"
            sub={PHARMACY_INFO.address}
          />

          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <InfoCard
              icon={<MapPinIcon className="w-6 h-6" />}
              title="Location"
              body={PHARMACY_INFO.address}
              actionLabel="Get directions"
              actionHref={PHARMACY_INFO.mapLink}
            />
            <InfoCard
              icon={<PhoneIcon className="w-6 h-6" />}
              title="Contact"
              body={
                <>
                  <div className="font-semibold text-gray-900">{PHARMACY_INFO.phone}</div>
                  <div className="text-gray-500 text-sm mt-0.5">{PHARMACY_INFO.email}</div>
                </>
              }
              actionLabel="WhatsApp us"
              actionOnClick={() => openWhatsApp('Hi! I would like to inquire about medicines.')}
            />
            <InfoCard
              icon={<HomeIcon className="w-6 h-6" />}
              title="Hours"
              body={
                <>
                  <div>{PHARMACY_INFO.hours.weekdays}</div>
                  <div>{PHARMACY_INFO.hours.sunday}</div>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-semibold rounded-full">
                    Open 7 days
                  </span>
                </>
              }
            />
          </div>

          <div className="mt-6 rounded-2xl overflow-hidden shadow-md border border-cream-300 h-64 lg:h-80">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3806.5456!2d78.4478!3d17.4375!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bcb90c7e7d4b8b9%3A0x8b8b8b8b8b8b8b8b!2sAmeerpet%2C%20Hyderabad%2C%20Telangana!5e0!3m2!1sen!2sin!4v1234567890"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Shree Shyam Pharmacy location"
            />
          </div>
        </div>
      </section>

      {/* ================ Final CTA ================ */}
      <section className="py-14 bg-gradient-to-br from-brand-700 via-brand-700 to-brand-800 text-cream-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-3">
            Ready to save on this month&apos;s medicines?
          </h2>
          <p className="text-cream-200 mb-7">
            Send your prescription now. Quote in minutes. Delivered same day.
          </p>
          <button
            onClick={() =>
              openWhatsApp('Hi! I want to send my prescription for a price quote.')
            }
            className="inline-flex items-center gap-3 px-8 py-4 bg-mustard-500 hover:bg-mustard-600 text-brand-900 font-bold text-lg rounded-2xl shadow-xl transition-all hover:scale-105"
          >
            <WhatsAppIcon className="w-6 h-6" />
            WhatsApp your prescription
          </button>
        </div>
      </section>

      {/* ================ Footer ================ */}
      <footer className="bg-gray-900 text-gray-300 pt-12 pb-24 md:pb-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Logo />
                <div>
                  <div className="font-display font-bold text-white">{PHARMACY_INFO.name}</div>
                  <div className="text-xs text-gray-500">Since {PHARMACY_INFO.established}</div>
                </div>
              </div>
              <p className="text-sm text-gray-400 max-w-md">
                Your trusted neighbourhood pharmacy in Ameerpet, Hyderabad. Genuine medicines,
                fair prices, same-day delivery.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">
                Quick links
              </h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#services" className="hover:text-mustard-400">Services</a></li>
                <li><a href="#about" className="hover:text-mustard-400">About</a></li>
                <li><a href="#contact" className="hover:text-mustard-400">Contact</a></li>
                <li><Link href="/dashboard" className="hover:text-mustard-400">Staff login</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">
                Contact
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <PhoneIcon className="w-4 h-4 mt-0.5 text-mustard-400 shrink-0" />
                  <a href={`tel:${PHARMACY_INFO.phone}`} className="hover:text-mustard-400">
                    {PHARMACY_INFO.phone}
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <MapPinIcon className="w-4 h-4 mt-0.5 text-mustard-400 shrink-0" />
                  <span>{PHARMACY_INFO.shortAddress}</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-gray-500">
            <p>© {new Date().getFullYear()} {PHARMACY_INFO.name}. All rights reserved.</p>
            <p>{PHARMACY_INFO.licenseNumber}</p>
          </div>
        </div>
      </footer>

      {/* ================ Floating WhatsApp (desktop) ================ */}
      <button
        onClick={() => openWhatsApp('Hi! I want to inquire about medicines.')}
        className="hidden md:flex fixed bottom-6 right-6 z-40 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full items-center justify-center shadow-2xl shadow-green-500/40 hover:scale-110 transition-all"
        aria-label="Chat on WhatsApp"
      >
        <WhatsAppIcon className="w-7 h-7 text-white" />
      </button>

      {/* ================ Mobile bottom nav ================ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-cream-300 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="grid grid-cols-4">
          <BottomNavItem
            icon={<HomeIcon className="w-5 h-5" />}
            label="Home"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          />
          <BottomNavItem
            icon={<UploadIcon className="w-5 h-5" />}
            label="Send Rx"
            onClick={() => openWhatsApp('Hi! I want to send my prescription for a quote.')}
          />
          <BottomNavItem
            icon={<WhatsAppIcon className="w-5 h-5" />}
            label="WhatsApp"
            highlight
            onClick={() => openWhatsApp('Hi! I want to inquire about medicines.')}
          />
          <BottomNavItem
            icon={<PhoneIcon className="w-5 h-5" />}
            label="Call"
            href={`tel:${PHARMACY_INFO.phone}`}
          />
        </div>
      </nav>
    </div>
  );
}

// ============================================================================
// SMALL COMPONENTS
// ============================================================================
function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl lg:text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      {eyebrow && (
        <div className="inline-block text-xs font-semibold uppercase tracking-wider text-mustard-700 bg-mustard-300/30 px-3 py-1 rounded-full mb-3">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-3xl lg:text-4xl font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-gray-600 mt-3">{sub}</p>}
    </div>
  );
}

function ActionTile({
  icon,
  title,
  desc,
  popular,
  onClick,
  href,
}: {
  icon: string;
  title: string;
  desc: string;
  popular?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const baseClass = `relative text-left bg-white rounded-2xl p-5 border ${
    popular ? 'border-brand-500' : 'border-cream-300'
  } hover:shadow-lg hover:-translate-y-0.5 transition-all`;

  const inner = (
    <>
      {popular && (
        <span className="absolute -top-2 right-3 bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
          Popular
        </span>
      )}
      <div className="text-3xl mb-2">{icon}</div>
      <div className="font-display font-bold text-gray-900">{title}</div>
      <div className="text-sm text-gray-600 mt-0.5">{desc}</div>
    </>
  );

  if (href) {
    return (
      <a href={href} className={baseClass}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={baseClass} type="button">
      {inner}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 bg-cream-200 text-brand-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-cream-300">
      <CheckIcon className="w-3.5 h-3.5 text-brand-600" />
      {children}
    </span>
  );
}

function TrustItem({ big, label }: { big: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl lg:text-4xl font-bold text-cream-50 leading-none">
        {big}
      </div>
      <div className="text-sm text-cream-200 mt-2">{label}</div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
  actionLabel,
  actionHref,
  actionOnClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  actionOnClick?: () => void;
}) {
  const Action = actionHref
    ? 'a'
    : actionOnClick
    ? 'button'
    : null;
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-cream-300">
      <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display font-bold text-gray-900 mb-2">{title}</h3>
      <div className="text-sm text-gray-600 leading-relaxed">{body}</div>
      {Action && (
        <Action
          {...(actionHref
            ? { href: actionHref, target: '_blank', rel: 'noopener noreferrer' }
            : { onClick: actionOnClick, type: 'button' })}
          className="inline-flex items-center gap-1 mt-4 text-brand-700 hover:text-brand-800 font-semibold text-sm"
        >
          {actionLabel} →
        </Action>
      )}
    </div>
  );
}

function BottomNavItem({
  icon,
  label,
  highlight,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const cls = `flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium ${
    highlight ? 'text-green-600' : 'text-gray-600 hover:text-brand-700'
  }`;
  if (href) {
    return (
      <a href={href} className={cls}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls} type="button">
      {icon}
      {label}
    </button>
  );
}
