'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { SOCIAL_PROFILES } from '@/lib/socialLinks';
import { Geist, Geist_Mono } from 'next/font/google';
import Image from 'next/image';
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
import { useCountry } from '@/hooks/useCountry';
import { getAvgCustomerValue, getRevenueSymbol, getCountryConfig, inferCountryFromText } from '@/lib/countryConfig';
import { calculateSimulation } from '@/lib/simulator';
import { projectScore } from '@/lib/projection';
import { canonicalFixImpact } from '@/lib/fixIntelligence';

// Fix cards on the results view: the ONE canonical impact for the fix type
// (lib/fixIntelligence), labelled as an estimate. Unknown type → no number.
function fixEstimateLabel(fixType: string): string | null {
  const pts = canonicalFixImpact(fixType);
  return pts == null ? null : `Est. +${pts} pts`;
}
// Homepage EXAMPLE mockups: per-fix numbers are the same canonical impact the
// product shows for that fix type — never a separate hand-typed number.
function examplePts(fixType: string): number {
  return canonicalFixImpact(fixType) ?? 0;
}
import { revenueGapForScan, revenueGapForScanBreakdown, REVENUE_CONVERSION_RATE } from '@/lib/scoring';
import { businessNamesMatch } from '@/lib/dataQuality';
import { getBrowserClient } from '@/lib/supabase'
import HomepageScanVideo from '@/components/HomepageScanVideo';
import { isPersonalTier, isAdminUser, isBusinessPlan, normalizePlan } from '@/lib/planConfig';
import { usePlan } from '@/lib/usePlan';
import { topCategories } from '@/lib/topCategories';
import { SiteAnnouncement, SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { MARKETS_COVERED, PRICE_RANGE_USD, tierPrice } from '@/lib/publicStats';
import { intervalFromParams, INTENDED_INTERVAL_KEY } from '@/lib/pricingParams';
import LimitReachedModal, { type LimitReachedData } from '@/components/LimitReachedModal';
import { assessIdentityConfirm, shouldOverrideToPersonal } from '@/lib/identityConfirm';
import dynamic from 'next/dynamic';

// azxj: first homepage island — the waitlist modal lives in its own chunk
// (ssr:false) so it is NOT in the homepage's initial bundle; it downloads
// on first open. The rest of the page is still one client component (see
// the ticket comment: a full server-shell split is a separate refactor).
const HomepageWaitlistModal = dynamic(() => import('@/components/HomepageWaitlistModal'), { ssr: false });
const supabase = getBrowserClient();

const HOMEPAGE_SOCIAL_ICONS: Record<string, { vb: string; d: string }> = {
              LinkedIn: { vb: '0 0 448 512', d: 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z' },
              Facebook: { vb: '0 0 320 512', d: 'M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z' },
              Instagram: { vb: '0 0 448 512', d: 'M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-26.8-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z' },
              X: { vb: '0 0 512 512', d: 'M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z' },
              YouTube: { vb: '0 0 576 512', d: 'M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z' }
};

const BG = '#FFFFFF';
const BG_SOFT = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const AMBER = '#D97706';
const RED = '#DC2626';
const PURPLE = '#1B17FF';
const GRAY = '#55556A';
const LGRAY = '#94A3B8';

// The 12 platforms we actually scan, including Meta AI (via the Meta Model API).
const PLATFORMS = [
  'ChatGPT','Gemini','Google AI','Copilot','Perplexity','Grok',
  'Claude','DeepSeek','Mistral','Kimi','Groq','Meta AI'
];

// Server industry keys (lib/industry-config detectIndustry) → human-readable
// names used in the revenue explainer copy. Keeps every block describing the
// SAME industry the scan actually detected instead of re-guessing per block.
// Server industry keys (lib/industry-config detectIndustry) → human-readable
// names for the revenue explainer copy. Keys match INDUSTRY_CONFIG and
// AVG_VALUE_MULTIPLIERS one-for-one — no bridging/hyphen remapping needed.
const INDUSTRY_DISPLAY_NAMES: Record<string, string> = {
  dentist: 'Dental practices',
  doctor: 'Medical practices',
  specialist: 'Medical specialists',
  chiropractor: 'Chiropractic clinics',
  therapist: 'Therapy practices',
  physicaltherapy: 'Physiotherapy clinics',
  optometrist: 'Optometry practices',
  medspa: 'Med spas',
  pharmacy: 'Pharmacies',
  veterinarian: 'Veterinary clinics',
  lawyer: 'Law firms',
  plumber: 'Plumbing companies',
  hvac: 'HVAC companies',
  electrician: 'Electrical contractors',
  landscaping: 'Landscaping companies',
  cleaning: 'Cleaning services',
  roofing: 'Roofing companies',
  painting: 'Painting companies',
  moving: 'Moving companies',
  pestcontrol: 'Pest control services',
  locksmith: 'Locksmith services',
  autorepair: 'Auto repair shops',
  carwash: 'Car wash services',
  cardealership: 'Car dealerships',
  restaurant: 'Restaurants',
  bakery: 'Bakeries',
  catering: 'Catering companies',
  gym: 'Gyms and fitness centers',
  spa: 'Spas and wellness centers',
  hairsalon: 'Hair salons',
  nailsalon: 'Nail salons',
  tattoo: 'Tattoo studios',
  realestate: 'Real estate agencies',
  mortgage: 'Mortgage brokers',
  insurance: 'Insurance agencies',
  accountant: 'Accounting firms',
  financialadvisor: 'Financial advisors',
  hotel: 'Hotels and accommodations',
  travelagency: 'Travel agencies',
  tutor: 'Tutoring services',
  school: 'Schools and academies',
  childcare: 'Childcare services',
  photographer: 'Photography studios',
  weddingvenue: 'Wedding venues',
  entertainment: 'Entertainment venues',
  marketing: 'Marketing agencies',
  itservices: 'IT companies',
  consulting: 'Consulting firms',
  recruitment: 'Recruitment agencies',
  retail: 'Retail stores',
  florist: 'Florists',
  contractor: 'Construction companies',
  astrologer: 'Astrology services',
  concierge: 'Concierge services',
  mobile: 'Mobile services',
  general: 'Businesses',
};
const industryDisplayName = (key: string) => INDUSTRY_DISPLAY_NAMES[key] || 'Businesses';
// Industry keys now match AVG_VALUE_MULTIPLIERS exactly, so no key remapping.
const industryAvgValue = (key: string, countryCode: string) =>
  getAvgCustomerValue(key, countryCode);

const PLACEHOLDERS = [
  'best dentist in Chicago IL',
  'Dr. Sarah Johnson cardiologist',
  'best HVAC in Manchester UK',
  'Nike running shoes global brand',
  'best lawyer in Sydney Australia',
  'Dr. Priya Sharma dentist Mumbai',
  'best restaurant in Toronto Canada',
];

const CHIPS = [
  { icon: <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M186.1 52.1C169.3 39.1 148.7 32 127.5 32C74.7 32 32 74.7 32 127.5l0 6.2c0 15.8 3.7 31.3 10.7 45.5l23.5 47.1c4.5 8.9 7.6 18.4 9.4 28.2l36.7 205.8c2 11.2 11.6 19.4 22.9 19.8s21.4-7.4 24-18.4l28.9-121.3C192.2 323.7 207 312 224 312s31.8 11.7 35.8 28.3l28.9 121.3c2.6 11.1 12.7 18.8 24 18.4s20.9-8.6 22.9-19.8l36.7-205.8c1.8-9.8 4.9-19.3 9.4-28.2l23.5-47.1c7.1-14.1 10.7-29.7 10.7-45.5l0-2.1c0-55-44.6-99.6-99.6-99.6c-24.1 0-47.4 8.8-65.6 24.6l-3.2 2.8 19.5 15.2c7 5.4 8.2 15.5 2.8 22.5s-15.5 8.2-22.5 2.8l-24.4-19-37-28.8z"/></svg>, label: 'Best dentist Chicago',       value: 'Best dentist in Chicago' },
  { icon: <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>, label: 'Best HVAC Dallas',            value: 'Best HVAC company in Dallas' },
  { icon: <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M169.7 .9c-22.8-1.6-41.9 14-47.5 34.7L110.4 80c.5 0 1.1 0 1.6 0c176.7 0 320 143.3 320 320c0 .5 0 1.1 0 1.6l44.4-11.8c20.8-5.5 36.3-24.7 34.7-47.5C498.5 159.5 352.5 13.5 169.7 .9zM399.8 410.2c.1-3.4 .2-6.8 .2-10.2c0-159.1-128.9-288-288-288c-3.4 0-6.8 .1-10.2 .2L.5 491.9c-1.5 5.5 .1 11.4 4.1 15.4s9.9 5.6 15.4 4.1L399.8 410.2zM176 208a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm64 128a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM96 384a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, label: 'Best restaurant NYC',         value: 'Best restaurant in New York' },
  { icon: <svg viewBox="0 0 640 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>, label: 'Top lawyer Miami',            value: 'Personal injury lawyer Miami' },
  { icon: <svg viewBox="0 0 640 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M192 48c0-26.5 21.5-48 48-48L400 0c26.5 0 48 21.5 48 48l0 464-80 0 0-80c0-26.5-21.5-48-48-48s-48 21.5-48 48l0 80-80 0 0-464zM48 96l112 0 0 416L48 512c-26.5 0-48-21.5-48-48L0 320l80 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L0 288l0-64 80 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L0 192l0-48c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 48-80 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l80 0 0 64-80 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l80 0 0 144c0 26.5-21.5 48-48 48l-112 0 0-416 112 0zM312 64c-8.8 0-16 7.2-16 16l0 24-24 0c-8.8 0-16 7.2-16 16l0 16c0 8.8 7.2 16 16 16l24 0 0 24c0 8.8 7.2 16 16 16l16 0c8.8 0 16-7.2 16-16l0-24 24 0c8.8 0 16-7.2 16-16l0-16c0-8.8-7.2-16-16-16l-24 0 0-24c0-8.8-7.2-16-16-16l-16 0z"/></svg>, label: 'Best med spa LA',              value: 'Best med spa in Los Angeles' },
  { icon: <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z"/></svg>, label: 'Best consultant NYC',          value: 'Best business consultant in New York' },
  { icon: <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M50.7 58.5L0 160l208 0 0-128L93.7 32C75.5 32 58.9 42.3 50.7 58.5zM240 160l208 0L397.3 58.5C389.1 42.3 372.5 32 354.3 32L240 32l0 128zm208 32L0 192 0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-224z"/></svg>, label: 'Best CRM software',           value: 'Best CRM software for startups' },
  { icon: <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64l0 48-128 0 0-48zm-48 48l-64 0c-26.5 0-48 21.5-48 48L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-208c0-26.5-21.5-48-48-48l-64 0 0-48C336 50.1 285.9 0 224 0S112 50.1 112 112l0 48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z"/></svg>, label: 'Nike vs Adidas',             value: 'Nike running shoes vs Adidas' },
  { icon: <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm112-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM80 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM272 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z"/></svg>, label: 'Top marketing agency',        value: 'Top marketing agency in New York' },
  { icon: <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z"/></svg>, label: 'Heartland Dental',           value: 'Heartland Dental AI visibility' },
  { icon: <svg viewBox="0 0 640 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M480 48c0-26.5-21.5-48-48-48L336 0c-26.5 0-48 21.5-48 48l0 48-64 0 0-72c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 72-64 0 0-72c0-13.3-10.7-24-24-24S64 10.7 64 24l0 72L48 96C21.5 96 0 117.5 0 144l0 96L0 464c0 26.5 21.5 48 48 48l256 0 32 0 96 0 160 0c26.5 0 48-21.5 48-48l0-224c0-26.5-21.5-48-48-48l-112 0 0-144zm96 320l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16zM240 416l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16zM128 400c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32zM560 256c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0zM256 176l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16zM112 160c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0zM256 304c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32zM112 320l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16zm304-48l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16zM400 64c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0zm16 112l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16z"/></svg>, label: 'Best biz in Chicago',        value: 'Best businesses in Chicago' },
  { icon: <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>, label: "McDonald's visibility",       value: "McDonald's AI visibility" },
];

interface ScanResult {
  platform: string;
  weight: number;
  status: string;
  response: string | null;
  error: string | null;
  mentionRate?: number;
}

interface Business {
  name: string;
  platforms: string[];
  mentions: number;
  location: string | null;
  note: string | null;
}

function FadeInOnScroll({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Count-up: animates 0 → value with ease-out cubic over `duration` ms via
// requestAnimationFrame. Animates on mount (i.e. when the card first renders on
// step 2) and restarts if the target value changes. `format` toLocaleStrings it.
function CountUp({ value, duration = 1500, format = false }: { value: number; duration?: number; format?: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) { setDisplay(0); return; }
    let raf = 0;
    const start = Date.now();
    const target = value;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format ? display.toLocaleString() : display}</>;
}

const DASH_TABS = ['Overview','Intelligence','Fix My Score','Tools','Grow','Agency'];
const DASH_CAPTIONS = ['',
  'Where AI mentions you — and where competitors beat you.',
  'Do the highest-impact fixes first. Every fix shows predicted points.',
  'Every tool that moves your Discovery Score, in one place.',
  'Turn visibility into customers: reviews, spend, and momentum.',
  'Track every client\'s AI visibility from one dashboard.',
];

// "Why not just ask ChatGPT yourself?" — each Rankall claim maps to a shipped
// feature: 12-platform scan, city-context queries, competitor list, score
// history, fix queue, verification rescan.
const ASK_YOURSELF_ROWS: [string, string, string][] = [
  ['Platforms', 'One assistant at a time', 'ChatGPT, Gemini, Perplexity + 8 more in one scan'],
  ['Consistency', 'The answer changes every time you ask', 'The same questions, scored the same way, every time'],
  ['Your bias', 'Shaped by your own chats and location', 'Neutral questions, asked as a customer in your city'],
  ['Competitors', 'No idea who gets recommended instead', 'See exactly which competitors AI names over you'],
  ['History', 'Nothing saved, no trend', 'Score history so you can see what changed'],
  ['What to do', 'No action plan', 'Ready-made fixes, most important first'],
  ['Proof', "Can't tell if a fix worked", 'Automatic re-check after each fix'],
];

export default function HomePage() {
  const country = useCountry();
  const placeholders = [...country.exampleQueries.map(q => `${q}...`), ...PLACEHOLDERS];
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(0);
  const [platIdx, setPlatIdx] = useState(0);
  const [active, setActive] = useState<number[]>([]);
  const [phIdx, setPhIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanIntent, setScanIntent] = useState<string | null>(null);
  const [scanCountry, setScanCountry] = useState<string | null>(null); // country resolved from scan input
  const [queries, setQueries] = useState<string[]>([]);
  const [competitor, setCompetitor] = useState<string | null>(null);
  const [mentionedCount, setMentionedCount] = useState(0);
  const [realScore, setRealScore] = useState(0); // real AI visibility score from the scan (overallScore)
  const [detectedIndustry, setDetectedIndustry] = useState<string>('general'); // server-detected industry — single source for every revenue block
  const [scanMeta, setScanMeta] = useState<{ partial: boolean; platformsCompleted: number; failedPlatforms: string[]; scanReliable: boolean; mentionedOpportunities: number; totalOpportunities: number; cached: boolean; cachedAt?: string } | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [extractingBiz, setExtractingBiz] = useState(false);
  const [open, setOpen] = useState(false);

  // Business capture (unified — no yes/no step)
  const [bizName, setBizName] = useState('');
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const [upgradeInterval, setUpgradeInterval] = useState<'monthly' | 'annual'>('monthly');
  const [bizSubmitted, setBizSubmitted] = useState(false);
  const [userBizMatch, setUserBizMatch] = useState<Business | null>(null);
  // ax7w: the business name the scan itself measured (business-name scans
  // only). For a CATEGORY search, mentionedCount counts responses that
  // mention the category PHRASE, not any business — so it is never used as
  // the submitted business's own number.
  const [scannedBizName, setScannedBizName] = useState<string | null>(null);
  const [enrichingBiz, setEnrichingBiz] = useState(false);
  const [enrichedGoogle, setEnrichedGoogle] = useState<null | {
    reviewCount: number | null; rating: number | null; operational: boolean;
    address: string | null; phone: string | null; hours: string | null;
    photos: number | null; category: string | null;
  }>(null);
  const [enrichBizError, setEnrichBizError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Plan gating — SAME source of truth as the report page (usePlan + isBusinessPlan
  // + isAdminUser), plus a hardcoded admin-user-id fallback so an admin is never
  // shown the upgrade gate even if the email lookup is slow/missing.
  // Referral capture on the homepage: persist ?ref= for 30 days and log the click.
  // Client-only (window) to avoid a useSearchParams Suspense boundary.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (!ref) return;
    const code = ref.toUpperCase();
    document.cookie = `rankall_ref=${encodeURIComponent(code)};max-age=2592000;path=/`;
    fetch(`/api/referral/click?ref=${encodeURIComponent(code)}`, { method: 'GET', redirect: 'manual' }).catch(() => {});
  }, []);

  // Keep the plan a user picked at signup alive after onboarding: ?show_upgrade=
  // renders a sticky banner prompting them to complete checkout for that plan.
  useEffect(() => {
    try {
      const up = new URLSearchParams(window.location.search).get('show_upgrade');
      if (up) setUpgradePlan(up);
      // Round 2: carry the billing interval chosen before signup.
      setUpgradeInterval(intervalFromParams(window.location.search, localStorage.getItem(INTENDED_INTERVAL_KEY)));
    } catch { /* no-op */ }
  }, []);

  // Honour ?intent=personal_pro (the /personal landing page's deep-link) by
  // switching the hero into Professional / Personal Brand mode.
  useEffect(() => {
    try {
      const intent = new URLSearchParams(window.location.search).get('intent');
      if (intent === 'personal_pro' || intent === 'personal') setPersonalMode(true);
    } catch { /* no-op */ }
  }, []);

  const { plan: userPlan, userEmail, loading: authLoading } = usePlan();
  // UI-only flag; the single admin allowlist is lib/planConfig isAdminUser.
  const isAdmin = isAdminUser(userEmail);
  const isPaid = isAdmin || isBusinessPlan(userPlan);
  // Sticky bar
  const [industryTab, setIndustryTab] = useState(0);
  // Dashboard tour — tabs auto-rotate every 4s, pause on hover/focus
  const [dashTab, setDashTab] = useState(0);
  const [dashPaused, setDashPaused] = useState(false);
  useEffect(() => {
    if (dashPaused) return;
    const t = setInterval(() => setDashTab((v) => (v + 1) % DASH_TABS.length), 4000);
    return () => clearInterval(t);
  }, [dashPaused, dashTab]);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showContentGate, setShowContentGate] = useState(false);
  const [fix1Content, setFix1Content] = useState<string | null>(null);
  const [fix1Loading, setFix1Loading] = useState(false);
  const [fix1Copied, setFix1Copied] = useState(false);
  const [fix1Tab, setFix1Tab] = useState<'HTML Site' | 'WordPress' | 'Webflow / Squarespace' | 'Shopify' | 'Wix'>('HTML Site');
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPersonalization, setScanPersonalization] = useState<{ placeholder: string; helperText: string } | null>(null);
  const [personalPhIdx, setPersonalPhIdx] = useState(0);
  // "Professional" (Personal Brand) hero mode — set by the hero toggle or the
  // ?intent=personal_pro deep-link from the /personal landing page. Drives the
  // hero copy AND forces the name-scan path in startScan.
  const [personalMode, setPersonalMode] = useState(false);
  // Ticket 7: homepage identity-confirm — pending personal identity awaiting
  // the user's "Is this you?" confirmation. Null = no confirm step showing.
  // The scan-personal call only fires after confirmation (runConfirmedPersonalScan).
  const [personalConfirm, setPersonalConfirm] = useState<{ name: string; specialty: string; location: string } | null>(null);
  const [confirmLinkedinUrl, setConfirmLinkedinUrl] = useState('');
  const [confirmLinkedin, setConfirmLinkedin] = useState<{ found: boolean; profile_url: string | null; headline: string } | null>(null);
  const [confirmLinkedinLoading, setConfirmLinkedinLoading] = useState(false);
  const [confirmScanAnyway, setConfirmScanAnyway] = useState(false);
  // Ticket 7: routing notice — shown when the Places tiebreaker routes a
  // Professional-mode input to a Local Business scan instead of a person scan.
  const [routingNotice, setRoutingNotice] = useState<string | null>(null);
  // ax75: real verified-outcome aggregates for the VERIFY section —
  // fetched from /api/outcomes/stats (verified_outcomes table), replacing
  // the hardcoded 'Dental practice · Chicago' rows that were never it.
  const [outcomeStats, setOutcomeStats] = useState<{ total_verifications: number; avg_improvement: number } | null>(null);
  useEffect(() => {
    fetch('/api/outcomes/stats').then(r => r.json()).then(d => {
      if (typeof d?.total_verifications === 'number') setOutcomeStats({ total_verifications: d.total_verifications, avg_improvement: d.avg_improvement ?? 0 });
    }).catch(() => { /* section falls back to the honest empty state */ });
  }, []);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistIntent, setWaitlistIntent] = useState<string>('');
  const [waitlistEntityName, setWaitlistEntityName] = useState<string>('');
  const [limitModal, setLimitModal] = useState<LimitReachedData | null>(null);

  // Personalize search bar based on account type
  useEffect(() => {
    const personalProPlaceholders = [
      'Dr. Jane Smith cardiologist Chicago',
      'Search your name to see if AI recommends you',
    ];
    const t = setInterval(() => setPersonalPhIdx(i => (i + 1) % personalProPlaceholders.length), 4000);
    (async () => {
      try {
        const countryMatch = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
        const _country = countryMatch ? countryMatch.split('=')[1] : null;
        const { data } = await getBrowserClient().auth.getSession();
        const accountType = data.session?.user?.user_metadata?.account_type;
        if (isPersonalTier(accountType)) {
          setScanPersonalization({ placeholder: personalProPlaceholders[0], helperText: 'Search your name to see if AI recommends you' });
        }
      } catch { /* non-fatal */ }
    })();
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill and auto-scan from ?q= URL param (used by SEO landing pages)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q && q.trim()) {
      setQuery(q.trim());
      // Small delay so state settles before scan fires
      const t = setTimeout(() => {
        setStep(1);
        setProg(0);
        setScanError(null);
        setRoutingNotice(null);
        setActive([]);
        setScanResults([]);
        setBusinesses([]);
        setBizName('');
        setBizSubmitted(false);
        setUserBizMatch(null);
        setScannedBizName(null);
        setEnrichedGoogle(null);
        setEnrichBizError(null);
        setCompetitor(null); // clear stale competitor from previous scan

        const progInterval = setInterval(() => setProg(p => Math.min(p + 2, 90)), 400);
        const platInterval = setInterval(() => {
          setPlatIdx(i => (i + 1) % PLATFORMS.length);
          setActive(prev => [...prev, Math.floor(Math.random() * 10)].slice(-3));
        }, 600);

        const abort = new AbortController();
        // Above the server's 60s maxDuration so the server's (partial) response
        // always arrives first — the server now returns whatever platforms
        // responded rather than erroring, so this is a true last resort.
        const hardTimeout = setTimeout(() => {
          abort.abort();
          clearInterval(progInterval);
          clearInterval(platInterval);
          setScanError('Scan is taking longer than expected. Please try again.');
          setStep(0);
        }, 75000);

        const cleanup = () => { clearInterval(progInterval); clearInterval(platInterval); clearTimeout(hardTimeout); };

        fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: q.trim() }),
          signal: abort.signal,
        })
          .then(r => r.json())
          .then(data => {
            cleanup();
            setProg(100);
            console.log('[auto-scan] API response:', { success: data.success, resultCount: data.results?.length, queries: data.queries, scanId: data.scanId });
            if (data.error === 'business_not_found') {
              setScanError(`We couldn't find "${q.trim()}". Check the spelling, or try a category like "best clinic in Chicago".`);
              setStep(0);
              return;
            }
            // b0fe: the auto-scan path had no generic error branch — a
            // non-business_not_found failure (e.g. platforms_unavailable)
            // left the user on the loading view with no error and no results.
            if (data.error) {
              setScanError(data.message || data.error);
              setStep(0);
              return;
            }
            if (data.success && data.results) {
              const good = data.results.filter((r: ScanResult) => r.status === 'success' && r.response);
              setScanResults(good);
              setQueries(data.queries || [q.trim()]);
              setScanId(data.scanId || null);
              // ax8b: claim this scan for this browser session, so the
              // report page can tell the scanner apart from a stranger
              // with only the URL (see the gate in app/report/[id]).
              try { if (data.scanId) sessionStorage.setItem(`rankall:scan-claim:${data.scanId}`, '1'); } catch { /* storage unavailable */ }
              setScanIntent(typeof data.intent === 'string' ? data.intent : (data.intent?.type ?? null));
              setCompetitor(data.competitor || null);
              setMentionedCount(data.mentionedCount || 0);
              setRealScore(Math.round(Number(data.overallScore) || 0));
              setDetectedIndustry(data.industry || 'general');
              setScanMeta({
                partial: data.partial === true,
                platformsCompleted: data.platformsCompleted ?? 0,
                failedPlatforms: Array.isArray(data.failedPlatforms) ? data.failedPlatforms : [],
                scanReliable: data.scanReliable !== false,
                mentionedOpportunities: data.mentionedOpportunities ?? 0,
                totalOpportunities: data.totalOpportunities ?? 0,
                cached: data.cached === true,
                cachedAt: data.cachedAt || undefined,
              });
              setScanCountry(data.country_code || inferCountryFromText('', q.trim()) || null);
              setTimeout(() => setStep(2), 800);
              runExtractBusinesses(q.trim(), data.results, data.competitor || null, true);
            } else {
              console.error('[auto-scan] Unexpected response shape:', data);
              setScanError('Scan returned no results. Please try again.');
              setStep(0);
            }
          })
          .catch(err => {
            if (err.name !== 'AbortError') {
              cleanup();
              console.error('[auto-scan] Fetch error:', err);
              setScanError('Scan failed. Please try again.');
              setStep(0);
            }
          });
      }, 100);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % placeholders.length), 2500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = chipRowRef.current;
    if (!el) return;
    let rafId: number;
    let paused = false;
    const scroll = () => {
      if (!paused && el) {
        el.scrollLeft += 0.6;
        if (el.scrollLeft >= el.scrollWidth / 2) el.scrollLeft = 0;
      }
      rafId = requestAnimationFrame(scroll);
    };
    rafId = requestAnimationFrame(scroll);
    el.addEventListener('mouseenter', () => { paused = true; });
    el.addEventListener('mouseleave', () => { paused = false; });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Tell the global Ask Alina pill to float above the sticky bar
  // while the bar is visible (otherwise the pill covers its button).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('has-sticky-bar', stickyVisible && !stickyDismissed);
    return () => { document.body.classList.remove('has-sticky-bar'); };
  }, [stickyVisible, stickyDismissed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('sticky_dismissed')) { setStickyDismissed(true); return; }
    const timer = setTimeout(() => setStickyVisible(true), 30000);
    const onScroll = () => {
      if (document.body.scrollHeight > 0 && window.scrollY / document.body.scrollHeight > 0.5) setStickyVisible(true);
    };
    window.addEventListener('scroll', onScroll);
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll); };
  }, []);

  // b88b: lift the Ask Alina pill/panel above the sticky bar while the bar
  // is visible. The pill is fixed bottom:24 — inside the bar's 56px zone —
  // so without this the pill covers the bar's "Scan free" button.
  // Chatbot.tsx reads this class (body.has-sticky-bar .chatbot-pill /
  // .chatbot-panel). Cleanup removes it when the bar hides or unmounts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.body.classList.toggle('has-sticky-bar', stickyVisible && !stickyDismissed);
    return () => { document.body.classList.remove('has-sticky-bar'); };
  }, [stickyVisible, stickyDismissed]);

  // When a scan fails, failures reset to step 0 and the error banner sits
  // under the hero form — which may be off-screen after a Rescan from the
  // results view. Bring the form (and its error) back into view so the
  // failure is visible instead of a silent reset to the plain homepage.
  // The query input is preserved, so retry is one click.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (scanError) {
      document.getElementById('scan')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [scanError]);


  useEffect(() => {
    // getUser() validates with the server — prevents stale cached session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function saveUserBusinessName(name: string) {
    if (!scanId || !name.trim()) return;
    try {
      await fetch('/api/update-business-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, businessName: name.trim() }),
      });
    } catch {}
  }

  function runExtractBusinesses(q: string, allResults: ScanResult[], fallbackCompetitor: string | null, autoSelectTop = false, searchedBusiness?: string) {
    setExtractingBiz(true);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20000); // 20s timeout
    fetch('/api/extract-businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, results: allResults }),
      signal: abort.signal,
    })
      .then(r => r.json())
      .then(biz => {
        if (biz.success && biz.businesses?.length > 0) {
          setBusinesses(biz.businesses);
          if (autoSelectTop) {
            if (searchedBusiness) {
              // Business-name scan: only select the searched business itself,
              // never a competitor. Uses normalized matching to handle entity
              // suffixes (LLP, LLC) and trailing city tokens.
              const ownMatch = biz.businesses.find((b: Business) =>
                businessNamesMatch(searchedBusiness, b.name),
              );
              setUserBizMatch(prev => prev ?? ownMatch ?? null);
            } else {
              // Category search: pre-select the most-mentioned business so the
              // score card shows a real business's coverage immediately.
              const topBusiness = biz.businesses.reduce(
                (a: Business, b: Business) => (b.mentions > a.mentions ? b : a),
                biz.businesses[0],
              );
              setUserBizMatch(prev => prev ?? topBusiness);
            }
          }
        } else if (fallbackCompetitor) {
          // Fallback: build minimal list from scan API competitor data
          setBusinesses([{ name: fallbackCompetitor, platforms: [], mentions: 1, location: null, note: 'Top AI recommendation' }]);
        }
      })
      .catch(err => {
        console.error('[extract-businesses] error:', err?.name === 'AbortError' ? 'timed out after 20s' : err);
        if (fallbackCompetitor) {
          setBusinesses([{ name: fallbackCompetitor, platforms: [], mentions: 1, location: null, note: 'Top AI recommendation' }]);
        }
      })
      .finally(() => { clearTimeout(timer); setExtractingBiz(false); });
  }

  async function handleBizSubmit() {
    if (!bizName.trim()) return;
    setEnrichingBiz(true);
    setEnrichBizError(null);
    const lower = bizName.trim().toLowerCase();
    // Check extracted businesses list first
    // ax87: whole-word name match — substring includes() matched
    // "Grace Dental" for a submitted "Ace Dental".
    const match = businesses.find(b => businessNamesMatch(b.name, bizName.trim()));
    // ax7w: the submitted business's own extracted result, or nothing — the
    // category flow pre-selects the TOP business, which must not be
    // presented as the submitted business when it isn't in the list.
    setUserBizMatch(match ?? null);
    // Always pull Google data too
    try {
      const locationGuess = query.replace(/^.*\bin\b\s*/i, '').trim();
      const res = await fetch('/api/enrich-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: bizName.trim(), location: locationGuess }),
      });
      const data = await res.json();
      if (data.success && data.google) setEnrichedGoogle(data.google);
    } catch { /* non-fatal — show platform score even if Google fails */ }
    setBizSubmitted(true);
    saveUserBusinessName(bizName.trim());
    setEnrichingBiz(false);
  }

  function dismissSticky() {
    setStickyDismissed(true);
    if (typeof window !== 'undefined') localStorage.setItem('sticky_dismissed', '1');
  }

  async function startScan(optsOrEvent?: { forceRescan?: boolean } | React.MouseEvent) {
    const opts = optsOrEvent && 'forceRescan' in optsOrEvent ? optsOrEvent : undefined;
    if (!query.trim() || isScanning) return;

    // Reject obviously invalid inputs — e.g. UI text (an upgrade banner / pricing
    // string) accidentally selected and pasted into the search bar.
    const cleanInput = query.trim();
    if (cleanInput.length > 150) {
      setScanError('Please enter a business name or search query (max 150 characters).');
      return;
    }
    if (cleanInput.includes('$39') || cleanInput.includes('Upgrade to') || cleanInput.includes('resets on') || cleanInput.includes('/mo')) {
      setScanError('Please enter a business name or location to scan.');
      return;
    }

    // Reject obvious gibberish / keyboard-mash. Conservative — only fires when
    // EVERY token of a short (<=2 word) query looks non-word-like, so real names
    // (which are usually multi-word, or single words with normal structure like
    // "Nordstrom"/"HVAC") pass through. The server's business_not_found check is
    // the real backstop for anything that slips past.
    const gibTokens = cleanInput.toLowerCase().split(/\s+/).filter(Boolean);
    const tokenLooksGibberish = (w: string) =>
      /[^aeiou]{6,}/.test(w) ||                 // 6+ consecutive consonants (qwrtpq)
      (w.length >= 5 && !/[aeiou]/.test(w)) ||  // 5+ chars with no vowel at all
      (w.length >= 6 && /(.{2,4})\1/.test(w));  // repeated pattern (adadasd, asdfasdf)
    if (gibTokens.length > 0 && gibTokens.length <= 2 && gibTokens.every(tokenLooksGibberish)) {
      setScanError('Please enter a valid business name or location.');
      return;
    }

    setIsScanning(true);
    setScanError(null);
    // Ticket 7: a fresh scan starts clean — any pending identity-confirm
    // panel or routing notice belongs to the previous scan.
    setPersonalConfirm(null);
    setRoutingNotice(null);
    // Reset the assigned business up front — before intent detection or any API
    // call — so a previous scan's selection can never leak into this scan's
    // auto-select (the `prev ?? topBusiness` guard would otherwise keep it).
    setUserBizMatch(null);
    setScannedBizName(null);

    // Step 1: Classify intent — decides which API and UI flow to use
    let detectedIntent = 'LOCAL_PRO';
    let detectedPersonName: string | null = null;
    let detectedSpecialty: string | null = null;
    let detectedLocation: string | null = null;
    let resolvedCategory: string | null = null;
    let categoryConfidence: string | null = null;
    let customerQuery = query.trim();
    let isBusinessNameInput = false;
    // Ticket 7: true when detect-query's Places tiebreaker positively
    // identified a business listing (a firm, not a person).
    let tiebreakerBusiness = false;
    // detect-query gates every scan, so cap it hard: if it's slow or fails,
    // fall through to the standard LOCAL_PRO scan rather than hanging the button.
    const dqAbort = new AbortController();
    const dqTimer = setTimeout(() => dqAbort.abort(), 8000);
    try {
      const dqRes = await fetch('/api/detect-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query.trim() }),
        signal: dqAbort.signal,
      });
      if (dqRes.ok) {
        const dq = await dqRes.json();
        detectedIntent = dq.intent || 'LOCAL_PRO';
        detectedPersonName = dq.entity_name || null;
        detectedSpecialty = dq.category || null;
        detectedLocation = dq.location_text || null;
        resolvedCategory = dq.resolved_category || null;
        categoryConfidence = dq.category_confidence || null;
        customerQuery = dq.customerQuery || query.trim();
        isBusinessNameInput = dq.isBusinessName || false;
        tiebreakerBusiness = dq.places_tiebreaker_business === true;
      }
    } catch { /* non-fatal — fall through to LOCAL_PRO */ } finally {
      clearTimeout(dqTimer);
    }

    // Deterministic override: if any token looks like gibberish (e.g. "ZDHSF"),
    // force a business-name scan so the server's not-found gates can evaluate the
    // real (unknown) name — Haiku often mislabels "<gibberish> <category>" as a
    // category, which would bypass the not-found check entirely.
    const hasGibberishToken = gibTokens.some(tokenLooksGibberish);
    if (hasGibberishToken && !isBusinessNameInput) {
      isBusinessNameInput = true;
    }

    // Professional mode runs the name scan — UNLESS the Places tiebreaker
    // positively identified a business. A firm like "Power Rogers Chicago"
    // must route to Local Pro, never be scored as a person. Without a
    // tiebreaker signal, "Scan My Name" still fires the personal path, so a
    // slow/failed detect-query never breaks that promise.
    if (shouldOverrideToPersonal({ personalMode, detectedIntent, placesTiebreakerBusiness: tiebreakerBusiness })) {
      detectedIntent = 'PERSONAL_PRO';
      if (!detectedPersonName) detectedPersonName = query.trim();
    } else if (personalMode && tiebreakerBusiness) {
      // Firm, not a person — route to Local Pro and say so plainly.
      setRoutingNotice(`"${query.trim()}" looks like a business (it has a Google Business listing), so we're running a Local Business scan instead of a personal scan.`);
    }

    // Route waitlist intents to a modal — do not scan
    if (detectedIntent === 'PRODUCT_PRO' || detectedIntent === 'GLOBAL_BRAND' || detectedIntent === 'GOVERNMENT') {
      setIsScanning(false);
      setWaitlistIntent(detectedIntent);
      setWaitlistEntityName(detectedPersonName || query.trim());
      // azxj: email/submitted state now lives in the island and resets on
      // unmount (the island unmounts when the modal closes), so no reset
      // calls are needed here.
      setShowWaitlistModal(true);
      return;
    }

    // Route personal pro to the identity-confirm step — the scan-personal
    // call itself only fires after the user confirms (runConfirmedPersonalScan).
    // Ticket 7: never silently score an unconfirmed name from the homepage.
    if (detectedIntent === 'PERSONAL_PRO' && detectedPersonName) {
      setPersonalConfirm({
        name: detectedPersonName,
        specialty: detectedSpecialty || '',
        location: detectedLocation || '',
      });
      setConfirmLinkedinUrl('');
      setConfirmLinkedin(null);
      setConfirmScanAnyway(false);
      setIsScanning(false);
      // The scan may have started from the bottom form — bring the confirm
      // panel into view.
      document.getElementById('scan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // LOCAL_PRO / UNKNOWN — standard scan flow
    setStep(1);
    setProg(0);
    setActive([]);
    setScanResults([]);
    setBusinesses([]);
    setBizName('');
    setBizSubmitted(false);
    setUserBizMatch(null);
    setEnrichedGoogle(null);
    setEnrichBizError(null);
    setCompetitor(null); // clear stale competitor from previous scan

    const progInterval = setInterval(() => setProg(p => Math.min(p + 2, 90)), 400);
    const platInterval = setInterval(() => {
      setPlatIdx(i => (i + 1) % PLATFORMS.length);
      setActive(prev => [...prev, Math.floor(Math.random() * 10)].slice(-3));
    }, 600);

    const abort = new AbortController();
    const hardTimeout = setTimeout(() => {
      abort.abort();
      clearInterval(progInterval);
      clearInterval(platInterval);
      setScanError('Scan is taking longer than expected. Please try again.');
      setStep(0);
    }, 75000);

    const cleanup = () => { clearInterval(progInterval); clearInterval(platInterval); clearTimeout(hardTimeout); };

    try {
      const scanBody = {
        input: isBusinessNameInput ? query.trim() : customerQuery,
        isBusinessName: isBusinessNameInput,
        ...(isBusinessNameInput ? { detectedCategory: detectedSpecialty, detectedCity: detectedLocation } : {}),
        ...(resolvedCategory ? { resolved_category: resolvedCategory, category_confidence: categoryConfidence } : {}),
        ...(detectedIntent ? { detectedIntent } : {}),
        ...(userId ? { userId } : {}),
        ...(opts?.forceRescan ? { forceRescan: true } : {}),
      };
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanBody),
        signal: abort.signal,
      });
      const data = await res.json();

      cleanup();
      setProg(100);

      if (!isAdmin && !res.ok && data.error === 'scan_limit_reached') {
        setLimitModal({
          message: data.message,
          current: data.current,
          limit: data.limit,
          remaining: data.remaining,
          resetDate: data.resetDate,
          feature: 'scans',
        });
        setStep(0);
        setIsScanning(false);
        return;
      }

      if (data.error === 'business_not_found') {
        setScanError(`We couldn't find "${query.trim()}". Check the spelling, or try a category like "best clinic in Chicago".`);
        setStep(0);
        setIsScanning(false);
        return;
      }

      if (!res.ok && data.error) {
        // b0fe: prefer the human message (e.g. platforms_unavailable) —
        // showing the raw error code ('platforms_unavailable') is not
        // something a user can act on.
        setScanError(data.message || data.error);
        setStep(0);
        setIsScanning(false);
        return;
      }

      if (data.success && data.results) {
        const good = data.results.filter((r: ScanResult) => r.status === 'success' && r.response);
        setScanResults(good);
        setQueries(data.queries || [customerQuery]);
        setScanId(data.scanId || null);
        // ax8b: claim this scan for this browser session (see app/report/[id]).
        try { if (data.scanId) sessionStorage.setItem(`rankall:scan-claim:${data.scanId}`, '1'); } catch { /* storage unavailable */ }
        setScanIntent(typeof data.intent === 'string' ? data.intent : (data.intent?.type ?? null));
        setCompetitor(data.competitor || null);
        setMentionedCount(data.mentionedCount || 0);
        setRealScore(Math.round(Number(data.overallScore) || 0));
        setDetectedIndustry(data.industry || 'general');
        setScanMeta({
          partial: data.partial === true,
          platformsCompleted: data.platformsCompleted ?? 0,
          failedPlatforms: Array.isArray(data.failedPlatforms) ? data.failedPlatforms : [],
          scanReliable: data.scanReliable !== false,
          mentionedOpportunities: data.mentionedOpportunities ?? 0,
          totalOpportunities: data.totalOpportunities ?? 0,
          cached: data.cached === true,
          cachedAt: data.cachedAt || undefined,
        });
        // Use the scan's resolved country_code for revenue figures (not the viewer's geo)
        setScanCountry(data.country_code || inferCountryFromText('', customerQuery) || null);
        setTimeout(() => setStep(2), 800);
        setScannedBizName(isBusinessNameInput ? query.trim() : null);
        runExtractBusinesses(customerQuery, data.results, data.competitor || null, true, isBusinessNameInput ? query.trim() : undefined);
        setIsScanning(false);
      } else {
        setScanError('Scan returned no results. Please try again.');
        setStep(0);
        setIsScanning(false);
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        cleanup();
        setScanError('Scan failed. Please try again.');
        setStep(0);
      }
      setIsScanning(false);
    }
  }

  const totalOpp = queries.length * PLATFORMS.length;
  // Real competitor presence: how many of the platforms that actually responded
  // name the competitor. Previously this was a flat 85% of totalOpp, so every
  // scan rendered an identical "47 of 55" regardless of the real result.
  // ax7w: denominators are the full 12-platform set, not the responded
  // count — the same scan previously showed "2 of 8" here and "2 of 11"
  // on the report. Non-responders are explained by the failed-platforms
  // note below, not by shrinking the denominator.
  // ax7w: no Math.max(1, ...) floor — a 0-mention competitor reads 0.
  const competitorMentions = competitor
    ? scanResults.filter(r => r.response && r.response.toLowerCase().includes(competitor.toLowerCase())).length
    : 0;

  const inp = {
    width: '100%', background: W, border: `1.5px solid ${BORDER}`,
    borderRadius: 12, padding: '16px 16px', fontSize: 16, color: NAVY,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  };


  /* ===== V2 design data (from V2-Light mockup) ===== */
  function css(s: string): React.CSSProperties {
    const out: Record<string, string> = {};
    for (const chunk of s.split(';')) {
      const idx = chunk.indexOf(':');
      if (idx < 0) continue;
      let k = chunk.slice(0, idx).trim();
      const v = chunk.slice(idx + 1).trim();
      if (!k || !v) continue;
      k = k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      out[k] = v;
    }
    return out as React.CSSProperties;
  }

  const [v2Faq, setV2Faq] = useState(0);
  const [v2More, setV2More] = useState(false);
  const [v2MobileOpen, setV2MobileOpen] = useState(false);
  const [v2VideoOpen, setV2VideoOpen] = useState(false);

  const V2_P: [string, string, string][] = [
    ['ChatGPT','/platforms/chatgpt.png','#10A37F'],['Gemini','/platforms/gemini.png','#4F7BF7'],['Perplexity','/platforms/perplexity.png','#1FA3A3'],['Copilot','/platforms/copilot.png','#2563EB'],
    ['Grok','/platforms/grok.png','#2B2F3A'],['Claude','/platforms/claude.png','#C46A45'],['DeepSeek','/platforms/deepseek.svg','#3355C7'],['Mistral','/platforms/mistral.svg','#E0702A'],
    ['Kimi','/platforms/kimi.svg','#B4458C'],['Groq','/platforms/groq.png','#D9532B'],['Google AI','/platforms/google-ai.png','#4285F4']
  ];
  const v2ByName: Record<string, { name: string; logo: string; badgeStyle: string }> = {};
  const platforms = V2_P.map(p => { const o = { name: p[0], logo: p[1], badgeStyle: 'background:' + p[2] }; v2ByName[p[0]] = o; return o; });
  const platformsLoop = [...platforms, ...platforms];

  const v2ActiveTab = 'background:#0A0A14;color:#fff';
  const audiences = [
    { label: 'Local Business', selected: !personalMode, style: !personalMode ? v2ActiveTab : '', pick: () => setPersonalMode(false) },
    { label: 'Professional', selected: personalMode, style: personalMode ? v2ActiveTab : '', pick: () => setPersonalMode(true) },
  ];

  const v2Checks: [string, number][] = [['ChatGPT',1],['Gemini',0],['Perplexity',1],['Copilot',1],['Grok',0],['Claude',1]];
  const scanRows = v2Checks.map(c => {
    const p = v2ByName[c[0]];
    return { name: c[0], logo: p.logo, badgeStyle: p.badgeStyle, mentioned: !!c[1], aria: c[1] ? 'Mentioned' : 'Not mentioned',
      markStyle: 'width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;' + (c[1] ? 'background:#E3F6EC;color:#0B6B37' : 'background:#FDECEC;color:#B4232A') };
  });


  const v2StepsRaw: [string, string, string][] = [
    ['01','Scan','Query 12 AI platforms simultaneously with real searches'],
    ['02','Diagnose','See where competitors win and exactly why'],
    ['03','Fix','Get personalized fix content ready to implement'],
    ['04','Verify','Automatic rescan confirms improvement'],
    ['05','Intelligence','Every scan builds the global AI Recommendation Intelligence Graph'],
  ];
  const steps = v2StepsRaw.map(s => {
    const hi = s[1] === 'Verify';
    return { num: s[0], title: s[1], desc: s[2],
      cardStyle: 'padding:28px;border-radius:16px;display:flex;flex-direction:column;gap:16px;min-height:250px;' + (hi ? 'background:#1B17FF;color:#fff;box-shadow:0 30px 60px -30px rgba(27,23,255,.8)' : 'background:#F6F6FB'),
      numStyle: 'font-size:12px;' + (hi ? 'color:#DCDBFF' : 'color:#1B17FF'),
      descStyle: 'margin-top:auto;line-height:1.55;' + (hi ? 'color:#E8E8FF' : 'color:#55556A') };
  });

  const v2BreakdownRaw: [string, string, number][] = [
    ['ChatGPT','Responded — mentioned competitor 3 times',2],['Gemini','Responded — you appeared once',1],['Perplexity','Responded — competitor recommended, you not mentioned',2],
    ['Copilot','Responded',0],['Grok','Responded — competitor appeared',2],['Claude','Responded — you appeared',1],['DeepSeek','Responded',0],
    ['Mistral','Responded — you not mentioned',2],['Kimi','Responded',0],['Groq','Responded — you appeared',1],['Google AI','Responded — competitor featured',2]
  ];
  const breakdown = v2BreakdownRaw.map(b => {
    const p = v2ByName[b[0]];
    const c = b[2] === 1 ? 'color:#0B6B37' : (b[2] === 2 ? 'color:#B4232A' : 'color:#55556A');
    return { name: b[0], logo: p.logo, badgeStyle: p.badgeStyle + ';width:32px;height:32px;font-size:14px;border-radius:8px', note: b[1], noteStyle: 'text-align:right;font-size:12px;' + c };
  });

  /* Plans — REAL founder pricing (mockup had stale $119/$599).
     ax6z: prices are USD for every visitor. Checkout charges the single USD
     Stripe price per plan (getStripePrice ignores country), so showing a
     local-currency price (e.g. £95 for GB) would disagree with the charge.
     The countryConfig per-country schedule is the intended future pricing —
     it becomes the display only once per-country Stripe prices exist. */
  const usPricing = getCountryConfig('US');
  const v2PlansRaw = [
    { name:'Local Business', href:'/signup?plan=business', price: `$${usPricing.monthly}`, per:'/month', tag:'LIVE NOW', who:'Local businesses — dentists, lawyers, HVAC, restaurants, med spas', feature:'See if ChatGPT recommends you or your competitor when local customers search', cta:(<>Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:true, kind:1 },
    { name:'Local Pro + SEO Autopilot', href:'#scan', price: `+$${tierPrice('SEO')}`, per:'/mo add-on', tag:'COMING SOON', who:'Local Business plus we implement fixes for you automatically', feature:'Everything in Local Business, plus our team implements every fix for you automatically.', cta:(<>Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:false, kind:0 },
    { name:'Personal Brand', href:'/signup?plan=personal_pro', price: `$${usPricing.tiers.personalPro.monthly}`, per:'/month', tag:'LIVE', who:'Doctors, lawyers, consultants, coaches, executives', feature:'Find out if AI recommends you personally by name across 12 platforms.', cta:(<>Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:true, kind:0 },
    { name:'Product Pro', href:'#scan', price: `$${usPricing.tiers.productPro.monthly}`, per:'/month', tag:'COMING SOON', who:'E-commerce, Amazon sellers, SaaS products', feature:'See where your product appears when customers ask AI for recommendations.', cta:(<>Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:false, kind:0 },
    { name:'Agency', href:'/signup?plan=agency', demoHref:'/agency/demo', price: `$${usPricing.tiers.agency.monthly}`, per:'/month', tag:'LIVE', who:'Marketing agencies managing multiple clients', feature:'Show clients their AI visibility gap. Add a new high-value service.', cta:(<>Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:true, kind:0 },
    { name:'Publisher Pro', href:'#scan', price:'Coming soon', per:'', tag:'COMING SOON', who:'News sites, media, publishers', feature:'Track how AI cites and recommends your content across every platform.', cta:(<>Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:false, kind:0 },
    { name:'Global Brand Intelligence', href:'#scan', price:`$${tierPrice('Global Brand Intelligence').toLocaleString('en-US')}`, per:'/month', tag:'ENTERPRISE', who:'Nike, McDonald\u2019s, global brands', feature:'AI share of voice tracking. Misinformation detection. Category ownership.', cta:(<>Request Demo <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:false, kind:2 },
    { name:'Government City Intelligence', href:'#scan', price:`$${tierPrice('Government').toLocaleString('en-US')}`, per:'/month', tag:'ENTERPRISE', who:'Cities, chambers, tourism boards', feature:'Measure AI visibility of businesses across your city. Data for grants.', cta:(<>Request Demo <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>), live:false, kind:2 },
  ];
  const plans = v2PlansRaw.map(p => {
    const feat = p.kind === 1, ent = p.kind === 2, dark = feat || ent;
    return { ...p, guarantee: p.live,
      cardStyle: 'padding:28px;border-radius:16px;display:flex;flex-direction:column;gap:16px;' + (feat ? 'background:#1B17FF;color:#fff;box-shadow:0 40px 80px -40px rgba(27,23,255,.8)' : (ent ? 'background:#0A0A14;color:#fff' : 'background:#fff;border:1px solid #EDEDF4')) + (p.live || dark ? '' : ';opacity:.92'),
      tagStyle: 'font-size:12px;letter-spacing:.06em;padding:8px 12px;border-radius:999px;white-space:nowrap;' + (feat ? 'background:rgba(255,255,255,.2);color:#fff' : (ent ? 'background:#2A2A44;color:#DCDCE8' : (p.live ? 'background:#E3F6EC;color:#0B6B37' : 'background:#F2F2F8;color:#55556A'))),
      perStyle: dark ? 'color:#DCDBFF' : 'color:#55556A',
      forStyle: 'font-size:14px;line-height:1.5;' + (dark ? 'color:#C9C9DA' : 'color:#55556A'),
      btnStyle: 'margin-top:auto;display:inline-flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;font-weight:700;font-size:15px;padding:14px 24px;text-decoration:none;' + (feat ? 'background:#fff;color:#0A0A14' : (ent ? 'background:#fff;color:#0A0A14' : (p.live ? 'background:#0A0A14;color:#fff' : 'background:#fff;color:#0A0A14;border:1px solid #EDEDF4'))) };
  });

  /* FAQs — real answers from the live page */
  const v2FaqRaw: [string, string][] = [
    ['What is AI visibility and why does it matter?', 'When someone asks ChatGPT, Gemini, or Perplexity to recommend a business, product, or service \u2014 AI visibility is whether your business gets named. Most businesses have no idea they\u2019re being skipped. Rankall shows you exactly where you stand across 12 major AI platforms.'],
    ['How is Rankall different from traditional SEO tools?', 'SEO tools track your Google rankings. Rankall tracks your AI recommendations. These are completely different systems. A business can rank #1 on Google and still be invisible on ChatGPT. We\u2019re built specifically for AI recommendation intelligence.'],
    ['Which AI platforms does Rankall scan?', 'We scan ChatGPT, Gemini, Google AI Overview, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, Groq, and Meta AI \u2014 12 major AI platforms, checked in one scan.'],
    ['How does the Trust Score work?', 'Your Trust Score (0-100) measures how well your business signals trust to AI systems. It looks at your structured data, directory presence, review quality, and community mentions. AI platforms use these signals to decide who to recommend.'],
    ['How long does it take to see results after fixing issues?', 'Timing depends on each AI platform\'s refresh cycle, so it varies by platform and we don\'t promise a fixed number of days. After you mark a fix applied we run a verification rescan (7 days later by default), and you can rescan any time to track progress.'],
    ['Does this work for any type of business?', 'Yes. Rankall works for any business category \u2014 local services, e-commerce, SaaS, restaurants, healthcare, real estate, and more. If customers could ask an AI to recommend your type of business, Rankall tracks whether you show up.'],
    ['What if my business isn\u2019t showing up at all?', 'That\u2019s exactly what Rankall is built for. If you\u2019re not showing up, we show you the exact gaps \u2014 missing structured data, unclaimed directory profiles, weak review signals \u2014 and generate the specific content you need to fix each one.'],
    ['Is my data private?', 'Yes. Your scan data is only visible to you. We never share individual business data with third parties. Scans are stored securely and you can delete your data at any time.'],
  ];
  const faqs = v2FaqRaw.map((f, i) => {
    const open = v2Faq === i;
    return { q: f[0], a: f[1], open,
      iconStyle: 'flex:none;width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:16px;transition:transform .2s,background .2s;' + (open ? 'transform:rotate(45deg);background:#1B17FF;color:#fff' : 'background:#F2F2F8;color:#0A0A14'),
      toggle: () => setV2Faq(open ? -1 : i) };
  });

  const nameChecks = ['Checks AI visibility across 12 platforms', 'Checks Google Knowledge Panel status', 'Identifies trust signal gaps'];
  const moreBool = v2More;
  const moreOpen = v2More ? 'true' : 'false';
  const moreStyle = v2More ? 'background:#F2F2F8;color:#0A0A14' : '';
  const toggleMore = () => setV2More(!v2More);
  // More dropdown: close on outside click / Escape so it never stays stuck open.
  useEffect(() => {
    if (!v2More) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-more-menu]')) setV2More(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setV2More(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [v2More]);
  const moreLinkStyle: React.CSSProperties = { display: 'block', padding: '12px 14px', borderRadius: 10, color: '#0A0A14', fontWeight: 600, fontSize: 15, textDecoration: 'none' };
  const moreDividerStyle: React.CSSProperties = { height: 1, background: '#F2F2F8', margin: '6px 8px' };
  const noop = (e: any) => { if (e && e.preventDefault) e.preventDefault(); };

  // Ticket 7: LinkedIn lookup for the homepage identity-confirm panel —
  // same endpoint and behaviour as the dashboard personal-brand page.
  async function lookupConfirmLinkedin() {
    if (!confirmLinkedinUrl.trim() || !personalConfirm?.name.trim()) return;
    setConfirmLinkedinLoading(true);
    try {
      const res = await fetch('/api/personal-linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: personalConfirm.name.trim(), specialty: personalConfirm.specialty, city: personalConfirm.location, linkedinUrl: confirmLinkedinUrl.trim() }),
      });
      if (!res.ok) throw new Error('Lookup failed');
      const data = await res.json();
      setConfirmLinkedin({ found: !!data.found, profile_url: data.profile_url ?? null, headline: data.current_headline || '' });
    } catch {
      setConfirmLinkedin({ found: false, profile_url: confirmLinkedinUrl.trim(), headline: '' });
    } finally {
      setConfirmLinkedinLoading(false);
    }
  }

  // Ticket 7: run the homepage personal scan AFTER the user confirmed the
  // identity. Sends requireConfirm + identityConfirmed so the server-side
  // 428 gate passes. Failures surface the server's message and return to
  // the confirm panel / form — never a silent failure, never a silent score.
  async function runConfirmedPersonalScan() {
    if (!personalConfirm) return;
    const assessment = assessIdentityConfirm({
      name: personalConfirm.name,
      specialty: personalConfirm.specialty,
      location: personalConfirm.location,
      linkedinUrl: confirmLinkedinUrl,
      linkedin: confirmLinkedin ? { found: confirmLinkedin.found, headline: confirmLinkedin.headline } : null,
    });
    setIsScanning(true);
    setScanError(null);
    setStep(1);
    setProg(0);
    setActive([]);
    const progInterval = setInterval(() => setProg(p => Math.min(p + 2, 90)), 400);
    const platInterval = setInterval(() => {
      setPlatIdx(i => (i + 1) % PLATFORMS.length);
      setActive(prev => [...prev, Math.floor(Math.random() * 10)].slice(-3));
    }, 600);
    const ppAbort = new AbortController();
    const ppTimeout = setTimeout(() => ppAbort.abort(), 120000);
    const cleanup = () => { clearInterval(progInterval); clearInterval(platInterval); clearTimeout(ppTimeout); };
    try {
      const res = await fetch('/api/scan-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: personalConfirm.name,
          specialty: personalConfirm.specialty,
          location: personalConfirm.location,
          userId: userId || undefined,
          requireConfirm: true,
          identityConfirmed: true,
          identityConfidence: assessment.confidence,
          identityBasis: assessment.basis,
          linkedinUrl: confirmLinkedinUrl.trim() || undefined,
        }),
        signal: ppAbort.signal,
      });
      cleanup();
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if ((data as { scan_id?: string }).scan_id) {
        // ax8b: claim this scan for this browser session (see app/report/[id]).
        try { sessionStorage.setItem(`rankall:scan-claim:${(data as { scan_id: string }).scan_id}`, '1'); } catch { /* storage unavailable */ }
        window.location.href = `/report/${(data as { scan_id: string }).scan_id}`;
        return;
      }
      // 428 = server still wants confirmation (should not happen — we
      // confirmed); keep the panel so the user can confirm again.
      // 400 = disambiguation (bare name, needs specialty/city) — the fix is
      // editing the query, not re-confirming, so dismiss the panel.
      setScanError((data as { message?: string; error?: string }).message || (data as { error?: string }).error || 'Personal scan failed. Please try again.');
      if (res.status === 400) setPersonalConfirm(null);
      setStep(0);
      setIsScanning(false);
    } catch {
      cleanup();
      setScanError('Personal scan is taking longer than expected. Please try again.');
      setStep(0);
      setIsScanning(false);
    }
  }

  const v2HandleScan = (e: React.FormEvent) => { e.preventDefault(); startScan(); };

  const dashPriority = (          <div style={{gridColumn:'1/-1',padding:'16px 20px',borderRadius:'14px',background:'#1B17FF',color:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',flexWrap:'wrap'}}><span><span className="mono" style={{fontSize:'11px',color:'#DCDBFF',marginRight:'10px'}}>TODAY'S PRIORITY</span>Apply FAQ Schema fix</span><span className="mono" style={{fontWeight:'600'}}>→ Est. +{examplePts('faq_schema')} pts</span></div>);
  const dashTrend = (          <div style={{gridColumn:'1/-1',padding:'20px',borderRadius:'16px',border:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap:'10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}><span style={{fontWeight:'700'}}>Score Trend — Last 45 Days</span><span style={{fontSize:'14px'}}><span className="ok" style={{fontWeight:'700'}}>▲ +44 points in 45 days</span><span style={{color:'#55556A'}}> · 8 of 12 platforms now mentioning you</span></span></div>
            <svg viewBox="0 0 800 140" width="100%" height="140" preserveAspectRatio="none" aria-hidden="true"><path d="M0 125 L160 108 L320 86 L480 70 L640 44 L800 24 L800 140 L0 140Z" fill="#ECEBFF"></path><path className="draw" d="M0 125 L160 108 L320 86 L480 70 L640 44 L800 24" fill="none" stroke="#1B17FF" strokeWidth="3"></path></svg>
          </div>);
  const dashCompetitor = (          <div style={{padding:'20px',borderRadius:'16px',border:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap:'10px'}}>
            <span style={{fontWeight:'700'}}>Competitor Intelligence</span>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#ECEBFF',fontWeight:'600'}}><span>You</span><span className="mono">67</span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB'}}><span>Smile Center Chicago</span><span className="mono">84</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'14px',gap:'8px',flexWrap:'wrap'}}><span className="no" style={{fontWeight:'600'}}>Gap: -17 points</span><span style={{color:'#55556A'}}>Competitor gaining on ChatGPT</span></div>
          </div>);
  const dashFixQueue = (          <div style={{padding:'20px',borderRadius:'16px',border:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap:'8px'}}>
            <span style={{fontWeight:'700'}}>Your Fix Queue</span>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#E3F6EC',fontSize:'14px'}}><span>#1 FAQ Schema +{examplePts('faq_schema')}pts</span><span className="mono ok" style={{fontSize:'12px',fontWeight:'600'}}><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> APPLIED</span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB',fontSize:'14px'}}><span>#2 LocalBusiness JSON-LD</span><span className="mono">+{examplePts('local_business_schema')}pts</span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB',fontSize:'14px'}}><span>#3 Reddit Presence</span><span className="mono">+{examplePts('reddit_contribution')}pts</span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB',fontSize:'14px'}}><span>#4 BBB Listing</span><span className="mono">+{examplePts('citation_finder')}pts</span></div>
            <span style={{fontSize:'14px',fontWeight:'600',color:'#1B17FF'}}>Total potential: +{['faq_schema','local_business_schema','reddit_contribution','citation_finder'].reduce((t, ft) => t + examplePts(ft), 0)} points (est.)</span>
          </div>);
  const dashCoverage = (          <div style={{padding:'20px',borderRadius:'16px',border:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap:'10px'}}>
            <span style={{fontWeight:'700'}}>AI Platform Coverage</span>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB',fontSize:'14px'}}><span>ChatGPT</span><span className="ok" style={{fontWeight:'700',display:'inline-flex'}}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB',fontSize:'14px'}}><span>Grok</span><span className="no" style={{fontWeight:'700',display:'inline-flex'}}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 210.7 54.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L114.7 256 9.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 301.3 265.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L205.3 256 310.6 150.6z"/></svg></span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',borderRadius:'10px',background:'#F6F6FB',fontSize:'14px'}}><span>Kimi</span><span className="no" style={{fontWeight:'700',display:'inline-flex'}}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 210.7 54.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L114.7 256 9.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 301.3 265.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L205.3 256 310.6 150.6z"/></svg></span></div>
          </div>);
  const dashDiscovery = (          <div style={{padding:'20px',borderRadius:'16px',border:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap:'10px'}}>
            <span style={{fontWeight:'700'}}>Combined Discovery Score</span>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'14px'}}><span style={{color:'#55556A'}}>AI Visibility</span><span className="mono">67/100</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'14px'}}><span style={{color:'#55556A'}}>SEO Health</span><span className="mono">71/100</span></div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'12px',borderRadius:'10px',background:'#0A0A14',color:'#fff',fontWeight:'600'}}><span>Discovery Score</span><span className="mono">69/100</span></div>
          </div>);
  const dashSpend = (          <div style={{padding:'20px',borderRadius:'16px',border:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap:'10px'}}>
            <span style={{fontWeight:'700'}}>Marketing Spend Intelligence</span>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'14px',gap:'8px'}}><span>Google Ads $2,500</span><span className="no" style={{fontWeight:'600'}}>→ Low AI Impact</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'14px',gap:'8px'}}><span>Reviews $200</span><span className="ok" style={{fontWeight:'600'}}>→ Very High AI Impact</span></div>
            <div style={{padding:'10px 12px',borderRadius:'10px',background:'#ECEBFF',fontSize:'13px',color:'#1B17FF',fontWeight:'500'}}>Move $500 from Google Ads to review generation → +8 points</div>
          </div>);
  const dashPanels = [
    (<>{dashPriority}{dashTrend}{dashCompetitor}{dashFixQueue}{dashCoverage}{dashDiscovery}{dashSpend}</>),
    (<>{dashCompetitor}{dashCoverage}{dashTrend}{dashDiscovery}</>),
    (<>{dashPriority}{dashFixQueue}{dashDiscovery}</>),
    (<>{dashCoverage}{dashSpend}{dashDiscovery}</>),
    (<>{dashTrend}{dashSpend}{dashCompetitor}</>),
    (<>{dashCompetitor}{dashFixQueue}{dashSpend}{dashDiscovery}</>),
  ];

  // ax7w: the submitted business's OWN per-platform result — its extracted
  // entry (the count the teaser/leak/cost blocks use), or, for a business-
  // name scan of that same business, the scan's own mention flags. null =
  // we never checked this business, so no phrase-based numbers are shown.
  const ownBizChecked = !!userBizMatch
    || (!!scannedBizName && !!bizName.trim() && businessNamesMatch(scannedBizName, bizName.trim()));
  const ownBizMentions: number | null = userBizMatch
    ? userBizMatch.mentions
    : ownBizChecked ? mentionedCount : null;
  const ownBizPlatforms: string[] | null = userBizMatch
    ? userBizMatch.platforms
    : ownBizChecked ? scanResults.filter(r => (r.mentionRate ?? 0) > 0).map(r => r.platform) : null;
  // ax7w (top of results): the business THIS scan measured — the extracted
  // entry for the submitted business, or the scanned business on a business-
  // name scan. For a category search with no business yet, null: the
  // phrase-based mentionedCount ("best dentist in Chicago appears in 12 of
  // 12") is never shown as anyone's visibility.
  const scanSubjectName: string | null = userBizMatch?.name ?? scannedBizName ?? null;
  const scanSubjectMentions: number | null = userBizMatch
    ? userBizMatch.mentions
    : scannedBizName ? mentionedCount : null;

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif', overflowX: 'hidden' }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: "[{\"@context\": \"https://schema.org\", \"@type\": \"SoftwareApplication\", \"name\": \"Rankall\", \"applicationCategory\": \"BusinessApplication\", \"operatingSystem\": \"Web\", \"url\": \"https://rankall.io\", \"description\": \"Rankall scans 12 AI platforms (ChatGPT, Gemini, Google AI Overview, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, Groq, Meta AI) in under 90 seconds and shows whether AI recommends your business or your competitor, then generates the fixes to close the gap.\", \"offers\": " + JSON.stringify({ "@type": "AggregateOffer", lowPrice: PRICE_RANGE_USD.lowPrice, highPrice: PRICE_RANGE_USD.highPrice, priceCurrency: PRICE_RANGE_USD.priceCurrency, offerCount: PRICE_RANGE_USD.offerCount }) + ", \"provider\": {\"@type\": \"Organization\", \"name\": \"Rankall\", \"url\": \"https://rankall.io\"}}, {\"@context\": \"https://schema.org\", \"@type\": \"FAQPage\", \"mainEntity\": [{\"@type\": \"Question\", \"name\": \"What is AI visibility and why does it matter?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"When someone asks ChatGPT, Gemini, or Perplexity to recommend a business, product, or service \\u2014 AI visibility is whether your business gets named. Most businesses have no idea they\\u2019re being skipped. Rankall shows you exactly where you stand across 12 major AI platforms.\"}}, {\"@type\": \"Question\", \"name\": \"How is Rankall different from traditional SEO tools?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"SEO tools track your Google rankings. Rankall tracks your AI recommendations. These are completely different systems. A business can rank #1 on Google and still be invisible on ChatGPT. We\\u2019re the first tool built specifically for AI recommendation intelligence.\"}}, {\"@type\": \"Question\", \"name\": \"Which AI platforms does Rankall scan?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"We scan ChatGPT, Gemini, Google AI Overview, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, Groq, and Meta AI \\u2014 12 major AI platforms, checked in one scan.\"}}, {\"@type\": \"Question\", \"name\": \"How does the Trust Score work?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"Your Trust Score (0-100) measures how well your business signals trust to AI systems. It looks at your structured data, directory presence, review quality, and community mentions. AI platforms use these signals to decide who to recommend.\"}}, {\"@type\": \"Question\", \"name\": \"How long does it take to see results after fixing issues?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"Timing depends on how often each AI platform refreshes its data, so we don't promise a fixed number of days. After you mark a fix as applied, Rankall rescans to verify it (7 days later by default, or on the schedule you pick), and you can rescan any time to track progress.\"}}, {\"@type\": \"Question\", \"name\": \"Does this work for any type of business?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"Yes. Rankall works for any business category \\u2014 local services, e-commerce, SaaS, restaurants, healthcare, real estate, and more. If customers could ask an AI to recommend your type of business, Rankall tracks whether you show up.\"}}, {\"@type\": \"Question\", \"name\": \"What if my business isn\\u2019t showing up at all?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"That\\u2019s exactly what Rankall is built for. If you\\u2019re not showing up, we show you the exact gaps \\u2014 missing structured data, unclaimed directory profiles, weak review signals \\u2014 and generate the specific content you need to fix each one.\"}}, {\"@type\": \"Question\", \"name\": \"Is my data private?\", \"acceptedAnswer\": {\"@type\": \"Answer\", \"text\": \"Yes. Your scan data is only visible to you. We never share individual business data with third parties. Scans are stored securely and you can delete your data at any time.\"}}]}]" }} />


      {upgradePlan && (
        <div style={{ position: 'sticky', top: 0, zIndex: 1000, background: '#1B17FF', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>
            You selected <strong>{({ local_pro: 'Local Business', personal_pro: 'Personal Brand', agency: 'Agency' } as Record<string, string>)[upgradePlan] || 'a Pro plan'}</strong>. Complete your setup to unlock all features.
          </span>
          <a href={`/pricing?plan=${encodeURIComponent(upgradePlan)}&interval=${upgradeInterval}`} style={{ background: '#fff', color: '#7C3AED', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>Upgrade Now <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
          <button onClick={() => setUpgradePlan(null)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 0, display:'inline-flex', alignItems:'center' }}><svg viewBox="0 0 384 512" width="16" height="16" fill="#fff" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>
        </div>
      )}

      <LimitReachedModal
        open={!!limitModal}
        onClose={() => setLimitModal(null)}
        data={limitModal || {}}
      />

      {/* WAITLIST MODAL — island (azxj): see components/HomepageWaitlistModal.tsx */}
      {showWaitlistModal && (
        <HomepageWaitlistModal
          intent={waitlistIntent}
          entityName={waitlistEntityName}
          onClose={() => setShowWaitlistModal(false)}
        />
      )}

      {step === 0 && (
        <>{/* ===== V2: PREAMBLE ===== */}


{/* ===== V2: PROMO BANNER (shared) ===== */}
<SiteAnnouncement />

{/* ===== V2: NAV (shared: components/SiteChrome.tsx) ===== */}
<SiteHeader onWatchDemo={() => setV2VideoOpen(true)} />

{/* ===== V2: 1 HERO + 2 WATCH A LIVE SCAN ===== */}
<section id="top" style={{position:'relative',background:'#F6F6FB',padding:'80px 0 0'}}>
  <div className="dots" style={{position:'absolute',inset:'0',pointerEvents:'none'}} aria-hidden="true"></div>
  <div className="wrap" style={{position:'relative',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(520px,100%),1fr))',gap: '48px',alignItems:'center'}}>
    <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>
      <h1 style={{margin:'0',fontSize:48,lineHeight:'.98',letterSpacing:'-0.055em',fontWeight:'800',textWrap:'balance'}}>Right now, someone is asking ChatGPT who to hire <span style={{color:'#1B17FF'}}>in your city.</span></h1>
      <p style={{margin:'0',fontSize:'24px',lineHeight:'1.35',fontWeight:'600',color:'#2A2A3C',letterSpacing:'-0.02em'}}>Is it sending them to you — or your competitor?</p>
      <p className="lede">We scan 12 AI platforms in under 90 seconds. Show you who they recommend. Fix the gaps. Verify it worked.</p>
      <div id="scan" style={{display:'flex',flexDirection:'column',gap: '12px',maxWidth:'600px'}}>
        <span className="mono" style={{fontSize:'12px',letterSpacing:'.08em',color:'#55556A'}}>SEARCH HOW CUSTOMERS FIND BUSINESSES NEAR YOU</span>
        <div role="tablist" aria-label="Scan type" style={{display:'flex',gap:'4px',padding:'4px',borderRadius:'999px',background:'#fff',border:'1px solid #EDEDF4',alignSelf:'flex-start'}}>
          {audiences.map((a) => (<>
            <button className="tab" role="tab" aria-selected={a.selected} onClick={a.pick} style={css(a.style)}>{a.label}</button>
          </>))}
        </div>
        <form onSubmit={v2HandleScan} style={{display:'flex',gap: '8px',flexWrap:'wrap',padding:'6px',borderRadius:'999px',background:'#fff',border:'1px solid #EDEDF4',boxShadow:'0 20px 40px -24px rgba(10,10,20,.25)'}}>
          <label htmlFor="q1" style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0 0 0 0)'}}>Search how customers find businesses near you</label>
          <input id="q1" type="text" aria-label="Enter a business or search query" placeholder="Best dentist in Chicago" value={query} onChange={(e) => setQuery(e.target.value)} style={{flex:'1 1 220px',minWidth:'0',minHeight:'52px',padding: '0 24px',border:'0',borderRadius:'999px',background:'transparent',color:'#0A0A14',fontFamily:'inherit',fontSize:'16px'}}/>
          <button type="submit" className="btn btn-blue" disabled={isScanning} style={isScanning ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>{isScanning ? 'Scanning…' : 'Scan Free'} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
        </form>
        {scanError ? (
          <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C6C6', color: '#8A1C1C', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
            {scanError}
          </div>
        ) : null}
        {/* Ticket 7: identity-confirm — "Is this you?" before any personal
            score is produced. Mirrors the dashboard personal-brand step. */}
        {personalConfirm && (() => {
          const assessment = assessIdentityConfirm({
            name: personalConfirm.name,
            specialty: personalConfirm.specialty,
            location: personalConfirm.location,
            linkedinUrl: confirmLinkedinUrl,
            linkedin: confirmLinkedin ? { found: confirmLinkedin.found, headline: confirmLinkedin.headline } : null,
          });
          const lowNoLinkedin = assessment.confidence === 'low' && !confirmLinkedinUrl.trim();
          const confColor = assessment.confidence === 'high' ? '#0B6B37' : assessment.confidence === 'medium' ? '#D97706' : '#D92D20';
          const confLabel = assessment.confidence === 'high' ? 'High identity confidence' : assessment.confidence === 'medium' ? 'Medium identity confidence' : 'Low identity confidence';
          return (
            <div role="dialog" aria-label="Confirm identity" style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '16px 18px', textAlign: 'left' }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Is this you?</p>
              <p style={{ fontSize: 13, color: GRAY, margin: '0 0 12px', lineHeight: 1.5 }}>
                Confirm the identity below before we score it. A wrong match means the score describes someone else — or a business, not a person.
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>{personalConfirm.name}{personalConfirm.specialty ? ` — ${personalConfirm.specialty}` : ''}{personalConfirm.location ? ` · ${personalConfirm.location}` : ''}</p>
              {confirmLinkedin?.found && confirmLinkedin.profile_url && (
                <p style={{ fontSize: 13, color: GRAY, margin: '0 0 8px' }}>LinkedIn: <a href={confirmLinkedin.profile_url} target="_blank" rel="noreferrer" style={{ color: BLUE }}>{confirmLinkedin.headline || confirmLinkedin.profile_url}</a></p>
              )}
              <p style={{ fontSize: 12, fontWeight: 800, color: confColor, margin: '8px 0 4px' }}>{confLabel}</p>
              <ul style={{ fontSize: 12, color: GRAY, margin: '0 0 12px', paddingLeft: 16 }}>
                {assessment.basis.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={confirmLinkedinUrl} onChange={e => { setConfirmLinkedinUrl(e.target.value); setConfirmLinkedin(null); }} placeholder="LinkedIn URL (optional, raises confidence)" style={{ flex: '1 1 240px', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: NAVY, background: W, boxSizing: 'border-box' as const }} />
                <button type="button" onClick={lookupConfirmLinkedin} disabled={!confirmLinkedinUrl.trim() || confirmLinkedinLoading} className="btn btn-line" style={{ minHeight: '40px', opacity: (!confirmLinkedinUrl.trim() || confirmLinkedinLoading) ? 0.6 : 1, cursor: (!confirmLinkedinUrl.trim() || confirmLinkedinLoading) ? 'not-allowed' : 'pointer' }}>
                  {confirmLinkedinLoading ? 'Looking up…' : 'Look up LinkedIn'}
                </button>
              </div>
              {lowNoLinkedin && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#92400E', marginTop: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={confirmScanAnyway} onChange={e => setConfirmScanAnyway(e.target.checked)} style={{ marginTop: 2 }} />
                  I understand this may score the wrong person — scan anyway.
                </label>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" onClick={runConfirmedPersonalScan} disabled={lowNoLinkedin && !confirmScanAnyway} className="btn btn-blue" style={{ minHeight: '44px', opacity: (lowNoLinkedin && !confirmScanAnyway) ? 0.6 : 1, cursor: (lowNoLinkedin && !confirmScanAnyway) ? 'not-allowed' : 'pointer' }}>
                  {lowNoLinkedin ? 'Scan anyway' : 'Yes, this is me — run scan'}
                </button>
                <button type="button" onClick={() => { setPersonalConfirm(null); setIsScanning(false); }} className="btn btn-line" style={{ minHeight: '44px' }}>
                  Not me — edit details
                </button>
              </div>
            </div>
          );
        })()}
        <span style={{fontSize:'14px',color:'#55556A',paddingLeft:'8px',lineHeight:'1.5'}}>Live in {MARKETS_COVERED} markets · Scanning ChatGPT, Gemini + 9 more AI platforms</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:'24px',flexWrap:'wrap'}}>
        <a href="#demo" onClick={(e) => { e.preventDefault(); setV2VideoOpen(true); }} style={{display:'inline-flex',alignItems:'center',gap:'12px',color:'#0A0A14',fontWeight:'600',textDecoration:'none',cursor:'pointer'}}>
          <span style={{width:'40px',height:'40px',borderRadius:'50%',background:'#0A0A14',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><svg viewBox="0 0 384 512" width="24" height="24" fill="#fff" aria-hidden="true"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg></span>
          Watch 3-minute product tour
        </a>
        <span style={{display:'inline-flex',alignItems:'center',gap: '8px',fontSize:'14px',color:'#55556A'}}><svg viewBox="0 0 512 512" width="12" height="12" fill="#0B6B37" aria-hidden="true"><path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8l0 378.1C394 378 431.1 230.1 432 141.4L256 66.8s0 0 0 0z"/></svg>14-day money back guarantee</span>
      </div>
    </div>

    <div className="bob">
      <div className="card" style={{overflow:'hidden',boxShadow:'0 50px 100px -40px rgba(27,23,255,.35),0 20px 40px -20px rgba(10,10,20,.15)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding: '16px 24px',borderBottom:'1px solid #EDEDF4'}}>
          <div style={{display:'flex',flexDirection:'column',gap:'2px'}}><span style={{fontWeight:'700'}}>Example scan</span><span style={{fontSize:'13px',color:'#55556A'}}>What a scan looks like</span></div>
          <span style={{display:'inline-flex',alignItems:'center',gap:'8px',fontSize:'11px',fontWeight:'700',color:'#55556A',background:'#F6F6FB',border:'1px solid #EDEDF4',borderRadius:'999px',padding:'4px 10px'}} className="mono">EXAMPLE</span>
        </div>
        <div style={{overflow:'hidden'}}><div className="sweep"></div></div>
        <div style={{padding: '16px 24px 6px'}}>
          <div style={{padding: '16px 16px',borderRadius:'12px',background:'#F6F6FB',fontSize: '16px',display:'flex',gap: '12px',alignItems:'center',justifyContent:'space-between'}}><span style={{display:'flex',gap: '12px',alignItems:'center'}}><svg viewBox="0 0 512 512" width="12" height="12" fill="#55556A" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>Best dentist in Chicago</span><span className="mono" style={{fontWeight:'600'}}>34 /100</span></div>
        </div>
        <div style={{padding:'8px 12px',display:'flex',flexDirection:'column'}}>
          {scanRows.map((r) => (<>
            <div className="row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',padding:'12px 8px',borderBottom:'1px solid #F0F0F6'}}>
              <div style={{display:'flex',alignItems:'center',gap:'12px'}}><Image src={r.logo} alt={r.name} width="30" height="30" loading="lazy" decoding="async" style={{width:30,height:30,borderRadius:"50%",objectFit:"contain",background:"#fff",padding:3,flexShrink:0,display:"block",border:"1px solid #EDEDF4"}} /><span style={{fontWeight:'500'}}>{r.name}</span></div>
              {r.mentioned ? (
                <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'32px',height:'32px',borderRadius:'50%',background:'#E6F7ED',flexShrink:0}} role="img" aria-label="Mentioned">
                  <svg viewBox="0 0 448 512" width="14" height="14" fill="#12A150" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>
                </span>
              ) : (
                <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'32px',height:'32px',borderRadius:'50%',background:'#FDECEC',flexShrink:0}} role="img" aria-label="Not mentioned">
                  <svg viewBox="0 0 384 512" width="14" height="14" fill="#D92D20" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L160 210.7 54.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L114.7 256 9.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 301.3 265.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L205.3 256 310.6 150.6z"/></svg>
                </span>
              )}
            </div>
          </>))}
        </div>
        <div className="late" style={{margin: '16px 24px 24px',padding: '16px 16px',borderRadius: '16px',background:'#0A0A14',color:'#fff',display:'flex',flexDirection:'column',gap: '12px'}}>
          <span style={{display:'flex',alignItems:'center',gap: '12px',fontWeight:'600'}}><svg viewBox="0 0 384 512" width="12" height="12" fill="#FF8A8A" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>No verified entity — Google doesn't know you exist</span>
          <span style={{fontSize:'14px',color:'#B4B4C8'}}>Find out whether this is happening to you. <a href="#scan" style={{color:'#fff',fontWeight:'600',textDecoration:'underline',textUnderlineOffset:'3px'}}>Scan to see your reality <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a></span>
        </div>
      </div>
    </div>
  </div>

  <div style={{position:'relative',marginTop:'80px',padding:'28px 0',borderTop:'1px solid #EDEDF4',background:'#fff',display:'flex',flexDirection:'column',gap:'16px'}}>
    <div className="mono" style={{textAlign:'center',fontSize:'12px',letterSpacing:'.12em',color:'#55556A'}}>SCANNING CHATGPT, GEMINI + 10 MORE AI PLATFORMS</div>
    <div className="marquee"><div className="track">
      {platformsLoop.map((p) => (<>
        <div className="chip" style={{padding: '6px 24px 6px 6px',fontWeight:'600',fontSize:'14px'}}><Image src={p.logo} alt={p.name} width="38" height="38" loading="eager" style={{width:38,height:38,borderRadius:"50%",objectFit:"contain",background:"#fff",padding:4,flexShrink:0,display:"block",border:"1px solid #EDEDF4"}} />{p.name}</div>
      </>))}
    </div></div>
  </div>
</section>

{/* ===== V2: 3 SHARE OF RECOMMENDATION ===== */}
<section className="sec sec-w">
  <div className="wrap" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(480px,100%),1fr))',gap: '48px',alignItems:'center'}}>
    <div style={{display:'flex',flexDirection:'column',gap: '16px'}}>
      <span className="kicker">Share of Recommendation™</span>
      <h2 className="h2">Your Share of AI Recommendations</h2>
      <p className="lede">Share of Recommendation is the share of AI answers that recommend your business. This example shows how it looks — yours appears after your first scan.</p>
      <a href="#scan" className="btn btn-ink" style={{alignSelf:'flex-start'}}>See My Share of Recommendation <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
    </div>
    <div className="card" style={{display:'flex',flexDirection:'column',gap:'24px',background:'#ECEBFF',borderColor:'#DCDAFF'}}>
      <span style={{display:'flex',alignItems:'center',gap:'10px'}}><span style={{fontWeight:'700',fontSize: '16px'}}>Share of Recommendation™</span><span style={{fontSize:'11px',fontWeight:'700',color:'#55556A',background:'#fff',border:'1px solid #EDEDF4',borderRadius:'999px',padding:'4px 10px'}}>EXAMPLE</span></span>
      <div style={{display:'flex',flexDirection:'column',gap: '12px'}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontWeight:'700'}}>You</span><span className="mono" style={{fontWeight:'600',color:'#1B17FF'}}>23%</span></div><div style={{height:'16px',borderRadius:'8px',background:'rgba(10,10,20,.07)'}}><div className="grow" style={{width:'23%',height:'100%',borderRadius:'8px',background:'#1B17FF'}}></div></div></div>
      <div style={{display:'flex',flexDirection:'column',gap: '12px'}}><div style={{display:'flex',justifyContent:'space-between'}}><span>Top Competitor</span><span className="mono" style={{fontWeight:'600'}}>71%</span></div><div style={{height:'16px',borderRadius:'8px',background:'rgba(10,10,20,.07)'}}><div className="grow" style={{width:'71%',height:'100%',borderRadius:'8px',background:'#0A0A14',animationDelay:'.2s'}}></div></div></div>
      <div style={{display:'flex',flexDirection:'column',gap: '12px'}}><div style={{display:'flex',justifyContent:'space-between',color:'#55556A'}}><span>Market Average</span><span className="mono" style={{fontWeight:'600'}}>18%</span></div><div style={{height:'16px',borderRadius:'8px',background:'rgba(10,10,20,.07)'}}><div className="grow" style={{width:'18%',height:'100%',borderRadius:'8px',background:'#A9A8C9',animationDelay:'.4s'}}></div></div></div>
    </div>
  </div>
</section>

{/* ===== V2: 7 HOW IT WORKS ===== */}
<section id="how" className="sec sec-w">
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap:'48px'}}>
    <div style={{display:'flex',flexDirection:'column',gap: '16px',alignItems:'center',textAlign:'center'}}>
      <h2 className="h2">How it works</h2>
    </div>
    <ol style={{listStyle:'none',margin:'0',padding:'0',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(210px,100%),1fr))',gap:'12px'}}>
      {steps.map((s) => (<>
        <li style={css(s.cardStyle)}>
          <span className="mono" style={css(s.numStyle)}>{s.num}</span>
          <span style={{fontSize: '24px',fontWeight:'700',letterSpacing:'-0.03em'}}>{s.title}</span>
          <span style={css(s.descStyle)}>{s.desc}</span>
        </li>
      </>))}
    </ol>
  </div>
