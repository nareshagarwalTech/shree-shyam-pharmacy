'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Pharmacy Info - REAL DETAILS
const PHARMACY_INFO = {
  name: 'Shree Shyam Pharmacy',
  tagline: 'Your Health, Our Priority',
  phone: '+91 9100855455',
  whatsapp: '919100855455',
  email: 'contact@shreeshyampharmacy.com',
  address: 'Dharam Karan Rd, Divyashakti Apartments, Ameerpet, Hyderabad, Telangana 500016',
  shortAddress: 'Ameerpet, Hyderabad',
  mapLink: 'https://maps.google.com/?q=Dharam+Karan+Rd,+Divyashakti+Apartments,+Ameerpet,+Hyderabad',
  established: '1995',
  yearsExperience: new Date().getFullYear() - 1995,
  happyCustomers: '25,000+',
};

// Fancy Pharmacy Logo Component
const PharmacyLogo = ({ size = 'normal' }: { size?: 'normal' | 'large' }) => {
  const dim = size === 'large' ? 64 : 48;
  return (
    <div className="relative" style={{ width: dim, height: dim }}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id="crossGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
        </defs>
        <rect x="5" y="5" width="90" height="90" rx="20" fill="url(#logoGrad)" />
        <rect x="40" y="20" width="20" height="60" rx="4" fill="url(#crossGrad)" />
        <rect x="20" y="40" width="60" height="20" rx="4" fill="url(#crossGrad)" />
        <ellipse cx="50" cy="50" rx="12" ry="6" fill="#06b6d4" transform="rotate(45 50 50)" opacity="0.8" />
        <circle cx="35" cy="35" r="4" fill="white" opacity="0.6" />
      </svg>
    </div>
  );
};

