'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Phone, 
  MapPin, 
  Clock, 
  MessageCircle, 
  Pill, 
  Heart, 
  Truck, 
  Shield,
  Star,
  ChevronRight,
  Mail,
  Instagram,
  Facebook,
  ArrowRight,
  Stethoscope,
  Tablets,
  Baby,
  Sparkles,
  BadgeCheck,
  Users,
  Calendar
} from 'lucide-react';

// Pharmacy Information - Update these
const PHARMACY_INFO = {
  name: 'Shree Shyam Pharmacy',
  tagline: 'Your Health, Our Priority',
  phone: '+91 98765 43210',
  whatsapp: '919876543210',
  email: 'contact@shreeshyampharmacy.in',
  address: 'Shop No. 12, Main Road, Kukatpally, Hyderabad, Telangana - 500072',
  mapLink: 'https://maps.google.com/?q=Kukatpally,Hyderabad',
  hours: {
    weekdays: '8:00 AM - 10:00 PM',
    sunday: '9:00 AM - 2:00 PM',
  },
  established: '2010',
  happyCustomers: '10,000+',
};

export default function PublicHomePage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openWhatsApp = () => {
    window.open(`https://wa.me/${PHARMACY_INFO.whatsapp}?text=Hello! I would like to inquire about medicines.`, '_blank');
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/95 backdrop-blur-md shadow-lg' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-emerald-200 transition-all group-hover:scale-105">
                <Pill className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={`text-xl font-bold transition-colors ${isScrolled ? 'text-gray-900' : 'text-white'}`}>
                  {PHARMACY_INFO.name}
                </h1>
                <p className={`text-xs transition-colors ${isScrolled ? 'text-emerald-600' : 'text-emerald-200'}`}>
                  {PHARMACY_INFO.tagline}
                </p>
              </div>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              {['Home', 'Services', 'About', 'Contact'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className={`text-sm font-medium transition-colors hover:text-emerald-500 ${
                    isScrolled ? 'text-gray-700' : 'text-white/90'
                  }`}
                >
                  {item}
                </a>
              ))}
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-emerald-200 transition-all hover:scale-105"
              >
                Staff Login
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg"
            >
              <div className={`w-6 h-5 flex flex-col justify-between ${isScrolled ? 'text-gray-900' : 'text-white'}`}>
                <span className={`h-0.5 w-full bg-current transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
                <span className={`h-0.5 w-full bg-current transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`h-0.5 w-full bg-current transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t shadow-lg">
            <div className="px-4 py-4 space-y-3">
              {['Home', 'Services', 'About', 'Contact'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-gray-700 font-medium"
                >
                  {item}
                </a>
              ))}
              <Link
                href="/dashboard"
                className="block py-2 text-emerald-600 font-semibold"
              >
                Staff Login →
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id="home" className="relative min-h-screen flex items-center">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900"></div>
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}></div>
          {/* Decorative Elements */}
          <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-400/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-emerald-200 text-sm mb-6">
                <BadgeCheck className="w-4 h-4" />
                Trusted Since {PHARMACY_INFO.established}
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Your Neighbourhood
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200">
                  Health Partner
                </span>
              </h1>
              
              <p className="text-lg text-emerald-100/80 mb-8 max-w-xl">
                Quality medicines at affordable prices with personalized care. 
                We're here for your health needs, 7 days a week.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={openWhatsApp}
                  className="group flex items-center justify-center gap-3 px-8 py-4 bg-white text-emerald-700 font-semibold rounded-2xl shadow-2xl hover:shadow-white/25 transition-all hover:scale-105"
                >
                  <MessageCircle className="w-5 h-5" />
                  Order on WhatsApp
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <a
                  href={`tel:${PHARMACY_INFO.phone}`}
                  className="flex items-center justify-center gap-3 px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-2xl border border-white/20 hover:bg-white/20 transition-all"
                >
                  <Phone className="w-5 h-5" />
                  Call Now
                </a>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-white/10">
                <div>
                  <div className="text-3xl font-bold text-white">{PHARMACY_INFO.happyCustomers}</div>
                  <div className="text-emerald-200/70 text-sm">Happy Customers</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-white">15+</div>
                  <div className="text-emerald-200/70 text-sm">Years Experience</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-white">5000+</div>
                  <div className="text-emerald-200/70 text-sm">Products</div>
                </div>
              </div>
            </div>

            {/* Right Content - Image/Illustration */}
            <div className="hidden lg:block relative">
              <div className="relative w-full h-[500px]">
                {/* Decorative pharmacy illustration using CSS */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    {/* Main Circle */}
                    <div className="w-80 h-80 bg-gradient-to-br from-white/20 to-white/5 rounded-full backdrop-blur-sm border border-white/20 flex items-center justify-center">
                      <div className="w-60 h-60 bg-gradient-to-br from-emerald-400/30 to-teal-400/30 rounded-full flex items-center justify-center">
                        <Pill className="w-24 h-24 text-white" />
                      </div>
                    </div>
                    
                    {/* Floating Elements */}
                    <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
                      <Heart className="w-10 h-10 text-rose-300" />
                    </div>
                    <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}>
                      <Shield className="w-8 h-8 text-emerald-300" />
                    </div>
                    <div className="absolute top-1/2 -right-8 w-14 h-14 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center animate-bounce" style={{ animationDuration: '2s', animationDelay: '1s' }}>
                      <Truck className="w-7 h-7 text-teal-300" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-8 h-12 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-white/50 rounded-full animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 rounded-full text-emerald-700 text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              What We Offer
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Our Services
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Comprehensive healthcare solutions for you and your family
            </p>
          </div>

          {/* Services Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Tablets,
                title: 'Prescription Medicines',
                description: 'All branded and generic medicines at competitive prices',
                color: 'from-blue-500 to-indigo-600',
                bgColor: 'bg-blue-50',
              },
              {
                icon: Truck,
                title: 'Home Delivery',
                description: 'Free delivery within 5km radius on orders above ₹500',
                color: 'from-emerald-500 to-teal-600',
                bgColor: 'bg-emerald-50',
              },
              {
                icon: Calendar,
                title: 'Refill Reminders',
                description: 'Never miss your medication with our WhatsApp reminders',
                color: 'from-orange-500 to-amber-600',
                bgColor: 'bg-orange-50',
              },
              {
                icon: Stethoscope,
                title: 'Health Checkup',
                description: 'BP, Sugar, and basic health monitoring services',
                color: 'from-rose-500 to-pink-600',
                bgColor: 'bg-rose-50',
              },
              {
                icon: Baby,
                title: 'Baby Care',
                description: 'Complete range of baby food, diapers, and care products',
                color: 'from-purple-500 to-violet-600',
                bgColor: 'bg-purple-50',
              },
              {
                icon: Sparkles,
                title: 'Beauty & Wellness',
                description: 'Skincare, haircare, and personal hygiene products',
                color: 'from-pink-500 to-rose-600',
                bgColor: 'bg-pink-50',
              },
              {
                icon: Shield,
                title: 'Surgical Items',
                description: 'Bandages, syringes, masks, and medical equipment',
                color: 'from-cyan-500 to-blue-600',
                bgColor: 'bg-cyan-50',
              },
              {
                icon: Heart,
                title: 'Ayurvedic & Herbal',
                description: 'Natural remedies and traditional medicine options',
                color: 'from-green-500 to-emerald-600',
                bgColor: 'bg-green-50',
              },
            ].map((service, index) => (
              <div
                key={index}
                className={`group ${service.bgColor} rounded-3xl p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-2 cursor-pointer`}
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${service.color} rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                  <service.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{service.title}</h3>
                <p className="text-gray-600 text-sm">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 rounded-full text-emerald-700 text-sm font-medium mb-4">
                <BadgeCheck className="w-4 h-4" />
                Why Choose Us
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Trusted by Thousands of
                <span className="text-emerald-600"> Happy Customers</span>
              </h2>
              <p className="text-gray-600 mb-8">
                For over {new Date().getFullYear() - parseInt(PHARMACY_INFO.established)} years, we've been serving our community with dedication, 
                ensuring everyone has access to quality healthcare at affordable prices.
              </p>

              <div className="space-y-4">
                {[
                  { title: '100% Genuine Medicines', desc: 'All products sourced directly from authorized distributors' },
                  { title: 'Affordable Prices', desc: 'Best prices in the area with regular discounts' },
                  { title: 'Expert Guidance', desc: 'Our trained pharmacists are here to help' },
                  { title: 'Quick Service', desc: 'Minimal wait time, maximum care' },
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ChevronRight className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{item.title}</h4>
                      <p className="text-gray-600 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Testimonials */}
            <div className="space-y-6">
              {[
                {
                  name: 'Ramesh Kumar',
                  location: 'Kukatpally',
                  text: 'Best pharmacy in the area! Always have all medicines in stock and the staff is very helpful.',
                  rating: 5,
                },
                {
                  name: 'Lakshmi Devi',
                  location: 'KPHB Colony',
                  text: 'The home delivery service is excellent. Very convenient for senior citizens like me.',
                  rating: 5,
                },
                {
                  name: 'Venkat Rao',
                  location: 'Miyapur',
                  text: 'I love the WhatsApp reminder service. Never miss my BP medication anymore!',
                  rating: 5,
                },
              ].map((testimonial, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-gray-50 to-emerald-50/50 rounded-2xl p-6 border border-gray-100"
                >
                  <div className="flex gap-1 mb-3">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-4">"{testimonial.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{testimonial.name}</div>
                      <div className="text-sm text-gray-500">{testimonial.location}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-emerald-200 text-sm font-medium mb-4">
              <Users className="w-4 h-4" />
              About Us
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Serving Our Community Since {PHARMACY_INFO.established}
            </h2>
            <p className="text-emerald-100/80 max-w-2xl mx-auto">
              {PHARMACY_INFO.name} was founded with a simple mission - to provide quality healthcare 
              products at affordable prices while treating every customer like family.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Heart,
                title: 'Our Mission',
                description: 'To make quality healthcare accessible to everyone in our community, regardless of their economic background.',
              },
              {
                icon: Shield,
                title: 'Our Promise',
                description: '100% genuine medicines, fair prices, and honest advice. Your health is our responsibility.',
              },
              {
                icon: Users,
                title: 'Our Team',
                description: 'Qualified pharmacists and friendly staff dedicated to serving you with care and compassion.',
              },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-8 h-8 text-emerald-300" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-emerald-100/70">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 rounded-full text-emerald-700 text-sm font-medium mb-4">
              <MapPin className="w-4 h-4" />
              Get In Touch
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Visit Us Today
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              We're conveniently located and always ready to serve you
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Contact Cards */}
            <div className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                <MapPin className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Our Location</h3>
              <p className="text-gray-600 mb-4">{PHARMACY_INFO.address}</p>
              <a
                href={PHARMACY_INFO.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-emerald-600 font-medium hover:text-emerald-700"
              >
                Get Directions <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                <Clock className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Working Hours</h3>
              <div className="space-y-2 text-gray-600">
                <p><span className="font-medium">Mon - Sat:</span> {PHARMACY_INFO.hours.weekdays}</p>
                <p><span className="font-medium">Sunday:</span> {PHARMACY_INFO.hours.sunday}</p>
              </div>
              <p className="mt-4 text-sm text-emerald-600 font-medium">Open 7 days a week!</p>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                <Phone className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Contact Us</h3>
              <div className="space-y-3">
                <a href={`tel:${PHARMACY_INFO.phone}`} className="flex items-center gap-3 text-gray-600 hover:text-emerald-600">
                  <Phone className="w-5 h-5" />
                  {PHARMACY_INFO.phone}
                </a>
                <button onClick={openWhatsApp} className="flex items-center gap-3 text-gray-600 hover:text-emerald-600">
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp Us
                </button>
                <a href={`mailto:${PHARMACY_INFO.email}`} className="flex items-center gap-3 text-gray-600 hover:text-emerald-600">
                  <Mail className="w-5 h-5" />
                  {PHARMACY_INFO.email}
                </a>
              </div>
            </div>
          </div>

          {/* Map Embed */}
          <div className="mt-12 rounded-3xl overflow-hidden shadow-lg h-80 bg-gray-200">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3805.2511789561547!2d78.39367661487756!3d17.494736188014847!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bcb91f3f7d7d5a1%3A0x8c8b8b8b8b8b8b8b!2sKukatpally%2C%20Hyderabad%2C%20Telangana!5e0!3m2!1sen!2sin!4v1234567890"
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

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-emerald-500 to-teal-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Need Medicines? We're Just a Call Away!
          </h2>
          <p className="text-emerald-100 mb-8">
            Order via WhatsApp and get free home delivery on orders above ₹500
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={openWhatsApp}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-white text-emerald-700 font-semibold rounded-2xl shadow-2xl hover:shadow-white/25 transition-all hover:scale-105"
            >
              <MessageCircle className="w-5 h-5" />
              Order on WhatsApp
            </button>
            <a
              href={`tel:${PHARMACY_INFO.phone}`}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-emerald-700 text-white font-semibold rounded-2xl hover:bg-emerald-800 transition-all"
            >
              <Phone className="w-5 h-5" />
              {PHARMACY_INFO.phone}
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
                  <Pill className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{PHARMACY_INFO.name}</h3>
                  <p className="text-emerald-400 text-sm">{PHARMACY_INFO.tagline}</p>
                </div>
              </div>
              <p className="text-gray-400 mb-6 max-w-md">
                Your trusted neighbourhood pharmacy, serving the community with quality 
                medicines and healthcare products since {PHARMACY_INFO.established}.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-colors">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-colors">
                  <Instagram className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#home" className="hover:text-emerald-400 transition-colors">Home</a></li>
                <li><a href="#services" className="hover:text-emerald-400 transition-colors">Services</a></li>
                <li><a href="#about" className="hover:text-emerald-400 transition-colors">About Us</a></li>
                <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Contact</a></li>
                <li><Link href="/dashboard" className="hover:text-emerald-400 transition-colors">Staff Login</Link></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{PHARMACY_INFO.address}</span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-emerald-500" />
                  <a href={`tel:${PHARMACY_INFO.phone}`} className="hover:text-emerald-400">{PHARMACY_INFO.phone}</a>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-emerald-500" />
                  <a href={`mailto:${PHARMACY_INFO.email}`} className="hover:text-emerald-400">{PHARMACY_INFO.email}</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} {PHARMACY_INFO.name}. All rights reserved.
            </p>
            <p className="text-gray-500 text-sm">
              Made with ❤️ in Hyderabad
            </p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <button
        onClick={openWhatsApp}
        className="fixed bottom-6 right-6 w-16 h-16 bg-[#25D366] rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform z-50 group"
      >
        <MessageCircle className="w-8 h-8 text-white" />
        <span className="absolute right-full mr-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Chat with us!
        </span>
      </button>
    </div>
  );
}