</section>

{/* ===== V2: 6 VERIFY ===== */}
{/* Copy rule: explain HOW a result is verified (true from day one), and
    show live numbers only when real verified outcomes exist. */}
<section id="results" className="sec soft">
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap: '48px'}}>
    <div style={{display:'flex',flexDirection:'column',gap: '16px',alignItems:'center',textAlign:'center'}}>
      <h2 className="h2" style={{maxWidth:'860px'}}>Most tools tell you what&apos;s wrong. <span style={{color:'#1B17FF'}}>We prove the fix worked.</span></h2>
      <p className="lede" style={{textAlign:'center',maxWidth:'720px'}}>A result only counts when a fresh scan shows it. No self-reported wins, no &ldquo;trust us&rdquo; screenshots.</p>
    </div>
    <ol style={{listStyle:'none',margin:'0',padding:'0',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(260px,100%),1fr))',gap:'12px'}}>
      <li className="card" style={{display:'flex',flexDirection:'column',gap:'12px'}}>
        <span className="mono" style={{fontSize:'12px',letterSpacing:'.12em',color:'#1B17FF'}}>01 · BEFORE</span>
        <span style={{fontSize:'20px',fontWeight:'700',letterSpacing:'-0.02em'}}>We record where you stand</span>
        <span style={{color:'#55556A',fontSize:'15px',lineHeight:'1.6'}}>Your scan saves which AI assistants recommend you, for the exact questions your customers ask.</span>
      </li>
      <li className="card" style={{display:'flex',flexDirection:'column',gap:'12px'}}>
        <span className="mono" style={{fontSize:'12px',letterSpacing:'.12em',color:'#1B17FF'}}>02 · FIX</span>
        <span style={{fontSize:'20px',fontWeight:'700',letterSpacing:'-0.02em'}}>You apply one fix</span>
        <span style={{color:'#55556A',fontSize:'15px',lineHeight:'1.6'}}>Copy the ready-made fix to your site or listings, then mark it done in your dashboard.</span>
      </li>
      <li className="card" style={{display:'flex',flexDirection:'column',gap:'12px'}}>
        <span className="mono" style={{fontSize:'12px',letterSpacing:'.12em',color:'#1B17FF'}}>03 · AFTER</span>
        <span style={{fontSize:'20px',fontWeight:'700',letterSpacing:'-0.02em'}}>We re-check and show the change</span>
        <span style={{color:'#55556A',fontSize:'15px',lineHeight:'1.6'}}>About 7 days later we ask the same questions again and show what moved: better, the same, or worse.</span>
      </li>
    </ol>
    {outcomeStats && outcomeStats.total_verifications > 0 ? (
      <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(300px,100%),1fr))',gap:'12px'}}>
          <article className="card" style={{display:'flex',flexDirection:'column',gap: '8px',alignItems:'center',textAlign:'center'}}>
            <span style={{fontSize: '48px',fontWeight:'700',letterSpacing:'-0.04em'}}>{outcomeStats.total_verifications}</span>
            <span style={{color:'#55556A',fontSize:'14px'}}>fixes re-checked by a follow-up scan</span>
          </article>
          <article className="card" style={{display:'flex',flexDirection:'column',gap: '8px',alignItems:'center',textAlign:'center'}}>
            <span style={{fontSize: '48px',fontWeight:'700',letterSpacing:'-0.04em'}}>{outcomeStats.avg_improvement >= 0 ? '+' : ''}{outcomeStats.avg_improvement}</span>
            <span style={{color:'#55556A',fontSize:'14px'}}>average score change after a fix</span>
          </article>
        </div>
        <span style={{textAlign:'center',fontSize:'13px',color:'#55556A'}}>Live totals across all Rankall customers. No individual business is shown.</span>
      </div>
    ) : outcomeStats ? (
      <p style={{textAlign:'center',color:'#55556A',fontSize:'14px',margin:'0'}}>We&apos;re early: the first re-checked results will appear here as customers complete their fixes.</p>
    ) : null}
  </div>