// Icon Components
const PhoneIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const WhatsAppIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const MapPinIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ClockIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowRightIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const StarIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={`${className} fill-yellow-400 text-yellow-400`} viewBox="0 0 24 24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const MenuIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const XIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Service Card Component
const ServiceCard = ({ emoji, title, desc, tag, color }: { emoji: string; title: string; desc: string; tag: string; color: string }) => (
  <div className={`bg-gradient-to-br ${color} rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer`}>
    <div className="text-4xl mb-3">{emoji}</div>
    <div className="text-xs font-bold bg-white/20 rounded-full px-2 py-1 inline-block mb-2">{tag}</div>
    <h3 className="text-lg font-bold mb-1">{title}</h3>
    <p className="text-sm opacity-90">{desc}</p>
  </div>
);

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openWhatsApp = (message = "Hello! I would like to inquire about medicines.") => {
    window.open(`https://wa.me/${PHARMACY_INFO.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top Offer Bar */}
      <div className="bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white py-2.5 px-4 text-center text-sm font-medium">
        <span className="animate-pulse">🎉</span>
        <strong className="mx-2">CITY&apos;S LOWEST PRICES!</strong>
        Up to 25% OFF on medicines • 
        <button onClick={() => openWhatsApp("Hi! I want to get a price quote for my prescription.")} className="ml-2 underline font-bold hover:text-yellow-200">
          Send Prescription for Quote →
        </button>
      </div>

      {/* Navigation */}
      <nav className={`bg-white sticky top-0 z-50 transition-shadow ${isScrolled ? 'shadow-lg' : 'shadow-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <PharmacyLogo />
              <div>
                <h1 className="text-xl font-bold text-blue-700">{PHARMACY_INFO.name}</h1>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-yellow-500">★</span>
                  <span className="text-gray-600">Trusted Since {PHARMACY_INFO.established}</span>
                  <span className="mx-1 text-gray-300">|</span>
                  <span className="text-green-600 font-medium">📍 {PHARMACY_INFO.shortAddress}</span>
                </div>
              </div>
            </Link>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-4">
              <a href="#services" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Services</a>
              <a href="#about" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">About</a>
              <a href="#contact" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Contact</a>
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">Staff Login</Link>
              <button 
                onClick={() => openWhatsApp()}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full transition-all"
              >
                <WhatsAppIcon className="w-5 h-5" />
                <span className="hidden lg:inline">WhatsApp Us</span>
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2"
            >
              {mobileMenuOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t mt-3">
              <div className="flex flex-col gap-3">
                <a href="#services" onClick={() => setMobileMenuOpen(false)} className="text-gray-700 font-medium py-2">Services</a>
                <a href="#about" onClick={() => setMobileMenuOpen(false)} className="text-gray-700 font-medium py-2">About</a>
                <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="text-gray-700 font-medium py-2">Contact</a>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="text-gray-700 font-medium py-2">Staff Login</Link>
                <button 
                  onClick={() => { openWhatsApp(); setMobileMenuOpen(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white font-semibold rounded-xl"
                >
                  <WhatsAppIcon className="w-5 h-5" />
                  WhatsApp Us
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 bg-cyan-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-60 h-60 bg-blue-400 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Left Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur rounded-full text-sm mb-6 border border-white/20">
                <span className="text-yellow-400">⭐</span>
                <span>Trusted Since {PHARMACY_INFO.established} • {PHARMACY_INFO.yearsExperience} Years of Service</span>
              </div>
              
              <h1 className="text-3xl lg:text-5xl font-bold leading-tight mb-4">
                Your One-Stop Shop for
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-teal-300 mt-1">
                  All Medical Needs
                </span>
              </h1>
              
              <p className="text-lg text-blue-100 mb-3">
                🏷️ <span className="text-yellow-300 font-bold">City&apos;s Lowest Prices!</span> Save up to <span className="text-yellow-300 font-bold">25%</span> on medicines.
              </p>
              <p className="text-blue-200 mb-6">
                📋 Send your prescription on WhatsApp → Get instant price quote → Same day delivery!
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <button 
                  onClick={() => openWhatsApp("Hi! I want to send my prescription for a price quote.")}
                  className="flex items-center justify-center gap-3 px-6 py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-2xl shadow-xl transition-all hover:scale-105"
                >
                  <WhatsAppIcon />
                  Send Prescription for Quote
                  <ArrowRightIcon />
                </button>
                <a
                  href={`tel:${PHARMACY_INFO.phone}`}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-white/10 backdrop-blur text-white font-semibold rounded-2xl border border-white/30 hover:bg-white/20 transition-all"
                >
                  <PhoneIcon />
                  {PHARMACY_INFO.phone}
                </a>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/20">
                <div>
                  <div className="text-2xl lg:text-3xl font-bold">{PHARMACY_INFO.happyCustomers}</div>
                  <div className="text-blue-200 text-sm">Happy Customers</div>
                </div>
                <div>
                  <div className="text-2xl lg:text-3xl font-bold">5000+</div>
                  <div className="text-blue-200 text-sm">Products</div>
                </div>
                <div>
                  <div className="text-2xl lg:text-3xl font-bold">Same Day</div>
                  <div className="text-blue-200 text-sm">Delivery*</div>
                </div>
              </div>
            </div>

            {/* Right - Price Quote Card */}
            <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-2xl text-gray-900">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl">💰</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Get Instant Price Quote</h3>
                  <p className="text-gray-600 text-sm">Know the price before you buy!</p>
                </div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">
                    <CheckIcon />
                  </div>
                  <span className="text-gray-800">Up to <strong className="text-green-600">25% OFF</strong> on medicines*</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                    <CheckIcon />
                  </div>
                  <span className="text-gray-800"><strong className="text-blue-600">Lowest prices</strong> in Hyderabad</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white">
                    <CheckIcon />
                  </div>
                  <span className="text-gray-800"><strong className="text-orange-600">Same day delivery</strong> to your door*</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white">
                    <CheckIcon />
                  </div>
                  <span className="text-gray-800"><strong className="text-purple-600">Free delivery</strong> on orders ₹500+*</span>
                </div>
              </div>

              <button 
                onClick={() => openWhatsApp("Hi! I want to send my prescription photo for a price quote.")}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-all"
              >
                <WhatsAppIcon />
                WhatsApp Your Prescription
              </button>
              
              <p className="text-center text-gray-400 text-xs mt-4">*T&C Apply. Discounts vary by product category.</p>
            </div>
          </div>
        </div>
      </section>

      {/* USP Bar */}
      <section className="bg-gradient-to-r from-blue-600 to-cyan-500 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-4 lg:gap-8 text-white text-sm font-medium">
            {[
              { icon: '💰', text: 'Lowest Prices' },
              { icon: '🏷️', text: 'Up to 25% OFF' },
              { icon: '🚚', text: 'Free Delivery*' },
              { icon: '📦', text: 'Same Day Delivery' },
              { icon: '✅', text: '100% Genuine' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section id="services" className="py-12 lg:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">How Can We Help You Today?</h2>
            <p className="text-gray-600">Click on any service to get started</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <div 
              onClick={() => openWhatsApp("Hi! I want to send my prescription for a price quote.")}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer border-2 border-green-500 relative"
            >
              <div className="absolute -top-2 -right-2 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-full">POPULAR</div>
              <div className="text-4xl mb-3">📋</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Get Price Quote</h3>
              <p className="text-gray-600 text-sm mb-4">Send prescription, get prices instantly</p>
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <WhatsAppIcon className="w-5 h-5" /> WhatsApp Now <ArrowRightIcon />
              </div>
            </div>

            <div 
              onClick={() => openWhatsApp("Hi! I want to order medicines with same day delivery.")}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
            >
              <div className="text-4xl mb-3">🚚</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Order Medicines</h3>
              <p className="text-gray-600 text-sm mb-4">Same day home delivery available*</p>
              <div className="flex items-center gap-2 text-blue-600 font-semibold">
                Order Now <ArrowRightIcon />
              </div>
            </div>

            <div 
              onClick={() => openWhatsApp("Hi! I want to book a lab test with home sample collection.")}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
            >
              <div className="text-4xl mb-3">🧪</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Book Lab Test</h3>
              <p className="text-gray-600 text-sm mb-4">Home sample collection available</p>
              <div className="flex items-center gap-2 text-purple-600 font-semibold">
                Book Now <ArrowRightIcon />
              </div>
            </div>

            <div 
              onClick={() => openWhatsApp("Hi! I want to inquire about medical equipment.")}
              className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
            >
              <div className="text-4xl mb-3">🏥</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Medical Equipment</h3>
              <p className="text-gray-600 text-sm mb-4">BP monitors, wheelchairs & more</p>
              <div className="flex items-center gap-2 text-orange-600 font-semibold">
                View Products <ArrowRightIcon />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-12 lg:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-full text-blue-700 text-sm font-medium mb-3">
              🏪 Your Neighbourhood Medical Store
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">One Shop for All Medical Needs</h2>
            <p className="text-gray-600">Everything your family needs under one roof</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            <ServiceCard emoji="💊" title="Prescription Medicines" desc="All branded & generic medicines at lowest prices" tag="UP TO 25% OFF" color="from-blue-500 to-blue-600" />
            <ServiceCard emoji="🩺" title="Free Health Checkup" desc="BP, Sugar monitoring - Walk in anytime!" tag="FREE SERVICE" color="from-green-500 to-emerald-600" />
            <ServiceCard emoji="🧪" title="Lab Tests & Diagnostics" desc="Home sample collection, reports in 24 hours" tag="HOME COLLECTION" color="from-purple-500 to-violet-600" />
            <ServiceCard emoji="🏥" title="Medical Equipment" desc="BP monitors, glucometers, wheelchairs, oxygen" tag="BUY & RENT" color="from-orange-500 to-red-500" />
            <ServiceCard emoji="👶" title="Baby & Mother Care" desc="Diapers, baby food, supplements & more" tag="FULL RANGE" color="from-pink-500 to-rose-500" />
            <ServiceCard emoji="🌿" title="Ayurveda & Wellness" desc="Natural remedies, supplements, skincare" tag="HERBAL" color="from-teal-500 to-cyan-600" />
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section id="about" className="py-12 lg:py-16 bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-900 text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400/20 text-yellow-300 rounded-full text-sm font-medium mb-4">
                💰 Why Pay More Elsewhere?
              </div>
              <h2 className="text-2xl lg:text-3xl font-bold mb-6">
                City&apos;s Best Prices.<br/>
                <span className="text-cyan-300">Guaranteed!</span>
              </h2>
              
              <div className="space-y-3">
                {[
                  { title: 'Up to 25% Discount', desc: 'On branded & generic medicines*', tag: '🏷️' },
                  { title: 'Same Day Delivery', desc: 'Order before 6 PM, get it today*', tag: '🚚' },
                  { title: 'Free Home Delivery', desc: 'On orders above ₹500*', tag: '🆓' },
                  { title: 'Price Match Promise', desc: 'Found lower price? We\'ll beat it!', tag: '💯' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-white/10 backdrop-blur rounded-xl">
                    <span className="text-2xl">{item.tag}</span>
                    <div>
                      <h4 className="font-bold">{item.title}</h4>
                      <p className="text-blue-200 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => openWhatsApp("Hi! I want to get a price quote for my medicines.")}
                className="mt-6 flex items-center gap-3 px-6 py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-2xl shadow-xl transition-all"
              >
                <WhatsAppIcon />
                Get My Price Quote
              </button>
            </div>

            {/* Big Offer Card */}
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6 lg:p-8 border border-white/20 text-center">
              <div className="text-sm font-medium text-cyan-300 mb-2">SPECIAL OFFER</div>
              <div className="text-6xl lg:text-8xl font-black mb-2">25%</div>
              <div className="text-xl lg:text-2xl font-bold mb-4">OFF on Medicines*</div>
              
              <div className="bg-white/10 rounded-2xl p-4 mb-6 text-left">
                <div className="text-sm font-semibold text-cyan-300 mb-3">HOW IT WORKS:</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-green-500/30 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span>📱 Click WhatsApp button</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-green-500/30 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <span>📋 Send prescription photo</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-green-500/30 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <span>💰 Get price quote in minutes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-green-500/30 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    <span>🚚 Same day delivery!</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => openWhatsApp("Hi! I want to send my prescription for a price quote.")}
                className="w-full py-4 bg-white text-blue-700 font-bold rounded-2xl shadow-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-all"
              >
                <span className="text-green-600"><WhatsAppIcon /></span>
                Get Quote Now
              </button>
              
              <p className="text-blue-300/60 text-xs mt-4">*T&C Apply. Discount varies by brand.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-12 lg:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">{PHARMACY_INFO.happyCustomers} Happy Customers</h2>
            <p className="text-gray-600">Trusted by families in Ameerpet & across Hyderabad since 1995</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Ramesh Kumar', location: 'Ameerpet', text: 'Best prices in Hyderabad! I save ₹500+ every month on my diabetes medicines. Same day delivery is amazing.', avatar: 'RK' },
              { name: 'Priya Sharma', location: 'SR Nagar', text: 'WhatsApp ordering is so convenient! Send prescription, get quote in minutes, medicines delivered same day.', avatar: 'PS' },
              { name: 'Dr. Venkat Rao', location: 'Punjagutta', text: 'As a doctor, I recommend Shree Shyam to all my patients. Genuine medicines at honest prices.', avatar: 'VR' },
            ].map((t, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-lg">
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, j) => <StarIcon key={j} />)}
                </div>
                <p className="text-gray-700 mb-4 italic">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{t.name}</div>
                    <div className="text-sm text-gray-500">{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-12 lg:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Visit Us Today</h2>
            <p className="text-gray-600">Conveniently located in Ameerpet, Hyderabad</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="bg-blue-50 rounded-2xl p-6 text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                <MapPinIcon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">Our Location</h3>
              <p className="text-gray-600 text-sm">{PHARMACY_INFO.address}</p>
              <a href={PHARMACY_INFO.mapLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 font-medium mt-3 text-sm">
                Get Directions <ArrowRightIcon />
              </a>
            </div>

            <div className="bg-green-50 rounded-2xl p-6 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-green-600">
                <ClockIcon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">Working Hours</h3>
              <p className="text-gray-600">Mon - Sat: 8 AM - 10 PM</p>
              <p className="text-gray-600">Sunday: 9 AM - 2 PM</p>
              <span className="inline-block mt-3 px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">Open 7 Days</span>
            </div>

            <div className="bg-cyan-50 rounded-2xl p-6 text-center">
              <div className="w-14 h-14 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-cyan-600">
                <PhoneIcon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">Contact Us</h3>
              <p className="text-gray-900 font-bold text-lg">{PHARMACY_INFO.phone}</p>
              <button 
                onClick={() => openWhatsApp()}
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-green-500 text-white font-medium rounded-full text-sm"
              >
                <WhatsAppIcon className="w-4 h-4" /> WhatsApp Us
              </button>
            </div>
          </div>

          {/* Google Map */}
          <div className="rounded-2xl overflow-hidden shadow-lg h-64 lg:h-80">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3806.5456!2d78.4478!3d17.4375!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bcb90c7e7d4b8b9%3A0x8b8b8b8b8b8b8b8b!2sAmeerpet%2C%20Hyderabad%2C%20Telangana!5e0!3m2!1sen!2sin!4v1234567890"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-12 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl lg:text-3xl font-bold mb-3">Ready to Save on Medicines?</h2>
          <p className="text-green-100 mb-6">Send prescription → Get quote → Same day delivery!</p>
          <button 
            onClick={() => openWhatsApp("Hi! I want to send my prescription for a price quote.")}
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-green-600 font-bold text-lg rounded-2xl shadow-xl hover:scale-105 transition-all"
          >
            <WhatsAppIcon />
            WhatsApp Your Prescription
          </button>
          <p className="text-green-200 text-xs mt-4">*T&C Apply. Free delivery on ₹500+. Same day delivery for orders before 6 PM.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <PharmacyLogo />
                <div>
                  <h3 className="font-bold">{PHARMACY_INFO.name}</h3>
                  <p className="text-blue-400 text-sm">Since {PHARMACY_INFO.established}</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Your trusted neighbourhood pharmacy in Ameerpet, serving Hyderabad for {PHARMACY_INFO.yearsExperience}+ years.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Quick Links</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#services" className="hover:text-blue-400">Services</a></li>
                <li><a href="#about" className="hover:text-blue-400">About Us</a></li>
                <li><a href="#contact" className="hover:text-blue-400">Contact</a></li>
                <li><Link href="/dashboard" className="hover:text-blue-400">Staff Login</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Contact</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li className="flex items-center gap-2"><PhoneIcon className="w-4 h-4" /> {PHARMACY_INFO.phone}</li>
                <li className="flex items-start gap-2"><MapPinIcon className="w-4 h-4 mt-0.5" /> <span>{PHARMACY_INFO.shortAddress}</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
            <p className="text-gray-500">© {new Date().getFullYear()} {PHARMACY_INFO.name}. All rights reserved.</p>
            <p className="text-gray-500">*Terms & Conditions apply to all offers.</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        <div className="bg-gray-900 text-white px-3 py-2 rounded-xl text-sm shadow-lg animate-bounce">
          📋 Send Prescription for Quote!
        </div>
        <button 
          onClick={() => openWhatsApp("Hi! I want to inquire about medicines.")}
          className="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40 hover:scale-110 transition-all"
        >
          <WhatsAppIcon className="w-7 h-7 text-white" />
        </button>
      </div>
    </div>
  );
}