</section>

{/* ===== V2: 12 INSIDE YOUR DASHBOARD ===== */}
<section className="sec soft" style={{paddingBottom:0,overflow:'hidden'}}>
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap:'48px'}}>
    <div style={{display:'flex',flexDirection:'column',gap:'12px',alignItems:'center',textAlign:'center'}}>
      <h2 className="h2">Inside your dashboard</h2>
      <p className="lede" style={{textAlign:'center'}}>Example data — your real numbers appear here after your first scan.</p>
    </div>
    <div className="card" onMouseEnter={() => setDashPaused(true)} onMouseLeave={() => setDashPaused(false)} onFocus={() => setDashPaused(true)} onBlur={() => setDashPaused(false)} style={{borderRadius:'24px 24px 0 0',borderBottom:'0',overflow:'hidden',boxShadow:'0 -10px 80px -30px rgba(27,23,255,.35)'}}>
      <div style={{display:'flex',flexWrap:'wrap'}}>
        <aside className="hsm" style={{flex:'0 0 230px',padding: '24px 16px',borderRight:'1px solid #EDEDF4',display:'flex',flexDirection:'column',gap: '16px',fontSize:'13px',background:'#FBFBFE'}}>
          <Image src="/rankall-logo-dark.png" alt="" width="100" height="20" style={{height:'20px',width:'auto',alignSelf:'flex-start'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
            <span className="mono" style={{fontSize:'10px',letterSpacing:'.12em',color:'#5F5F78',padding:'0 10px 4px'}}>DASHBOARD TOUR</span>
            <div role="tablist" aria-label="Dashboard views" style={{display:'flex',flexDirection:'column',gap:'4px'}}>
              {DASH_TABS.map((label, i) => (
                <button key={label} role="tab" aria-selected={dashTab === i} onClick={() => setDashTab(i)} style={{position:'relative',display:'block',width:'100%',textAlign:'left',padding:'8px 10px',borderRadius:'8px',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:'13px',fontWeight:dashTab === i ? 600 : 500,background:dashTab === i ? '#ECEBFF' : 'transparent',color:dashTab === i ? '#1B17FF' : '#55556A',overflow:'hidden'}}>
                  {label}
                  {dashTab === i && !dashPaused && <span key={dashTab} style={{position:'absolute',left:0,bottom:0,height:'2px',background:'#1B17FF',animation:'dashProgress 4s linear forwards'}} />}
                </button>
              ))}
            </div>
            <span style={{fontSize:'12px',color:'#94A3B8',padding:'4px 10px 0',lineHeight:'1.5'}}>{dashPaused ? 'Paused — move your mouse away to resume the tour.' : 'Auto-rotating — hover to pause.'}</span>
          </div>
        </aside>
        <div style={{flex:'999 1 560px',minWidth:'0',padding:'24px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(300px,100%),1fr))',gap:'14px'}} role="tabpanel" aria-label={DASH_TABS[dashTab]}>
          {dashTab !== 0 && (
            <div style={{gridColumn:'1/-1',padding:'14px 16px',borderRadius:'12px',background:'#F6F6FB',display:'flex',gap:'10px',alignItems:'baseline',flexWrap:'wrap'}}><span className="mono" style={{fontSize:'11px',color:'#1B17FF',fontWeight:'700',letterSpacing:'.08em'}}>DASHBOARD · {DASH_TABS[dashTab].toUpperCase()}</span><span style={{fontSize:'14px',color:'#55556A'}}>{DASH_CAPTIONS[dashTab]}</span></div>
          )}
          {dashPanels[dashTab]}
        </div>
      </div>
    </div>
  </div>
</section>

{/* ===== V2: 21 BY NAME — blue feature band ===== */}
<section className="sec sec-w">
  <div className="wrap">
    <div style={{position:'relative',overflow:'hidden',borderRadius:'16px',background:'#1B17FF',color:'#fff',padding:'clamp(36px,6vw,80px)',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(420px,100%),1fr))',gap: '48px',alignItems:'center'}}>
      <svg aria-hidden="true" viewBox="0 0 200 200" style={{position:'absolute',right:'-50px',bottom:'-70px',width:'340px',height:'340px',opacity:'.12'}}><rect x="40" y="10" width="44" height="170" rx="22" transform="rotate(35 62 95)" fill="#fff"></rect><circle cx="150" cy="140" r="26" fill="#fff"></circle></svg>
      <div style={{position:'relative',display:'flex',flexDirection:'column',gap:'16px'}}>
        <h2 className="h2 h2w">Does AI recommend you by name?</h2>
        <p className="lede" style={{color:'#DCDBFF'}}>For doctors, lawyers, consultants and executives — find out if AI recommends you personally across 12 platforms.</p>
      </div>
      <div style={{position:'relative',display:'flex',flexDirection:'column',gap:'12px'}}>
        {nameChecks.map((n) => (<>
          <div style={{display:'flex',alignItems:'center',gap:'12px',padding: '16px 16px',borderRadius:'16px',background:'rgba(255,255,255,.12)'}}><svg viewBox="0 0 448 512" width="12" height="12" fill="#fff" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{n}</div>
        </>))}
        <a href="#scan" className="btn btn-white" style={{alignSelf:'flex-start',marginTop:'8px'}}>Scan Your Name Free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
      </div>
    </div>
  </div>
</section>

{/* ===== V2: 14 AI VISIBILITY FOR EVERY TYPE OF BUSINESS (plans) ===== */}
<section id="pricing" className="sec soft">
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap: '48px'}}>
    <div style={{display:'flex',flexDirection:'column',gap: '16px',alignItems:'center',textAlign:'center'}}>
      <h2 className="h2" style={{maxWidth:'900px'}}>AI visibility for every type of business</h2>
      <p className="lede" style={{textAlign:'center'}}>For local businesses, personal brands, and agencies — if AI talks about your category, you need to know what it says.</p>
      <span className="chip" style={{background:'#FFF6D6',borderColor:'#F1E3A8',color:'#5C4A00',fontWeight:'500'}}>Founding Member Pricing — Lock in your rate today.</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(270px,100%),1fr))',gap:'12px'}}>
      {plans.filter((p) => p.name === 'Local Business' || p.name === 'Personal Brand' || p.name === 'Agency').map((p) => (<>
        <div style={css(p.cardStyle)}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}}><span style={{fontWeight:'700',fontSize: '16px'}}>{p.name}</span><span className="mono" style={css(p.tagStyle)}>{p.tag}</span></div>
          <div style={{display:'flex',alignItems:'baseline',gap:'4px'}}><span style={{fontSize: '48px',fontWeight:'700',letterSpacing:'-0.05em'}}>{p.price}</span><span style={css(p.perStyle)}>{p.per}</span></div>
          <span style={css(p.forStyle)}>{p.who}</span>
          <span style={{lineHeight:'1.5',fontSize: '16px'}}>{p.feature}</span>
          <a href={p.href} style={css(p.btnStyle)}>{p.cta}</a>
          {'demoHref' in p && p.demoHref ? (<a href={p.demoHref} style={{textAlign:'center',fontWeight:'600',fontSize:'15px',textDecoration:'underline',color:'#1B17FF'}}>Book a demo</a>) : null}
          {p.guarantee ? (<><span style={{textAlign:'center',fontSize:'13px'}}>14-day money back guarantee</span></>) : null}
        </div>
      </>))}
    </div>
  </div>
</section>

{/* ===== V2: 26a ASK CHATGPT YOURSELF? ===== */}
<section className="sec sec-w">
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap:'40px'}}>
    <div style={{display:'flex',flexDirection:'column',gap:'16px',alignItems:'center',textAlign:'center'}}>
      <span className="kicker">Why Rankall</span>
      <h2 className="h2" style={{maxWidth:'820px'}}>Why not just ask ChatGPT yourself?</h2>
      <p className="lede" style={{textAlign:'center',maxWidth:'720px'}}>One chat shows you one answer, on one platform, on one day. Customers ask every assistant, every day.</p>
    </div>
    <div className="cmp-wrap" role="region" aria-label="Asking ChatGPT yourself compared with Rankall" tabIndex={0}>
      <table className="cmp">
        <thead><tr><th scope="col"></th><th scope="col">Asking ChatGPT yourself</th><th scope="col" className="cmp-us">With Rankall</th></tr></thead>
        <tbody>
          {ASK_YOURSELF_ROWS.map(([topic, diy, us]) => (
            <tr key={topic}><th scope="row">{topic}</th><td data-label="Asking ChatGPT yourself"><span className="cmp-no" aria-hidden="true">&times;</span>{diy}</td><td className="cmp-us" data-label="With Rankall"><span className="cmp-yes" aria-hidden="true">&#10003;</span>{us}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
</section>

{/* ===== V2: 26b COMPARE ===== */}
<section className="sec soft">
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap:'40px'}}>
    <div style={{display:'flex',flexDirection:'column',gap:'16px',alignItems:'center',textAlign:'center'}}>
      <span className="kicker">Compare</span>
      <h2 className="h2" style={{maxWidth:'860px'}}>Built for local businesses, <span style={{color:'#1B17FF'}}>not just brand tracking</span></h2>
      <p className="lede" style={{textAlign:'center',maxWidth:'720px'}}>Most AI visibility tools are built for brand marketing teams. Rankall is built for the business down the street.</p>
    </div>
    <div className="cmp-wrap" role="region" aria-label="Rankall compared with other AI visibility tools" tabIndex={0}>
      <table className="cmp cmp4">
        <thead><tr><th scope="col"></th><th scope="col" className="cmp-us">Rankall</th><th scope="col">BrightLocal</th><th scope="col">Otterly.AI</th><th scope="col">Peec AI</th></tr></thead>
        <tbody>
          {[
            ['Built for', 'Local businesses, professionals & agencies', 'Local businesses & agencies', 'Brands & marketing teams', 'Brands, marketing teams & agencies'],
            ['AI platforms checked', `${PLATFORMS.length} in every scan`, '3 (ChatGPT, AI Mode, AI Overviews)', '4 included, 3 as add-ons', '3 on the Starter plan'],
            ['Free instant scan', 'Yes — no signup, about 90 seconds', 'Free checker tool', 'Free trial', 'Free trial'],
            ['Ready-made fixes', 'Yes — generated fix content', 'Citation gap fixes', 'Content recommendations', 'Recommendations'],
            ['Re-check proves the fix worked', 'Yes — automatic re-check after each fix', 'Not advertised', 'Not advertised', 'Not advertised'],
            ['Starting price', `$${usPricing.monthly}/mo`, 'From $31/mo', 'From $29/mo', 'Not listed publicly'],
          ].map(([topic, ...cells]) => (
            <tr key={topic}><th scope="row">{topic}</th>{cells.map((c, i) => <td key={i} className={i === 0 ? 'cmp-us' : undefined} data-label={['Rankall', 'BrightLocal', 'Otterly.AI', 'Peec AI'][i]}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
    <span style={{fontSize:'13px',color:'#55556A',textAlign:'center'}}>Based on each company&apos;s public website, October 2026. Plans and features change — check their sites for current details.</span>
  </div>
</section>

{/* ===== V2: 26 FAQ ===== */}
<section className="sec sec-w">
  <div className="wrap" style={{display:'flex',flexDirection:'column',gap:'40px',maxWidth:'920px'}}>
    <div style={{display:'flex',flexDirection:'column',gap:'16px',alignItems:'center',textAlign:'center'}}>
      <span className="kicker">FAQ</span>
      <h2 className="h2">Frequently asked questions</h2>
      <p className="lede" style={{textAlign:'center',maxWidth:'640px'}}>Everything local businesses, professionals and agencies ask about Rankall.</p>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
      {faqs.map((f, i) => (
        <div key={f.q} className={f.open ? 'faqc faqc-open' : 'faqc'}>
          <button className="faqq" aria-expanded={f.open} onClick={f.toggle}>
            <span style={{display:'flex',alignItems:'baseline',gap:'16px'}}><span className="mono faqn">{String(i + 1).padStart(2, '0')}</span><span>{f.q}</span></span>
            <span style={css(f.iconStyle)} aria-hidden="true">+</span>
          </button>
          <p hidden={!f.open} className="faqa">{f.a}</p>
        </div>
      ))}
    </div>
    <p style={{margin:'0',textAlign:'center',color:'#55556A',fontSize:'16px'}}>Still have questions? <Link href="/contact" style={{color:'#1B17FF',fontWeight:'600'}}>Contact our team</Link></p>
  </div>
</section>

{/* ===== V2: 25 FINAL CTA — glow ===== */}
<section className="sec soft" style={{position:'relative',overflow:'hidden',paddingBottom:'calc(var(--sec-y) + 40px)'}}>
  <div aria-hidden="true" style={{position:'absolute',left:'50%',bottom:'-360px',width:'1200px',height:'600px',transform:'translateX(-50%)',background:'radial-gradient(closest-side,rgba(27,23,255,.35),rgba(27,23,255,0))',pointerEvents:'none'}}></div>
  <div className="wrap" style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:'48px'}}>
    <h2 className="h2" style={{maxWidth:'980px'}}>Find out if AI is sending customers to <span style={{color:'#1B17FF'}}>your competitor right now</span></h2>
    <form onSubmit={v2HandleScan} style={{display:'flex',gap: '8px',flexWrap:'wrap',padding:'6px',borderRadius:'999px',background:'#fff',border:'1px solid #EDEDF4',width:'100%',maxWidth:'600px',boxShadow:'0 20px 40px -24px rgba(10,10,20,.25)'}}>
      <label htmlFor="q3" style={{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0 0 0 0)'}}>Search how customers find businesses near you</label>
      <input id="q3" type="text" aria-label="Enter a business or search query" placeholder="Best dentist in Chicago" value={query} onChange={(e) => setQuery(e.target.value)} style={{flex:'1 1 200px',minWidth:'0',minHeight:'52px',padding: '0 24px',border:'0',borderRadius:'999px',background:'transparent',color:'#0A0A14',fontFamily:'inherit',fontSize:'16px'}}/>
      <button type="submit" className="btn btn-blue" disabled={isScanning} style={isScanning ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>{isScanning ? 'Scanning…' : 'Scan Free'} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
    </form>
    {scanError ? (
      <div role="alert" style={{ background: '#FDECEC', border: '1px solid #F5C6C6', color: '#8A1C1C', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, lineHeight: 1.5, width: '100%', maxWidth: '600px', textAlign: 'left' }}>
        {scanError}
      </div>
    ) : null}
    <span style={{fontSize:'14px',color:'#55556A'}}>Free scan · No credit card</span>
  </div>
</section>

{/* ===== V2: FOOTER (shared: components/SiteChrome.tsx) ===== */}
<SiteFooter onWatchDemo={() => setV2VideoOpen(true)} />

      {/* VIDEO MODAL */}
      {v2VideoOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setV2VideoOpen(false); }} style={{position:'fixed',inset:'0',background:'rgba(10,10,20,0.85)',zIndex:'9999',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px',backdropFilter:'blur(4px)'}}>
          <div style={{position:'relative',width:'100%',maxWidth:'720px'}}>
            <button onClick={() => setV2VideoOpen(false)} aria-label="Close video" style={{position:'absolute',top:'-48px',right:'0',background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',color:'#fff',width:'40px',height:'40px',borderRadius:'50%',fontSize: '16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><svg viewBox="0 0 384 512" width="16" height="16" fill="#0A0A14" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>
            <HomepageScanVideo />
          </div>
        </div>
      )}

        </>
      )}
      {/* SCANNING */}
      {step === 1 && (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: `3px solid ${BORDER}`, borderTop: `3px solid ${BLUE}`, borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' }} />
          <h2 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Scanning {PLATFORMS.length} AI platforms...</h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 32 }}>Checking {PLATFORMS.length * 5} recommendation opportunities for <strong style={{ color: NAVY }}>&quot;{query}&quot;</strong></p>
          {routingNotice && (
            <p style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#1E40AF', lineHeight: 1.5, margin: '0 auto 24px', maxWidth: 600, textAlign: 'left' }}>{routingNotice}</p>
          )}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: 4, marginBottom: 24 }}>
            <div style={{ height: 6, borderRadius: 8, background: BLUE, width: `${prog}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {PLATFORMS.map((pl, i) => (
              <div key={i} style={{ fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 999, background: active.includes(i) ? BLUE : BG, color: active.includes(i) ? '#fff' : GRAY, border: `1px solid ${active.includes(i) ? BLUE : BORDER}`, transition: 'all 0.3s' }}>
                {pl}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RESULTS */}
      {step === 2 && (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px', overflowX: 'hidden' }}>

          {/* Ticket 7: routing notice — e.g. a Professional-mode input that
              the Places tiebreaker routed to a Local Business scan. */}
          {routingNotice && (
            <div style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: 12, padding: '16px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#1E40AF', margin: 0, lineHeight: 1.5 }}>{routingNotice}</p>
            </div>
          )}

          {/* Plan ↔ scan-type mismatch — non-blocking guidance (results still show) */}
          {(() => {
            const np = normalizePlan(userPlan);
            const businessSeesPersonal = (np === 'business' || np === 'agency' || np === 'enterprise') && scanIntent === 'personal_pro';
            const personalSeesBusiness = np === 'personal_pro' && scanIntent === 'local';
            if (!businessSeesPersonal && !personalSeesBusiness) return null;
            const msg = businessSeesPersonal
              ? "This looks like a personal brand scan. You're on the Local Business plan — for personal brand tracking, consider Personal Brand."
              : "This looks like a business scan. You're on the Personal Brand plan — for local business tracking, consider Local Business.";
            return (
              <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '16px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#78350F', margin: '0 0 12px', lineHeight: 1.5 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="#B45309" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> {msg}</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <a href={scanId ? `/report/${scanId}` : '/dashboard'} style={{ background: '#fff', border: '1px solid #FCD34D', color: '#92400E', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    {businessSeesPersonal ? (<>View on Local Business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>) : (<>View on Personal Brand <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                  </a>
                  <a href="/pricing" style={{ background: PURPLE, color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    {businessSeesPersonal ? 'Switch to Personal Brand' : 'Switch to Local Business'}
                  </a>
                </div>
              </div>
            );
          })()}

          {/* Searched business visibility + competitor context */}
          {scanResults.length > 0 && (
            <div style={{ background: NAVY, borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: '#fff', animation: 'fadeSlideUp 0.6s ease-out forwards' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Your AI visibility</p>
              {scanSubjectMentions == null ? (
                <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.6, margin: 0 }}>
                  This search checked the category <strong style={{ color: '#fff' }}>{query}</strong>, not your business, so we don&apos;t have your visibility yet. Enter your business name below to see whether AI names you in these answers.
                </p>
              ) : (
              <div className="competitor-flex" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: scanSubjectMentions > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(220,38,38,0.15)', border: `1px solid ${scanSubjectMentions > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(220,38,38,0.3)'}`, borderRadius: 12, padding: '16px 24px', flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 36, fontWeight: 900, color: scanSubjectMentions > 0 ? '#22C55E' : RED, margin: 0, lineHeight: 1 }}>{scanSubjectMentions}</p>
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0' }}>of {PLATFORMS.length} platforms</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: scanSubjectMentions > 0 ? '#86EFAC' : '#FCA5A5', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scanSubjectName}</p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.6 }}>
                    {scanSubjectMentions === 0
                      ? <><strong style={{ color: '#fff' }}>{scanSubjectName}</strong> was not recommended by any AI platform for this search.</>
                      : <><strong style={{ color: '#fff' }}>{scanSubjectName}</strong> appears in {scanSubjectMentions} of {PLATFORMS.length} AI platforms.</>
                    }
                  </p>
                  {competitor && competitorMentions > 0 && scanSubjectMentions != null && (
                    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
                      {competitorMentions > scanSubjectMentions
                        ? <>Outranking you: <strong>{competitor}</strong> appears in {competitorMentions} of {PLATFORMS.length}</>
                        : competitorMentions === scanSubjectMentions
                          ? <>Tied with you: <strong>{competitor}</strong> also appears in {competitorMentions} of {PLATFORMS.length}</>
                          : <>You lead <strong>{competitor}</strong>: it appears in {competitorMentions} of {PLATFORMS.length}</>}
                    </p>
                  )}
                </div>
              </div>
              )}
            </div>
          )}

          {/* Queries */}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Scanned these {queries.length} customer search variations:</p>
            {queries.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, background: '#EEF0FF', borderRadius: 8, padding: '2px 8px', minWidth: 24, textAlign: 'center' }}>{i + 1}</span>
                <span style={{ fontSize: 14, color: NAVY, fontStyle: 'italic' }}>"{q}"</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: LGRAY, marginTop: 12, fontWeight: 600 }}>
              {queries.length} variations × {PLATFORMS.length} platforms = {totalOpp} total recommendation opportunities scanned
            </p>
          </div>

          {/* Results card */}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 13, color: LGRAY, marginBottom: 8, fontWeight: 600 }}>
              {/* ax7w: the opportunity/platform counts are the scan's own
                  subject only on a business-name scan; for a category
                  search they count the phrase, so show the submitted
                  business's own result or just the response count. */}
              {scannedBizName && scanMeta && scanMeta.totalOpportunities > 0
                ? <>Mentioned in {scanMeta.mentionedOpportunities} of {totalOpp} recommendation opportunities · Appeared on {mentionedCount} of {PLATFORMS.length} platforms</>
                : scanSubjectMentions != null && scanSubjectName
                  ? <>{scanSubjectName} appeared on {scanSubjectMentions} of {PLATFORMS.length} platforms · {scanResults.length} platforms responded</>
                  : <>{scanResults.length} platforms responded</>
              } · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>

            {scanMeta?.partial && scanMeta.scanReliable !== false && (
              <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                {scanMeta.failedPlatforms.length} {scanMeta.failedPlatforms.length === 1 ? 'platform' : 'platforms'} did not respond — {scanMeta.failedPlatforms.join(', ')} {scanMeta.failedPlatforms.length === 1 ? 'is' : 'are'} temporarily unavailable.
              </div>
            )}
            {scanMeta?.scanReliable === false && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, background: '#FEF2F2', border: '1px solid #EF4444', borderRadius: 8, padding: '8px 16px' }}>
                <p style={{ fontSize: 12, color: '#991B1B', margin: 0, flex: 1 }}>
                  {scanMeta.failedPlatforms.length} platforms did not respond — rescan for a complete picture.
                </p>
                <button
                  onClick={() => startScan({ forceRescan: true })}
                  disabled={isScanning}
                  style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Rescan now
                </button>
              </div>
            )}
            {scanMeta?.cached && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '8px 16px' }}>
                <p style={{ fontSize: 12, color: '#92400E', margin: 0, flex: 1 }}>
                  Cached result{scanMeta.cachedAt ? ` from ${new Date(scanMeta.cachedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}. Rescan for current data.
                </p>
                <button
                  onClick={() => startScan({ forceRescan: true })}
                  disabled={isScanning}
                  style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Rescan now
                </button>
              </div>
            )}

            {/* Business listing cards */}
            {extractingBiz && businesses.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: GRAY, padding: '16px 0' }}>
                <div style={{ width: 16, height: 16, border: `2px solid ${BORDER}`, borderTop: `2px solid ${BLUE}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Extracting the businesses AI recommended...</span>
              </div>
            )}

            {businesses.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Businesses AI recommended · ranked by how many platforms named them
                </p>
                <div style={{ background: '#EEF0FF', border: '1px solid #C9D4FF', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: BLUE, margin: 0, lineHeight: 1.55 }}>
                    The number on the right is how many of {PLATFORMS.length} AI platforms named each business. Even the top result here is invisible on the platforms that did not name it — appearing on 5 of {PLATFORMS.length} means you are missing from {PLATFORMS.length - 5} places customers are searching.
                  </p>
                </div>
                {businesses.map((biz, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: i === 0 ? '#FEF3C7' : '#EEF0FF', border: `1px solid ${i === 0 ? '#FCD34D' : '#C9D4FF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: i === 0 ? '#D97706' : BLUE }}>{i === 0 ? <svg viewBox="0 0 576 512" width="12" height="12" fill="#D97706" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg> : `#${i + 1}`}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{biz.name}</p>
                      <p style={{ fontSize: 12, color: LGRAY, margin: 0 }}>
                        {biz.location || ''}{biz.note ? `${biz.location ? ' · ' : ''}${biz.note}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 800, color: biz.mentions >= 4 ? GREEN : biz.mentions >= 2 ? AMBER : LGRAY, margin: 0, lineHeight: 1 }}>{biz.mentions}</p>
                      <p style={{ fontSize: 12, color: LGRAY, margin: '2px 0 0' }}>of {PLATFORMS.length}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Raw AI responses */}
            <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, marginTop: 4 }}>Raw AI responses</p>
            {scanResults.slice(0, 3).map((r, i) => (
              <div key={i} style={{ background: BG, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${BLUE}`, borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{r.platform}</span>
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: BLUE, fontFamily: 'inherit' }}
                  >
                    {expandedIdx === i ? '▲ Hide' : '▼ View response'}
                  </button>
                </div>
                {r.response && (
                  <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, fontStyle: 'italic', margin: 0 }}>
                    &quot;{expandedIdx === i ? r.response : r.response.slice(0, 140) + (r.response.length > 140 ? '...' : '')}&quot;
                  </p>
                )}
              </div>
            ))}
            {scanResults.length > 3 && (
              <p style={{ fontSize: 12, color: BLUE, fontWeight: 600, textAlign: 'center', marginTop: 8, cursor: 'pointer' }}>
                + {scanResults.length - 3} more platform responses in the full report
              </p>
            )}
          </div>

          {/* SIMULATOR TEASER — improvement roadmap preview */}
          {scanResults.length > 0 && (() => {
            const teaserFixes = [
              { id: 'faq_schema', title: 'FAQ Schema', fix_type: 'faq_schema' },
              { id: 'directory', title: 'Directories', fix_type: 'directory_citations' },
              { id: 'reviews', title: 'Reviews', fix_type: 'review_velocity' },
              { id: 'content', title: 'Content', fix_type: 'content_optimization' },
              { id: 'trust', title: 'Trust', fix_type: 'trust_signals' },
            ];
            // Every figure — score, capture rate, revenue gap — is driven by
            // the scan subject's OWN coverage (the assigned business, or the
            // business a business-name scan measured). ax7w: a category
            // search with no business yet has no own result — the phrase
            // count (~12/12) is never used; show the not-checked teaser.
            if (scanSubjectMentions == null) {
              return (
                <div style={{ background: W, border: `2px solid ${PURPLE}`, borderRadius: 16, padding: '24px 24px', marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Recommendation Simulator</p>
                  <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, margin: 0 }}>Your score and improvement roadmap need your own result. Enter your business name below — we haven&apos;t checked your business yet.</p>
                </div>
              );
            }
            const effectiveMentions = scanSubjectMentions;
            const currentScore = userBizMatch
              ? Math.round((userBizMatch.mentions / Math.max(1, scanResults.length)) * 100)
              : realScore;
            // Fall back to the viewer's country (not hardcoded US) so a UAE
            // viewer sees AED even before the scan resolves a country_code.
            const teaserCfg = getCountryConfig(scanCountry || country.code || 'US');
            const teaserSymbol = getRevenueSymbol(teaserCfg);
            // Use the industry the SERVER detected for this scan so the revenue
            // basis matches every other block (no more per-block re-guessing).
            const industryKey = detectedIndustry;
            const teaserAvgValue = industryAvgValue(industryKey, teaserCfg.code);
            // Canonical revenue model (lib/scoring): lostShare = responding
            // platforms that did not recommend you — same as the leak and
            // cost blocks, so all three revenue figures agree.
            const teaserRevenueGap = revenueGapForScan({
              mentionedCount: effectiveMentions,
              respondedPlatforms: scanResults.length,
              avgCustomerValue: teaserAvgValue,
              monthlyAIInquiries: teaserCfg.monthlyAIInquiries,
            });
            const sim = calculateSimulation({
              currentScore,
              industry: industryKey,
              city: '',
              countryCode: teaserCfg.code,
              competitorScore: null, // never invented (was a hardcoded 60)
              platformsCovered: scanResults.length,
              fixes: teaserFixes,
              revenueGap: teaserRevenueGap,
              revenueSymbol: teaserSymbol,
            });
            return (
              <div style={{ background: W, border: `2px solid ${PURPLE}`, borderRadius: 16, padding: '24px 24px', marginBottom: 16, boxShadow: '0 2px 10px rgba(124,58,237,0.1)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Recommendation Simulator</p>
                <h3 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>Want to see your improvement roadmap?</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: GRAY, margin: '0 0 2px' }}>Current score</p>
                    <p style={{ fontSize: 30, fontWeight: 900, color: NAVY, margin: 0, lineHeight: 1 }}>{currentScore}</p>
                  </div>
                  <span style={{ fontSize: 24, color: PURPLE, fontWeight: 800, display:'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="#7C3AED" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></span>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: GRAY, margin: '0 0 2px' }}>Projected (estimate)</p>
                    <p style={{ fontSize: 30, fontWeight: 900, color: GREEN, margin: 0, lineHeight: 1 }}>{sim.projectedScoreMid}</p>
                  </div>
                </div>
                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                  <p style={{ fontSize: 14, color: NAVY, margin: 0, fontWeight: 600 }}>
                    Estimated revenue recovery: <strong style={{ color: GREEN }}>{sim.revenueSymbol}{sim.revenueRecoveredAnnual.toLocaleString()}/year</strong>
                  </p>
                </div>
                <a href={scanId ? `/report/${scanId}` : '/signup'} style={{ display: 'inline-block', background: PURPLE, borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
                  See full projection <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                </a>
              </div>
            );
          })()}

          {/* BUSINESS CAPTURE — single unified input */}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            {!bizSubmitted ? (
              <>
                <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>
                  Do you see your business in these results?
                </p>
                <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>
                  Enter your business name to see your full AI visibility score and where you rank against competitors.
                </p>
                <div className="biz-input-row" style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="text"
                    aria-label="Business name" placeholder="e.g. Collins Law Firm"
                    value={bizName}
                    onChange={e => setBizName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleBizSubmit()}
                    autoFocus
                    style={{ flex: 1, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', fontSize: 14, color: NAVY, fontFamily: 'inherit', outline: 'none', background: BG }}
                  />
                  <button
                    onClick={handleBizSubmit}
                    disabled={enrichingBiz || !bizName.trim()}
                    style={{ background: enrichingBiz ? LGRAY : BLUE, border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: enrichingBiz ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  >
                    {enrichingBiz ? 'Looking up...' : 'See my score →'}
                  </button>
                </div>
                {enrichBizError && <p style={{ fontSize: 13, color: RED, marginTop: 8 }}>{enrichBizError}</p>}
              </>
            ) : (
              <>
                {ownBizMentions == null ? (
                  <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 12, padding: '24px 24px', marginBottom: 24 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Not checked yet</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 8 }}>We didn&apos;t check {bizName.trim()} yet</p>
                    <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, marginBottom: 16 }}>
                      This search measured the category &quot;{query}&quot;, and {bizName.trim()} wasn&apos;t among the businesses AI named in these answers. Run a business scan to get your own score, platform coverage and competitor gap.
                    </p>
                    <a href={`/?q=${encodeURIComponent(bizName.trim())}`} style={{ display: 'inline-block', background: BLUE, borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                      Run a business scan for {bizName.trim()} →
                    </a>
                  </div>
                ) : (<>
                {/* Score result — quick summary (ax7w: the submitted
                    business's OWN result — never the category-phrase
                    mentionedCount). */}
                {(() => {
                  const summaryMentions = ownBizMentions;
                  const summaryName = userBizMatch?.name ?? bizName;
                  const summaryLabel = summaryMentions === 0 ? 'Invisible on AI' : summaryMentions < 6 ? 'Barely visible on AI' : summaryMentions >= 8 ? 'Branded search only' : 'Partially visible on AI';
                  return (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '24px 24px', marginBottom: 24 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                        {summaryLabel}
                      </p>
                      <p style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 4 }}>{summaryName}</p>
                      <p style={{ fontSize: 36, fontWeight: 900, color: summaryMentions >= 8 ? AMBER : summaryMentions >= 6 ? AMBER : RED, marginBottom: 0, lineHeight: 1 }}>
                        {summaryMentions}<span style={{ fontSize: 16, color: GRAY, fontWeight: 600 }}> of {scanResults.length} AI platforms that answered</span>
                      </p>
                      {summaryMentions >= 8 && (
                        <p style={{ fontSize: 12, color: AMBER, fontWeight: 600, marginTop: 6 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" /></svg> This is your branded score — not your category visibility</p>
                      )}
                    </div>
                  );
                })()}

                {/* 1 — PAIN (context-aware: high branded score vs low category score) */}
                {(() => {
                  const userMentions = ownBizMentions;
                  const isHighBranded = userMentions >= 8;
                  // b0ff: the old copy computed missed = 11 - mentions and
                  // NAMED the first N platforms from a hardcoded list,
                  // claiming 'your competitor gets recommended instead of
                  // you' on each — counting platforms that never responded
                  // as competitor wins, and naming platforms that may have
                  // mentioned you or failed. Only platforms that RESPONDED
                  // without recommending you count as 'not recommended'.
                  const responded = scanMeta?.platformsCompleted ?? scanResults.length;
                  const notRecommended = Math.max(0, responded - userMentions);
                  const failedCount = scanMeta?.failedPlatforms?.length ?? 0;
                  if (isHighBranded) {
                    // Reframe: branded ≠ category visibility
                    const categoryHint = query.replace(/schaumburg|chicago|austin|dallas|new york|los angeles|houston|phoenix|miami|atlanta|boston|denver|seattle|portland|nashville|charlotte|san diego|san jose|san francisco|las vegas|minneapolis|st\.? louis|kansas city|cincinnati|pittsburgh|cleveland|columbus|indianapolis|milwaukee|salt lake|richmond|raleigh|memphis|louisville|hartford|buffalo|providence|oklahoma city|new orleans|tampa|orlando|jacksonville|tucson|mesa|fresno|sacramento|long beach|colorado springs|albuquerque|omaha|virginia beach|bakersfield|honolulu|anaheim|aurora|santa ana|corpus christi|riverside|lexington|stockton|henderson|st\. paul|pittsburgh/gi, '').replace(/\s+/g, ' ').trim();
                    return (
                      <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '24px 24px', marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: AMBER, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> This score doesn&apos;t mean what you think</p>
                        <p style={{ fontSize: 14, color: '#78350F', lineHeight: 1.75, marginBottom: 12 }}>
                          <strong>{userMentions}/{PLATFORMS.length} is your branded visibility</strong> — what AI says when someone already knows your name and searches for it directly.
                          That&apos;s the easy part. <strong>The real question is what happens when a stranger searches &quot;best {categoryHint || 'restaurant'} near me&quot; — and has never heard of you.</strong>
                        </p>
                        <div style={{ background: 'rgba(217,119,6,0.1)', borderRadius: 12, padding: '12px 16px' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: 0 }}>
                            New customers search by category, not by your business name. That&apos;s where competitors get chosen before you ever get a chance.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '24px 24px', marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: RED, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> What&apos;s happening right now</p>
                      <p style={{ fontSize: 14, color: '#7F1D1D', lineHeight: 1.7, marginBottom: 0 }}>
                        You appeared on <strong>{userMentions} of {responded}</strong> AI platforms that answered.
                        {responded === 0 ? (
                          <> No platforms responded for this scan, so this result is not a measurement — please rescan.</>
                        ) : notRecommended === 0 ? (
                          <> Every platform that responded recommended you.</>
                        ) : (
                          <> On <strong>{notRecommended} of the {responded} that responded</strong>, you weren&apos;t recommended when customers asked AI for <em>&quot;{query}&quot;</em>.{' '}
                          <strong>Every day this continues, customers are being sent elsewhere.</strong></>
                        )}
                        {failedCount > 0 && (<> {failedCount} platform{failedCount > 1 ? 's' : ''} didn&apos;t respond — rescan for a complete picture.</>)}
                      </p>
                    </div>
                  );
                })()}

                {/* 2 — COMPETITOR GAP */}
                {businesses.length > 0 && (() => {
                  const userMentions = ownBizMentions;
                  const topComp = businesses.find(b => b.name.toLowerCase() !== bizName.toLowerCase() && b.name !== userBizMatch?.name) || businesses[0];
                  if (!topComp) return null;
                  const compMentions = topComp.mentions;
                  const gap = compMentions - userMentions;
                  const BAR = 12;
                  const userFilled = Math.round((userMentions / PLATFORMS.length) * BAR);
                  const compFilled = Math.round((compMentions / PLATFORMS.length) * BAR);
                  return (
                    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '24px 24px', marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 16 }}>
                        {userMentions >= 8
                          ? 'This is just branded search — category search is the real battle'
                          : 'Your competitor is winning every search'}
                      </p>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span className="bar-label" style={{ fontSize: 12, fontWeight: 700, color: GRAY, width: 140, flexShrink: 0 }}>You ({bizName.slice(0, 16)}{bizName.length > 16 ? '…' : ''})</span>
                          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                            {Array.from({ length: BAR }).map((_, i) => (
                              <div key={i} style={{ flex: 1, height: 14, borderRadius: 8, background: i < userFilled ? RED : BORDER }} />
                            ))}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: RED, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>{userMentions}/{PLATFORMS.length}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span className="bar-label" style={{ fontSize: 12, fontWeight: 700, color: GRAY, width: 140, flexShrink: 0 }}>{topComp.name.slice(0, 16)}{topComp.name.length > 16 ? '…' : ''}</span>
                          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                            {Array.from({ length: BAR }).map((_, i) => (
                              <div key={i} style={{ flex: 1, height: 14, borderRadius: 8, background: i < compFilled ? GREEN : BORDER }} />
                            ))}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: GREEN, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>{compMentions}/{PLATFORMS.length}</span>
                        </div>
                      </div>
                      {gap > 0 && (
                        <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>
                          <strong style={{ color: NAVY }}>{topComp.name}</strong> is getting <strong style={{ color: RED }}>{gap} more AI recommendation{gap > 1 ? 's' : ''}</strong> than you every single time someone searches.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* 3 — REVENUE LEAK CALCULATOR (country + industry aware) */}
                {(() => {
                  // Assigned-business mentions (NOT mentionedCount, which scores
                  // the query phrase ~12/12) and the server-detected industry, so
                  // every revenue block agrees with the headline score.
                  const userMentions = ownBizMentions;
                  const industryKey = detectedIndustry;
                  const industryLabel = industryDisplayName(industryKey);
                  const revenueCountryCfg = scanCountry ? getCountryConfig(scanCountry) : country;
                  const avgValue = industryAvgValue(industryKey, revenueCountryCfg.code);
                  const revSym = getRevenueSymbol(revenueCountryCfg);
                  // Single source of truth (lib/scoring revenue model) — was
                  // missing the 0.1 multiplier, showing ~10x the report's number.
                  // b0fg: show the full chain (lostShare x inquiries x
                  // conversion x value) — the bare gap vs the displayed
                  // inputs (inquiries x value) looked 10x off because the
                  // 10% conversion assumption was unstated.
                  const leakBreakdown = revenueGapForScanBreakdown({
                    mentionedCount: userMentions,
                    respondedPlatforms: scanResults.length,
                    avgCustomerValue: avgValue,
                    monthlyAIInquiries: revenueCountryCfg.monthlyAIInquiries,
                  });
                  const monthlyLeak = leakBreakdown.gap;
                  const annualLeak = monthlyLeak * 12;
                  const leakColor = annualLeak > 100000 ? RED : AMBER;
                  return (
                    <div style={{ background: '#FEF2F2', border: `2px solid ${leakColor}`, borderRadius: 16, padding: '24px 24px', marginBottom: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: leakColor, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}><svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M0 112.5L0 422.3c0 18 10.1 35 27 41.3c87 32.5 174 10.3 261-11.9c79.8-20.3 159.6-40.7 239.3-18.9c23 6.3 48.7-9.5 48.7-33.4l0-309.9c0-18-10.1-35-27-41.3C462 15.9 375 38.1 288 60.3C208.2 80.6 128.4 100.9 48.7 79.1C25.6 72.8 0 88.6 0 112.5zM288 352c-44.2 0-80-43-80-96s35.8-96 80-96s80 43 80 96s-35.8 96-80 96zM64 352c35.3 0 64 28.7 64 64l-64 0 0-64zm64-208c0 35.3-28.7 64-64 64l0-64 64 0zM512 304l0 64-64 0c0-35.3 28.7-64 64-64zM448 96l64 0 0 64c-35.3 0-64-28.7-64-64z"/></svg> Revenue going to competitors</p>
                      <p style={{ fontSize: 40, fontWeight: 900, color: leakColor, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6 }}>
                        {revSym}{annualLeak.toLocaleString()}<span style={{ fontSize: 16, fontWeight: 600, color: GRAY }}>/year</span>
                      </p>
                      <p style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6, marginBottom: 6 }}>
                        That&apos;s about <strong>{revSym}{monthlyLeak.toLocaleString()}/month</strong> going to competitors due to your AI invisibility gap. Based on {industryLabel.toLowerCase()} averaging <strong>{revSym}{avgValue.toLocaleString()} per customer</strong> and your current visibility on {Math.min(userMentions, scanResults.length)} of {scanResults.length} AI platforms that answered.
                      </p>
                      <p style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.6, marginBottom: 0 }}>
                        How this is calculated: {Math.round(leakBreakdown.lostShare * 100)}% of {leakBreakdown.monthlyAIInquiries.toLocaleString()} monthly AI inquiries &times; {Math.round(REVENUE_CONVERSION_RATE * 100)}% become customers &times; {revSym}{leakBreakdown.avgCustomerValue.toLocaleString()} per customer.
                      </p>
                    </div>
                  );
                })()}

                {/* 4 — FULL COMPETITOR MARKET MAP */}
                {businesses.length > 0 && (() => {
                  const userMentions = ownBizMentions;
                  // ax7y: the user's entry was PREPENDED to the list
                  // regardless of mentions, so a 0-mention business ranked
                  // #1 above businesses with 4/12 and 3/12. Rank by
                  // mentions descending (name as a deterministic tiebreak).
                  const isUserEntry = (b: { name: string }) => bizName.trim() !== '' && businessNamesMatch(b.name, bizName);
                  const baseList = bizName.trim()
                    ? (() => {
                        const isInList = businesses.some(isUserEntry);
                        return isInList ? businesses : [{ name: bizName.trim(), platforms: [], mentions: userMentions, location: null, note: null }, ...businesses];
                      })()
                    : businesses;
                  const sortedEntries = [...baseList].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
                  const topMentions = sortedEntries[0]?.mentions ?? 1;
                  const userIdx = sortedEntries.findIndex(isUserEntry);
                  const userRank = userIdx + 1;
                  // Show the top 8, but always keep the user's own row
                  // visible (with its true rank) even if it falls outside
                  // the top 8 — otherwise the rank line would vanish.
                  const allEntries = sortedEntries.slice(0, 8);
                  if (userIdx >= 8) allEntries.push(sortedEntries[userIdx]);
                  const topPct = Math.round((topMentions / (PLATFORMS.length * allEntries.length)) * 100 * allEntries.length / (allEntries.reduce((s, b) => s + b.mentions, 0) || 1) * 100);
                  return (
                    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Your AI recommendation market ranking</p>
                      {bizName && userRank > 0 && (
                        <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>
                          You are ranked <strong style={{ color: userRank === 1 ? GREEN : RED }}>#{userRank} of {allEntries.length}</strong> businesses in your market
                          {topMentions > userMentions && <> · Top business owns <strong style={{ color: RED }}>{Math.round((topMentions / PLATFORMS.length) * 100)}%</strong> of AI recommendations</>}
                        </p>
                      )}
                      {allEntries.map((biz, i) => {
                        const isUser = bizName.trim() && businessNamesMatch(biz.name, bizName);
                        // ax7y: rank label is the true rank — the appended
                        // user row (outside the top 8) is not "#9" by index.
                        const rowRank = isUser && userIdx >= 8 ? userRank : i + 1;
                        const barPct = Math.round((biz.mentions / PLATFORMS.length) * 100);
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: isUser ? BLUE : LGRAY, width: 20, flexShrink: 0, textAlign: 'right' }}>#{rowRank}</span>
                            <span className="market-biz-name" style={{ fontSize: 12, fontWeight: isUser ? 700 : 500, color: isUser ? BLUE : NAVY, width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{biz.name}</span>
                            <div style={{ flex: 1, height: 10, background: BORDER, borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${barPct}%`, background: isUser ? BLUE : i === 0 && !isUser ? GREEN : LGRAY, borderRadius: 999, transition: 'width 0.5s ease' }} />
                            </div>
                            <span className="market-score" style={{ fontSize: 12, fontWeight: 700, color: isUser ? BLUE : GRAY, width: 36, flexShrink: 0, textAlign: 'right' }}>{biz.mentions}/{PLATFORMS.length}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* 5 — MONOPOLY SCORE */}
                {businesses.length > 0 && (() => {
                  const userMentions = ownBizMentions;
                  const topComp = businesses.find(b => !bizName || !businessNamesMatch(b.name, bizName));
                  const topMentions = topComp?.mentions ?? businesses[0]?.mentions ?? 1;
                  const monopoly = topMentions > 0 ? Math.min(100, Math.round((userMentions / topMentions) * 100)) : 100;
                  const cityHint = query.replace(/^(best|top)\s+/i, '').replace(/\s+(in|near|around)\s+.*$/i, '').trim() || 'your category';
                  let label = 'At Risk'; let mColor = RED; let mBg = '#FEF2F2'; let mBorder = '#FECACA';
                  if (monopoly >= 80) { label = 'Market Leader'; mColor = BLUE; mBg = '#EEF0FF'; mBorder = '#C9D4FF'; }
                  else if (monopoly >= 60) { label = 'Dominant'; mColor = GREEN; mBg = '#ECFDF5'; mBorder = '#A7F3D0'; }
                  else if (monopoly >= 30) { label = 'Competing'; mColor = AMBER; mBg = '#FFFBEB'; mBorder = '#FCD34D'; }
                  return (
                    <div style={{ background: mBg, border: `1.5px solid ${mBorder}`, borderRadius: 16, padding: '24px 24px', marginBottom: 12 }}>
                      <div className="monopoly-flex" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: mColor, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Market Monopoly Score</p>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 48, fontWeight: 900, color: mColor, letterSpacing: '-0.04em', lineHeight: 1 }}><CountUp value={monopoly} duration={1500} /></span>
                            <span style={{ fontSize: 16, color: LGRAY, fontWeight: 600 }}>/100</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: mColor, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '2px 12px' }}>{label}</span>
                          </div>
                        </div>
                        {topComp && (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: 12, color: LGRAY, marginBottom: 2 }}>Top competitor</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{topComp.name.slice(0, 20)}{topComp.name.length > 20 ? '…' : ''}</p>
                            <p style={{ fontSize: 12, color: topComp.mentions > userMentions ? RED : GREEN }}>{topComp.mentions}/12 platforms</p>
                          </div>
                        )}
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: 8, height: 8, marginBottom: 12, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${monopoly}%`, background: mColor, borderRadius: 8, transition: 'width 0.6s ease' }} />
                      </div>
                      <p style={{ fontSize: 13, color: mColor, fontWeight: 600, margin: 0 }}>
                        {monopoly >= 80 ? `You are the AI-recommended leader for ${cityHint}. Verification rescans after you apply fixes keep you ahead.` :
                         monopoly >= 60 ? `You are dominant but not locked in. ${topComp ? topComp.name : 'Competitors'} can close this gap.` :
                         monopoly >= 30 ? `Reach 80+ to own AI recommendations for ${cityHint}.` :
                         `Critical: Fix your AI signals now to prevent ${topComp ? topComp.name : 'competitors'} from locking up this market.`}
                      </p>
                    </div>
                  );
                })()}

                {/* 6 — WINDOW OF DOMINANCE */}
                {businesses.length > 0 && (() => {
                  const userMentions = ownBizMentions;
                  const topComp = businesses.find(b => !bizName || !businessNamesMatch(b.name, bizName));
                  const topMentions = topComp?.mentions ?? businesses[0]?.mentions ?? 0;
                  const gap = topMentions - userMentions;
                  if (userMentions >= topMentions) {
                    return (
                      <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 16, padding: '16px 24px', marginBottom: 12 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: GREEN, marginBottom: 4 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> You are leading — protect your position</p>
                        <p style={{ fontSize: 13, color: GRAY }}>You appear on more AI platforms than any competitor. Verification rescans after you apply fixes ensure you stay ahead as competitors try to close the gap.</p>
                      </div>
                    );
                  }
                  const urgency = gap > 6 ? { label: (<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Critical window</>), color: RED, bg: '#FEF2F2', border: '#FECACA' }
                    : gap > 3 ? { label: (<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Urgent window</>), color: AMBER, bg: '#FFFBEB', border: '#FCD34D' }
                    : { label: (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg> Act now</>), color: BLUE, bg: '#EEF0FF', border: '#C9D4FF' };
                  return (
                    <div style={{ background: urgency.bg, border: `1.5px solid ${urgency.border}`, borderRadius: 16, padding: '16px 24px', marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: urgency.color, marginBottom: 6 }}>{urgency.label}: {gap} platform{gap === 1 ? '' : 's'} behind the leader</p>
                      <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.65 }}>
                        {topComp ? <><strong>{topComp.name}</strong> currently appears on <strong>{topMentions} of {scanResults.length} AI platforms that answered</strong>. </> : ''}
                        The longer that gap stays open, the more AI answers in your area name them instead of you. <strong>This is your window to act.</strong>
                      </p>
                    </div>
                  );
                })()}

                {/* 7 — AI PLATFORM OWNERSHIP MAP */}
                {businesses.length > 0 && (() => {
                  const topComp = businesses.find(b => !bizName || !businessNamesMatch(b.name, bizName));
                  // ax7w: the business's OWN platforms (extracted entry, or
                  // the business-name scan's flags) — never the category
                  // phrase hits.
                  const userPlats = new Set(ownBizPlatforms ?? []);
                  const compPlats = new Set(topComp?.platforms ?? []);
                  return (
                    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Your AI platform ownership map</p>
                      <p style={{ fontSize: 12, color: LGRAY, marginBottom: 16 }}>Which AI platforms named you, and which named your top competitor, in this scan</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                        {PLATFORMS.map((pl, i) => {
                          const userHas = userPlats.has(pl);
                          const compHas = compPlats.has(pl);
                          let bg = BG; let border = BORDER; let icon: React.ReactNode = '—'; let subText = 'Opportunity'; let textColor = LGRAY;
                          if (userHas) { bg = '#ECFDF5'; border = '#A7F3D0'; icon = <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>; subText = 'You win here'; textColor = GREEN; }
                          else if (compHas) { bg = '#FEF2F2'; border = '#FECACA'; icon = <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>; subText = topComp ? `${topComp.name.split(' ')[0]} wins` : 'Competitor wins'; textColor = RED; }
                          return (
                            <div key={i} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '12px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: textColor }}>{icon}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{pl}</span>
                              </div>
                              <p style={{ fontSize: 12, color: textColor, margin: 0, fontWeight: 600 }}>{subText}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 8 — COST CALCULATOR (condensed, country + industry aware) */}
                {(() => {
                  // Assigned-business mentions (NOT mentionedCount), same
                  // industry and avg-value formula as the leak block — this is
                  // the "current gap" metric, consistent with the headline score.
                  const userMentions = ownBizMentions;
                  const industryKey = detectedIndustry;
                  const industryLabel = industryDisplayName(industryKey);
                  const revenueCfg = scanCountry ? getCountryConfig(scanCountry) : country;
                  const avgOrder = industryAvgValue(industryKey, revenueCfg.code);
                  const revSym = getRevenueSymbol(revenueCfg);
                  const visibilityRate = userMentions / Math.max(1, scanResults.length);
                  // Same single source of truth as the annual-leak block (includes
                  // the 0.1 damping) so both revenue figures agree.
                  const costBreakdown = revenueGapForScanBreakdown({
                    mentionedCount: userMentions,
                    respondedPlatforms: scanResults.length,
                    avgCustomerValue: avgOrder,
                    monthlyAIInquiries: revenueCfg.monthlyAIInquiries,
                  });
                  const monthlyCost = Math.round(costBreakdown.gap);
                  const captureRate = Math.round(visibilityRate * 100);
                  return (
                    <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '24px 24px', marginBottom: 24 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: AMBER, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M320 96L192 96 144.6 24.9C137.5 14.2 145.1 0 157.9 0L354.1 0c12.8 0 20.4 14.2 13.3 24.9L320 96zM192 128l128 0c3.8 2.5 8.1 5.3 13 8.4C389.7 172.7 512 250.9 512 416c0 53-43 96-96 96L96 512c-53 0-96-43-96-96C0 250.9 122.3 172.7 179 136.4c0 0 0 0 0 0s0 0 0 0c4.8-3.1 9.2-5.9 13-8.4zm84 88c0-11-9-20-20-20s-20 9-20 20l0 14c-7.6 1.7-15.2 4.4-22.2 8.5c-13.9 8.3-25.9 22.8-25.8 43.9c.1 20.3 12 33.1 24.7 40.7c11 6.6 24.7 10.8 35.6 14l1.7 .5c12.6 3.8 21.8 6.8 28 10.7c5.1 3.2 5.8 5.4 5.9 8.2c.1 5-1.8 8-5.9 10.5c-5 3.1-12.9 5-21.4 4.7c-11.1-.4-21.5-3.9-35.1-8.5c-2.3-.8-4.7-1.6-7.2-2.4c-10.5-3.5-21.8 2.2-25.3 12.6s2.2 21.8 12.6 25.3c1.9 .6 4 1.3 6.1 2.1c0 0 0 0 0 0s0 0 0 0c8.3 2.9 17.9 6.2 28.2 8.4l0 14.6c0 11 9 20 20 20s20-9 20-20l0-13.8c8-1.7 16-4.5 23.2-9c14.3-8.9 25.1-24.1 24.8-45c-.3-20.3-11.7-33.4-24.6-41.6c-11.5-7.2-25.9-11.6-37.1-15c0 0 0 0 0 0l-.7-.2c-12.8-3.9-21.9-6.7-28.3-10.5c-5.2-3.1-5.3-4.9-5.3-6.7c0-3.7 1.4-6.5 6.2-9.3c5.4-3.2 13.6-5.1 21.5-5c9.6 .1 20.2 2.2 31.2 5.2c10.7 2.8 21.6-3.5 24.5-14.2s-3.5-21.6-14.2-24.5c-6.5-1.7-13.7-3.4-21.1-4.7l0-13.9z"/></svg> Monthly revenue gap</p>
                      <p style={{ fontSize: 14, color: '#78350F', lineHeight: 1.7, marginBottom: 12 }}>
                        {industryLabel} in your area see an average of <strong>{revenueCfg.monthlyAIInquiries}+ customer inquiries from AI</strong> per month.
                        You&apos;re capturing roughly <strong>{captureRate}%</strong> of those —{' '}
                        {userMentions >= 8 ? <strong>but only for people who already know your name.</strong> : <strong>and that gap compounds every day.</strong>}
                      </p>
                      <div style={{ background: 'rgba(217,119,6,0.1)', borderRadius: 12, padding: '16px 16px', textAlign: 'center' }}>
                        <p style={{ fontSize: 30, fontWeight: 900, color: AMBER, marginBottom: 2 }}>{revSym}<CountUp value={monthlyCost} duration={2000} format />/month</p>
                        <p style={{ fontSize: 12, color: '#92400E' }}>estimated revenue gap (avg {revSym}{avgOrder.toLocaleString()} per customer)</p>
                        <p style={{ fontSize: 12, color: '#A16207', marginTop: 6 }}>How this is calculated: {Math.round(costBreakdown.lostShare * 100)}% of {costBreakdown.monthlyAIInquiries.toLocaleString()} monthly AI inquiries &times; {Math.round(REVENUE_CONVERSION_RATE * 100)}% become customers &times; {revSym}{costBreakdown.avgCustomerValue.toLocaleString()} per customer. Based on industry averages for your market. Actual results vary.</p>
                      </div>
                    </div>
                  );
                })()}

                </>)}
                {/* Google data — compact */}
                {enrichedGoogle && (
                  <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 16px', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Your Google Business profile</p>
                      <span style={{ fontSize: 12, fontWeight: 600, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '2px 8px' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Live</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Reviews', value: enrichedGoogle.reviewCount?.toLocaleString() || '—' },
                        { label: 'Rating', value: enrichedGoogle.rating ? (<><span>{enrichedGoogle.rating}</span><svg viewBox="0 0 576 512" width="12" height="12" fill="#D97706" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg></>) : '—' },
                        { label: 'Listing status', value: enrichedGoogle.operational ? 'Operational' : 'Not operational', color: enrichedGoogle.operational ? GREEN : RED },
                        { label: 'Photos', value: enrichedGoogle.photos?.toString() || '—' },
                      ].map((item, i) => (
                        <div key={i}>
                          <p style={{ fontSize: 16, fontWeight: 700, color: (item as any).color || NAVY }}>{item.value}</p>
                          <p style={{ fontSize: 12, color: LGRAY }}>{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4 — FIX #1 (fully free, generated content inline) */}
                {(() => {
                  const ql = query.toLowerCase();
                  const locationGuess = query.replace(/^.*\bin\b\s*/i, '').trim() || 'your area';
                  let fix1 = {
                    icon: <svg viewBox="0 0 576 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M256 32c-17.7 0-32 14.3-32 32l0 2.3 0 99.6c0 5.6-4.5 10.1-10.1 10.1c-3.6 0-7-1.9-8.8-5.1L157.1 87C83 123.5 32 199.8 32 288l0 64 512 0 0-66.4c-.9-87.2-51.7-162.4-125.1-198.6l-48 83.9c-1.8 3.2-5.2 5.1-8.8 5.1c-5.6 0-10.1-4.5-10.1-10.1l0-99.6 0-2.3c0-17.7-14.3-32-32-32l-64 0zM16.6 384C7.4 384 0 391.4 0 400.6c0 4.7 2 9.2 5.8 11.9C27.5 428.4 111.8 480 288 480s260.5-51.6 282.2-67.5c3.8-2.8 5.8-7.2 5.8-11.9c0-9.2-7.4-16.6-16.6-16.6L16.6 384z"/></svg>, title: 'Add FAQ Schema to your website', pts: fixEstimateLabel('faq_schema'), fixType: 'faq_schema',
                    desc: 'FAQ Schema is structured data that tells AI platforms like ChatGPT and Perplexity exactly which questions you answer, in a form they can quote.',
                  };
                  if (/hvac|heating|cooling|air.?condition|furnace/.test(ql))
                    fix1 = { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>, title: 'Add LocalBusiness JSON-LD', pts: fixEstimateLabel('local_business_schema'), fixType: 'local_business_schema', desc: 'LocalBusiness structured data states your services, service area, hours and contact details in a form AI platforms can read and verify when answering "best HVAC near me" queries.' };
                  else if (/lawyer|attorney|law firm|legal/.test(ql))
                    fix1 = { icon: <svg viewBox="0 0 640 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>, title: 'Add Attorney FAQ Schema', pts: fixEstimateLabel('faq_schema'), fixType: 'faq_schema', desc: 'Legal FAQ schema answers the questions potential clients ask in a structured form AI platforms can read and quote when they recommend lawyers.' };
                  else if (/dentist|dental|orthodon/.test(ql))
                    fix1 = { icon: <svg viewBox="0 0 448 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M186.1 52.1C169.3 39.1 148.7 32 127.5 32C74.7 32 32 74.7 32 127.5l0 6.2c0 15.8 3.7 31.3 10.7 45.5l23.5 47.1c4.5 8.9 7.6 18.4 9.4 28.2l36.7 205.8c2 11.2 11.6 19.4 22.9 19.8s21.4-7.4 24-18.4l28.9-121.3C192.2 323.7 207 312 224 312s31.8 11.7 35.8 28.3l28.9 121.3c2.6 11.1 12.7 18.8 24 18.4s20.9-8.6 22.9-19.8l36.7-205.8c1.8-9.8 4.9-19.3 9.4-28.2l23.5-47.1c7.1-14.1 10.7-29.7 10.7-45.5l0-2.1c0-55-44.6-99.6-99.6-99.6c-24.1 0-47.4 8.8-65.6 24.6l-3.2 2.8 19.5 15.2c7 5.4 8.2 15.5 2.8 22.5s-15.5 8.2-22.5 2.8l-24.4-19-37-28.8z"/></svg>, title: 'Add Dental Practice FAQ Schema', pts: fixEstimateLabel('faq_schema'), fixType: 'faq_schema', desc: 'Dental FAQ schema signals to AI that your practice answers the questions patients care about — insurance, procedures, pricing — in a form AI platforms can quote.' };
                  else if (/restaurant|food|pizza|sushi|cafe/.test(ql))
                    fix1 = { icon: <svg viewBox="0 0 448 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M416 0C400 0 288 32 288 176l0 112c0 35.3 28.7 64 64 64l32 0 0 128c0 17.7 14.3 32 32 32s32-14.3 32-32l0-128 0-112 0-208c0-17.7-14.3-32-32-32zM64 16C64 7.8 57.9 1 49.7 .1S34.2 4.6 32.4 12.5L2.1 148.8C.7 155.1 0 161.5 0 167.9c0 45.9 35.1 83.6 80 87.7L80 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-224.4c44.9-4.1 80-41.8 80-87.7c0-6.4-.7-12.8-2.1-19.1L191.6 12.5c-1.8-8-9.3-13.3-17.4-12.4S160 7.8 160 16l0 134.2c0 5.4-4.4 9.8-9.8 9.8c-5.1 0-9.3-3.9-9.8-9L127.9 14.6C127.2 6.3 120.3 0 112 0s-15.2 6.3-15.9 14.6L83.7 151c-.5 5.1-4.7 9-9.8 9c-5.4 0-9.8-4.4-9.8-9.8L64 16zm48.3 152l-.3 0-.3 0 .3-.7 .3 .7z"/></svg>, title: 'Add Restaurant Structured Data', pts: fixEstimateLabel('local_business_schema'), fixType: 'local_business_schema', desc: 'Restaurant structured data (menu, hours, cuisine type) gives AI platforms the facts they need when recommending where to eat, instead of guessing from scattered pages.' };
                  else if (/doctor|physician|medical|clinic/.test(ql))
                    fix1 = { icon: <svg viewBox="0 0 640 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M192 48c0-26.5 21.5-48 48-48L400 0c26.5 0 48 21.5 48 48l0 464-80 0 0-80c0-26.5-21.5-48-48-48s-48 21.5-48 48l0 80-80 0 0-464zM48 96l112 0 0 416L48 512c-26.5 0-48-21.5-48-48L0 320l80 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L0 288l0-64 80 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L0 192l0-48c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 48-80 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l80 0 0 64-80 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l80 0 0 144c0 26.5-21.5 48-48 48l-112 0 0-416 112 0zM312 64c-8.8 0-16 7.2-16 16l0 24-24 0c-8.8 0-16 7.2-16 16l0 16c0 8.8 7.2 16 16 16l24 0 0 24c0 8.8 7.2 16 16 16l16 0c8.8 0 16-7.2 16-16l0-24 24 0c8.8 0 16-7.2 16-16l0-16c0-8.8-7.2-16-16-16l-24 0 0-24c0-8.8-7.2-16-16-16l-16 0z"/></svg>, title: 'Add Medical Practice FAQ Schema', pts: fixEstimateLabel('faq_schema'), fixType: 'faq_schema', desc: 'Healthcare FAQ schema tells AI what conditions you treat, what insurance you accept, and what patients can expect, in a structured form AI platforms can quote.' };

                  async function loadFix1Content() {
                    setFix1Loading(true);
                    try {
                      const res = await fetch('/api/generate-fix', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fixType: fix1.fixType,
                          businessInput: bizName.trim() || query.trim(),
                          industry: ql.match(/dentist|dental/) ? 'dental' : ql.match(/hvac|heating/) ? 'hvac' : ql.match(/lawyer|attorney/) ? 'legal' : ql.match(/restaurant|food/) ? 'restaurant' : ql.match(/doctor|medical/) ? 'medical' : 'local business',
                          location: locationGuess,
                        }),
                      });
                      const data = await res.json();
                      if (data.success && data.content) setFix1Content(data.content);
                      else setFix1Content('// Could not generate content — please try again.');
                    } catch {
                      setFix1Content('// Could not generate content — please try again.');
                    }
                    setFix1Loading(false);
                  }

                  return (
                    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '3px 12px', fontSize: 12, fontWeight: 700, color: GREEN }}>Fix #1 — Free</span>
                        {fix1.pts && <span style={{ background: '#EEF0FF', border: '1px solid #C9D4FF', borderRadius: 8, padding: '3px 12px', fontSize: 12, fontWeight: 700, color: BLUE }}>{fix1.pts}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{fix1.icon}</span>
                        <div>
                          <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{fix1.title}</p>
                          <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7 }}>{fix1.desc}</p>
                        </div>
                      </div>

                      {/* Generated content — fully free, inline */}
                      {!fix1Content && !fix1Loading && (
                        <button
                          onClick={loadFix1Content}
                          style={{ background: GREEN, border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          View generated content <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                        </button>
                      )}
                      {fix1Loading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', color: GRAY }}>
                          <div style={{ width: 16, height: 16, border: `2px solid ${BORDER}`, borderTop: `2px solid ${GREEN}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          <span style={{ fontSize: 13 }}>Generating your personalized {fix1.title.toLowerCase()}…</span>
                        </div>
                      )}
                      {fix1Content && (
                        <div>
                          {/* Code block with copy button */}
                          <div style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '24px 24px', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Generated for: {bizName.trim() || query.trim()}
                              </span>
                              <button
                                onClick={() => { navigator.clipboard.writeText(fix1Content); setFix1Copied(true); setTimeout(() => setFix1Copied(false), 2000); }}
                                style={{ background: fix1Copied ? GREEN : BLUE, border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}
                              >
                                {fix1Copied ? (<>Copied! <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></>) : (<>Copy <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                              </button>
                            </div>
                            <pre style={{ fontSize: 13, color: '#EDEDF4', lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>
                              {fix1Content}
                            </pre>
                          </div>

                          {/* How to add to your site — platform tabs */}
                          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 24px' }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 12 }}>How to add this to your site</p>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                              {(['HTML Site', 'WordPress', 'Webflow / Squarespace', 'Shopify', 'Wix'] as const).map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => setFix1Tab(tab)}
                                  style={{
                                    background: fix1Tab === tab ? NAVY : BG,
                                    color: fix1Tab === tab ? '#fff' : GRAY,
                                    border: `1.5px solid ${fix1Tab === tab ? NAVY : BORDER}`,
                                    borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                  }}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>
                            {fix1Tab === 'HTML Site' && (
                              <ol style={{ paddingLeft: 18, margin: 0 }}>
                                {[
                                  'Copy the code above using the Copy → button.',
                                  'Open your HTML file in a text editor.',
                                  'Paste the code inside the <head> tag (before </head>).',
                                  'Save and re-upload the file to your server.',
                                ].map((step, i) => (
                                  <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                                ))}
                              </ol>
                            )}
                            {fix1Tab === 'WordPress' && (
                              <ol style={{ paddingLeft: 18, margin: 0 }}>
                                {[
                                  'Copy the code above using the Copy → button.',
                                  'In WordPress, go to Appearance → Theme File Editor (or use a plugin like Insert Headers and Footers).',
                                  "Open your theme's header.php and paste the code just before </head>.",
                                  'Click Update File to save.',
                                ].map((step, i) => (
                                  <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                                ))}
                              </ol>
                            )}
                            {fix1Tab === 'Webflow / Squarespace' && (
                              <ol style={{ paddingLeft: 18, margin: 0 }}>
                                {[
                                  'Copy the code above using the Copy → button.',
                                  'Webflow: go to Project Settings → Custom Code → paste into the Head Code section. Click Save.',
                                  'Squarespace: go to Settings → Advanced → Code Injection → paste into the Header section. Click Save.',
                                  'Publish your site for the changes to go live.',
                                ].map((step, i) => (
                                  <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                                ))}
                              </ol>
                            )}
                            {fix1Tab === 'Shopify' && (
                              <ol style={{ paddingLeft: 18, margin: 0 }}>
                                {[
                                  'Copy the code above using the Copy → button.',
                                  'In Shopify, go to Online Store → Themes → Edit Code.',
                                  'Open theme.liquid.',
                                  'Paste the code before the closing </head> tag.',
                                  'Click Save.',
                                ].map((step, i) => (
                                  <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                                ))}
                              </ol>
                            )}
                            {fix1Tab === 'Wix' && (
                              <ol style={{ paddingLeft: 18, margin: 0 }}>
                                {[
                                  'Copy the code above using the Copy → button.',
                                  'In Wix, go to Settings → Custom Code (in the Advanced section).',
                                  'Click + Add Custom Code, paste the code, set it to load in the <head>.',
                                  'Set "Add Code to Pages" to All Pages, then click Apply.',
                                ].map((step, i) => (
                                  <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5 — Fix #2 (blurred preview) + Fix #3-5 (locked) + CTA */}
                {(() => {
                  const fix2to5 = [
                    { icon: <svg viewBox="0 0 384 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>, title: 'Complete your LocalBusiness citation network', pts: fixEstimateLabel('citation_finder'), desc: 'Consistent listings on the directories AI platforms cross-reference to verify a business exists.' },
                    { icon: <svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>, title: 'Generate AI-optimized review responses', pts: fixEstimateLabel('review_response'), desc: null },
                    { icon: <svg viewBox="0 0 576 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M0 64C0 28.7 28.7 0 64 0L224 0l0 128c0 17.7 14.3 32 32 32l128 0 0 125.7-86.8 86.8c-10.3 10.3-17.5 23.1-21 37.2l-18.7 74.9c-2.3 9.2-1.8 18.8 1.3 27.5L64 512c-35.3 0-64-28.7-64-64L0 64zm384 64l-128 0L256 0 384 128zM549.8 235.7l14.4 14.4c15.6 15.6 15.6 40.9 0 56.6l-29.4 29.4-71-71 29.4-29.4c15.6-15.6 40.9-15.6 56.6 0zM311.9 417L441.1 287.8l71 71L382.9 487.9c-4.1 4.1-9.2 7-14.9 8.4l-60.1 15c-5.5 1.4-11.2-.2-15.2-4.2s-5.6-9.7-4.2-15.2l15-60.1c1.4-5.6 4.3-10.8 8.4-14.9z"/></svg>, title: 'Rewrite your website copy for AI citation', pts: fixEstimateLabel('content_optimizer'), desc: null },
                    { icon: <svg viewBox="0 0 640 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>, title: 'Build your Reddit presence for this category', pts: fixEstimateLabel('reddit_contribution'), desc: null },
                  ];
                  // While the plan is still resolving, show a skeleton — never flash
                  // the upgrade gate at a paid/admin user.
                  if (authLoading) {
                    return <div style={{ height: 200, background: '#1a1a2e', borderRadius: 8, marginBottom: 16 }} />;
                  }
                  // Paid/admin: no upgrade gate. Their real, generated fixes live on the
                  // full report (the homepage only ever carries placeholder teasers).
                  if (isPaid) {
                    return (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ background: NAVY, borderRadius: 16, padding: '24px 24px' }}>
                          <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> All your fixes are unlocked</p>
                          <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16, lineHeight: 1.6 }}>
                            Your plan includes every fix with generated code, ready to paste — plus verification rescans after you apply fixes. Open your full report to see all of them.
                          </p>
                          <a href={scanId ? `/report/${scanId}` : '/dashboard'} style={{ display: 'block', textAlign: 'center', background: BLUE, borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 4px 14px rgba(37,99,235,0.4)' }}>
                            View your full report <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                          </a>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div style={{ marginBottom: 16 }}>
                      {/* Fix #2 — blurred */}
                      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                          <span style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '3px 12px', fontSize: 12, fontWeight: 700, color: LGRAY }}>Fix #2</span>
                          {fix2to5[0].pts && <span style={{ background: '#EEF0FF', border: '1px solid #C9D4FF', borderRadius: 8, padding: '3px 12px', fontSize: 12, fontWeight: 700, color: BLUE }}>{fix2to5[0].pts}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                          <span style={{ fontSize: 20, flexShrink: 0 }}>{fix2to5[0].icon}</span>
                          <div>
                            <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{fix2to5[0].title}</p>
                            <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, filter: 'blur(4px)', userSelect: 'none' }}>{fix2to5[0].desc}</p>
                          </div>
                        </div>
                        <div className="fix2-cta" style={{ background: 'rgba(248,250,252,0.92)', borderRadius: 12, padding: '16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>
                            {userId ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg> Upgrade to unlock Fix #2</>) : (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg> Create free account to unlock Fix #2</>)}
                          </p>
                          <a href={userId ? '/pricing' : `/signup${scanId ? `?scanId=${scanId}` : ''}`} style={{ background: BLUE, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            {userId ? (<>Upgrade to Local Business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>) : (<>Create free account <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                          </a>
                        </div>
                      </div>

                      {/* Fix #3-5 — locked tiles */}
                      {fix2to5.slice(1).map((fix, i) => (
                        <div key={i} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '16px 24px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16, opacity: 0.7 }}>
                          <span style={{ fontSize: 24, flexShrink: 0 }}>{fix.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: LGRAY }}>Fix #{i + 3}</span>
                              {fix.pts && <span style={{ background: '#EEF0FF', border: '1px solid #C9D4FF', borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700, color: BLUE }}>{fix.pts}</span>}
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0, filter: 'blur(3px)', userSelect: 'none' }}>{fix.title}</p>
                          </div>
                          <span style={{ fontSize: 16, flexShrink: 0, display:'inline-flex' }}><svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg></span>
                        </div>
                      ))}

                      {/* CTA after seeing Fix #1 content */}
                      <div style={{ background: NAVY, borderRadius: 16, padding: '24px 24px', marginTop: 8 }}>
                        {userId ? (
                          <>
                            <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                              Unlock fixes #2–5 with Local Business
                            </p>
                            <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16, lineHeight: 1.6 }}>
                              Fixes #2–5 follow the same pattern — generated code, ready to paste. Upgrade to access all fixes and verification rescans after you apply them.
                            </p>
                            <a href="/pricing" style={{ display: 'block', textAlign: 'center', background: BLUE, borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 4px 14px rgba(37,99,235,0.4)', marginBottom: 12 }}>
                              Upgrade to Local Business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                            </a>
                            {scanId && (
                              <p style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
                                or <a href={`/report/${scanId}`} style={{ color: '#93C5FD', fontWeight: 600, textDecoration: 'none' }}>view your full report</a>
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                              Want fixes #2–5 with generated code?
                            </p>
                            <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16, lineHeight: 1.6 }}>
                              You just saw what Fix #1 can do. Fixes #2–5 follow the same pattern — generated code, ready to paste. Free account, no credit card.
                            </p>
                            <a href={`/signup${scanId ? `?scanId=${scanId}` : ''}`} style={{ display: 'block', textAlign: 'center', background: BLUE, borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 4px 14px rgba(37,99,235,0.4)', marginBottom: 12 }}>
                              Create your free account <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                            </a>
                            {scanId && (
                              <p style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
                                or <a href={`/report/${scanId}`} style={{ color: '#93C5FD', fontWeight: 600, textDecoration: 'none' }}>view limited report without account</a>
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* TRUST BADGES */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 32, padding: '24px 24px', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap', background: W }}>
        {[
          { icon: <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg>, text: 'SSL Encrypted' },
          { icon: <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8l0 378.1C394 378 431.1 230.1 432 141.4L256 66.8s0 0 0 0z"/></svg>, text: 'Data Protected' },
          { icon: <svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M64 32C28.7 32 0 60.7 0 96l0 32 576 0 0-32c0-35.3-28.7-64-64-64L64 32zM576 224L0 224 0 416c0 35.3 28.7 64 64 64l448 0c35.3 0 64-28.7 64-64l0-192zM112 352l64 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-64 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm112 16c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16z"/></svg>, text: 'Secure Payments' },
          { icon: <svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-19.3c-2.7 1.1-5.4 2-8.2 2.7l-60.1 15c-3 .7-6 1.2-9 1.4c-.9 .1-1.8 .2-2.7 .2l-64 0c-6.1 0-11.6-3.4-14.3-8.8l-8.8-17.7c-1.7-3.4-5.1-5.5-8.8-5.5s-7.2 2.1-8.8 5.5l-8.8 17.7c-2.9 5.9-9.2 9.4-15.7 8.8s-12.1-5.1-13.9-11.3L144 381l-9.8 32.8c-6.1 20.3-24.8 34.2-46 34.2L80 448c-8.8 0-16-7.2-16-16s7.2-16 16-16l8.2 0c7.1 0 13.3-4.6 15.3-11.4l14.9-49.5c3.4-11.3 13.8-19.1 25.6-19.1s22.2 7.8 25.6 19.1l11.6 38.6c7.4-6.2 16.8-9.7 26.8-9.7c15.9 0 30.4 9 37.5 23.2l4.4 8.8 8.9 0c-3.1-8.8-3.7-18.4-1.4-27.8l15-60.1c2.8-11.3 8.6-21.5 16.8-29.7L384 203.6l0-43.6-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM549.8 139.7c-15.6-15.6-40.9-15.6-56.6 0l-29.4 29.4 71 71 29.4-29.4c15.6-15.6 15.6-40.9 0-56.6l-14.4-14.4zM311.9 321c-4.1 4.1-7 9.2-8.4 14.9l-15 60.1c-1.4 5.5 .2 11.2 4.2 15.2s9.7 5.6 15.2 4.2l60.1-15c5.6-1.4 10.8-4.3 14.9-8.4L512.1 262.7l-71-71L311.9 321z"/></svg>, text: 'GDPR Compliant' },
          { icon: <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg>, text: 'Free Scan · No Card Needed' },
          { icon: <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>, text: '14-Day Money Back' },
        ].map((badge, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
            <span>{badge.icon}</span>
            <span>{badge.text}</span>
          </div>
        ))}
      </div>

      {/* STICKY BOTTOM BAR */}
      {stickyVisible && !stickyDismissed && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: W, borderTop: `1px solid ${BORDER}`, boxShadow: '0 -4px 24px rgba(0,0,0,0.08)', height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
          <span style={{ fontSize: 14, color: GRAY, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg> See how your AI visibility compares
          </span>
          <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ background: BLUE, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            Scan free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </button>
          <button onClick={dismissSticky} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: LGRAY, padding: '4px 8px', flexShrink: 0, lineHeight: 1, display:'inline-flex', alignItems:'center' }}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes heroGradient { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter','Helvetica Neue',Arial,sans-serif; overflow-x: hidden; }

        @media (max-width: 640px) {
          .how-it-works-steps { grid-template-columns: 1fr !important; gap: 28px !important; }
          .step-connector { display: none !important; }
          .hero-h1 { font-size: 36px !important; }
          .hero-search { flex-direction: column !important; }
          .hero-search input { width: 100% !important; }
          .hero-search button { width: 100% !important; border-radius: 12px !important; }
          .showcase-cards { height: 260px !important; }
          .showcase-side { display: none !important; }
          .grid-3 { grid-template-columns: 1fr !important; }
          .grid-4 { grid-template-columns: 1fr 1fr !important; }
          .use-case-grid { grid-template-columns: 1fr !important; padding: 20px !important; gap: 20px !important; }
          .goals-grid { grid-template-columns: 1fr !important; }

          .biz-input-row { flex-direction: column !important; }
          .biz-input-row input { width: 100% !important; }
          .biz-input-row button { width: 100% !important; }
          .bar-label { width: 70px !important; font-size: 10px !important; }
          .market-biz-name { width: 70px !important; font-size: 11px !important; }
          .market-score { width: 28px !important; font-size: 10px !important; }
          .fix2-cta { flex-direction: column !important; align-items: flex-start !important; }
          .fix2-cta a { width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
          .grid-4 > div { border-radius: 0 !important; border-left: 1.5px solid #EDEDF4 !important; }
          .grid-4 > div:first-child { border-radius: 16px 16px 0 0 !important; }
          .grid-4 > div:last-child { border-radius: 0 0 16px 16px !important; }
          /* Results page overflow fixes */
          pre { font-size: 11px !important; }
          .monopoly-flex { flex-direction: column !important; }
          .competitor-flex { flex-direction: column !important; }
          /* Chip row: horizontally scrollable with hidden scrollbar on mobile */
          .chip-row { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .chip-row::-webkit-scrollbar { display: none; }
          .chip-row { -ms-overflow-style: none; scrollbar-width: none; }
          /* Fix queue cards full width */
          .fix-card { width: 100% !important; box-sizing: border-box !important; }
          /* Platform tabs scroll on mobile */
          .platform-tabs { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .platform-tabs::-webkit-scrollbar { display: none; }
          /* Sticky bar font size */
          .sticky-bar-text { font-size: 12px !important; }
          /* Showcase dashboard: stack sidebar above content, single-column cards */
          .dash-body { flex-direction: column !important; }
          .dash-sidebar { width: 100% !important; }
          .dash-grid { grid-template-columns: 1fr !important; }
          .market-form { grid-template-columns: 1fr !important; }
        }

        @media (min-width: 641px) and (max-width: 1024px) {
          .hero-h1 { font-size: 46px !important; }
          .grid-3 { grid-template-columns: 1fr 1fr !important; }
          .showcase-side { display: none !important; }
          .showcase-cards { height: 280px !important; }
        }
      
        /* ===== V2 design system ===== */

body{margin:0;background:#FFFFFF}
a{color:#1B17FF;text-decoration:none}a:hover{color:#1310C4}
*{box-sizing:border-box}
.wrap{width:100%;max-width:1200px;margin:0 auto;padding:0 24px}
.mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
.h2{margin:0;font-size:36px;line-height:1.2;letter-spacing:-0.045em;font-weight:800;color:#0A0A14;text-wrap:balance}
.h2w{color:#FFFFFF}
.lede{margin:0;font-size:16px;line-height:1.6;color:#55556A;max-width:640px;text-wrap:pretty}
.ledew{color:#B4B4C8}
.kicker{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid #EDEDF4;background:#F6F6FB;font-family:var(--font-geist-mono),monospace;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#55556A}
.kicker::before{content:"";width:8px;height:8px;border-radius:2px;background:#1B17FF;transform:rotate(45deg)}
.kickerw{color:#B4B4C8;border-color:#2A2A44;background:#14142A}
.card{background:#FFFFFF;border:1px solid #EDEDF4;border-radius:16px;padding:28px}
.soft{background:#F6F6FB}
/* Section rhythm: one spacing value for every section (96px desktop -> 56px
   phone). Two neighbours on the same background share ONE gap instead of
   stacking two paddings (which left 240px empty bands). */
:root{--sec-y:clamp(56px,7vw,96px)}
.sec{padding-top:var(--sec-y);padding-bottom:var(--sec-y)}
.sec-w+.sec-w,.soft.sec+.soft.sec,.sec-d+.sec-d{padding-top:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;border:0;cursor:pointer;font-family:inherit;transition:transform .2s ease,background .2s ease;white-space:nowrap}
.btn-blue{background:#1B17FF;color:#fff;box-shadow:0 8px 24px -10px rgba(27,23,255,.7)}
.btn-blue:hover{background:#1310C4;color:#fff;transform:translateY(-1px)}
.btn-ink{background:#0A0A14;color:#fff}.btn-ink:hover{background:#25253A;color:#fff}
.btn-line{background:#fff;color:#0A0A14;border:1px solid #EDEDF4}.btn-line:hover{color:#0A0A14;border-color:#0A0A14}
.btn-white{background:#fff;color:#0A0A14}.btn-white:hover{color:#1B17FF}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid #EDEDF4;background:#fff;color:#2A2A3C;font-size:12px;font-weight:700}.chip img{flex-shrink:0}
.badge{width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex:none}
.navbtn{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;min-height:44px;padding:0 12px;border-radius:10px;background:transparent;border:0;color:#2A2A3C;font-family:inherit;font-size:15px;font-weight:500;cursor:pointer}
.navbtn:hover{background:#F2F2F8;color:#0A0A14}
.navlinks{display:flex}
.dot{width:8px;height:8px;border-radius:50%;background:#E5383B;animation:ping 2s infinite;flex:none}
@keyframes ping{0%{box-shadow:0 0 0 0 rgba(229,56,59,.45)}80%,100%{box-shadow:0 0 0 9px rgba(229,56,59,0)}}
.dots{background-image:radial-gradient(#D6D6E4 1px,transparent 1px);background-size:22px 22px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 85%);mask-image:linear-gradient(180deg,#000,transparent 85%)}
.marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}
.track{display:flex;gap:12px;width:max-content;animation:marq 40s linear infinite}
@keyframes marq{to{transform:translateX(-50%)}}
.row{opacity:0;animation:rin .5s ease forwards}
.row:nth-child(1){animation-delay:.3s}.row:nth-child(2){animation-delay:.6s}.row:nth-child(3){animation-delay:.9s}.row:nth-child(4){animation-delay:1.2s}.row:nth-child(5){animation-delay:1.5s}.row:nth-child(6){animation-delay:1.8s}
@keyframes rin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.late{opacity:0;animation:rin .6s ease 2.4s forwards}
.sweep{height:2px;background:linear-gradient(90deg,transparent,#1B17FF,transparent);animation:sw 2.4s ease-in-out infinite}
@keyframes sw{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
.grow{transform-origin:left;animation:gr 1.6s cubic-bezier(.2,.7,.2,1) both}
@keyframes gr{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.draw{stroke-dasharray:900;stroke-dashoffset:900;animation:dr 2.6s ease .4s forwards}
@keyframes dr{to{stroke-dashoffset:0}}
.bob{animation:bob 6s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.node{animation:gl 3s ease-in-out infinite}
@keyframes gl{0%,100%{opacity:.5}50%{opacity:1}}
.tab{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid transparent;background:transparent;color:#55556A;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}
.tab:hover{color:#0A0A14}
.cmp-wrap{overflow-x:auto;border-radius:16px;border:1px solid #EDEDF4;background:#fff;-webkit-overflow-scrolling:touch}
.cmp{width:100%;border-collapse:collapse;min-width:640px;font-size:15px;line-height:1.5}
.cmp4{min-width:860px}
.cmp th,.cmp td{padding:16px 20px;text-align:left;vertical-align:top;border-bottom:1px solid #EDEDF4}
.cmp tbody tr:last-child th,.cmp tbody tr:last-child td{border-bottom:0}
.cmp thead th{font-size:14px;font-weight:700;color:#0A0A14;background:#FBFBFE}
.cmp tbody th{font-weight:600;color:#0A0A14;width:22%}
.cmp td{color:#55556A}
.cmp .cmp-us{background:#F3F2FF;color:#0A0A14;font-weight:600}
.cmp thead .cmp-us{background:#1B17FF;color:#fff}
.cmp-yes,.cmp-no{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:12px;margin-right:10px;flex:none;vertical-align:-3px}
.cmp-yes{background:#E3F6EC;color:#0B6B37}.cmp-no{background:#FDECEC;color:#B4232A}
.faqc{border:1px solid #EDEDF4;border-radius:16px;background:#fff;padding:0 24px;transition:border-color .2s,box-shadow .2s}
.faqc-open{border-color:#DCDAFF;box-shadow:0 20px 40px -28px rgba(27,23,255,.35)}
.faqc .faqq{min-height:72px;padding:20px 0;font-size:18px}
.faqn{font-size:13px;color:#1B17FF;font-weight:600}
.faqa{margin:0;padding:0 48px 24px 45px;color:#55556A;font-size:16px;line-height:1.65}
@media (max-width:640px){
  .cmp-wrap{overflow:visible;border:0;background:transparent;border-radius:0}
  .cmp,.cmp4{min-width:0}
  .cmp thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .cmp,.cmp tbody,.cmp tr,.cmp th,.cmp td{display:block;width:auto}
  .cmp tr{background:#fff;border:1px solid #EDEDF4;border-radius:16px;overflow:hidden;margin-bottom:12px}
  .cmp tbody th{width:auto;padding:14px 16px 6px;border:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#1B17FF}
  .cmp td{display:flex;flex-direction:column;gap:2px;padding:10px 16px;border-bottom:1px solid #F0F0F6}
  .cmp td::before{content:attr(data-label);font-size:12px;font-weight:600;color:#8A8AA3}
  .cmp .cmp-us::before{color:#1B17FF}
  .cmp tbody tr:last-child td{border-bottom:1px solid #F0F0F6}
  .cmp tr td:last-child{border-bottom:0!important}
  .cmp-yes,.cmp-no{display:none}
}
@media (max-width:640px){.faqc{padding:0 16px}.faqc .faqq{font-size:16px}.faqa{padding:0 8px 20px 0}.cmp th,.cmp td{padding:14px 16px}}
.faqq{width:100%;min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:transparent;border:0;color:#0A0A14;font-family:inherit;font-size:19px;font-weight:600;letter-spacing:-0.01em;text-align:left;cursor:pointer;padding:20px 0}
.fcol a{color:#B4B4C8;font-size:15px}.fcol a:hover{color:#fff}
.ok{color:#0B6B37}.no{color:#B4232A}
@media (max-width:960px){.hsm{display:none}}
@media (max-width:1199px){.hsignup{display:none}}
@media (max-width:480px){.hlogo img{height:24px!important}.hcta{min-height:40px!important;padding:0 14px!important;font-size:14px!important}}
@media (max-width:1100px){.navlinks{display:none}.hnav{display:none}.hamburger{display:inline-flex!important}.mobilemenu{display:block!important}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.row,.late{opacity:1}.draw{stroke-dashoffset:0}}

      `}</style>
    </div>
  );
}
