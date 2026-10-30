'use client';

import { useState, useEffect, Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
import { useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import { computePredictedScoreLift, computeConfidence, buildEvidence, safeBusinessName, canonicalFixImpact, fixTypeEstimate, type ScanSignals } from '@/lib/fixIntelligence';
import { projectScore } from '@/lib/projection';
const supabase = getBrowserClient();

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const PURPLE = '#7C3AED';
const GRAY   = '#55556A';
const LGRAY  = '#5F5F78';

// ax8r: each priority fix carries its TOOL id. The progress dots used to
// compare applied[] (tool ids like 'faq') against the labels ('Add FAQ
// Schema') — they could never match, so no dot ever lit up.
const PRIORITY_FIXES = [
  { fix: 'Add FAQ Schema',            tool: 'faq' },
  { fix: 'Add LocalBusiness JSON-LD', tool: 'schema' },
  { fix: 'Respond to Google Reviews',  tool: 'review' },
  { fix: 'Build Reddit Presence',      tool: 'reddit' },
  { fix: 'Claim Directory Listings',   tool: 'directory' },
];

function industryFaqs(industry: string): { q: string; a: string }[] {
  const i = (industry || '').toLowerCase();
  if (i.includes('dent')) return [
    { q: 'What insurance plans do you accept?', a: 'We accept most major dental insurance plans and offer flexible payment options. Call us to confirm your specific coverage.' },
    { q: 'Do you offer emergency dental care?', a: 'Yes, we provide same-day emergency appointments for severe pain, broken teeth, and other urgent dental issues.' },
    { q: 'Are you accepting new patients?', a: 'Yes, we are currently welcoming new patients of all ages. Book your first visit online or by phone.' },
    { q: 'Do you offer teeth whitening?', a: 'Yes, we offer both in-office and take-home professional whitening treatments tailored to your goals.' },
    { q: 'How often should I get a dental checkup?', a: 'We recommend a checkup and cleaning every six months to maintain optimal oral health and catch issues early.' },
  ];
  if (i.includes('legal') || i.includes('law')) return [
    { q: 'Do you offer a free consultation?', a: 'Yes, we offer a free initial consultation to discuss your case and explain your options with no obligation.' },
    { q: 'What practice areas do you cover?', a: 'Our attorneys handle a focused set of practice areas. Contact us to confirm we can assist with your specific matter.' },
    { q: 'How are your fees structured?', a: 'Depending on the matter, we work on contingency, flat-fee, or hourly arrangements. We explain all costs upfront.' },
    { q: 'How long will my case take?', a: 'Timelines vary by case complexity. After reviewing your situation, we provide a realistic estimate of the process.' },
    { q: 'Are your attorneys licensed in this state?', a: 'Yes, all of our attorneys are fully licensed and in good standing to practice in this jurisdiction.' },
  ];
  if (i.includes('hvac') || i.includes('heat') || i.includes('cool') || i.includes('air')) return [
    { q: 'Do you offer emergency HVAC service?', a: 'Yes, we provide emergency repair service for heating and cooling breakdowns, including evenings and weekends.' },
    { q: 'What brands do you service?', a: 'We install and repair all major HVAC brands. Contact us with your system details and we will confirm.' },
    { q: 'Do you offer financing?', a: 'Yes, we offer flexible financing options on new system installations to fit a range of budgets.' },
    { q: 'Are you licensed and insured?', a: 'Yes, we are fully licensed, bonded, and insured for your protection and peace of mind.' },
    { q: 'What areas do you serve?', a: 'We serve the surrounding region. Call us with your address and we will confirm whether you are in our service area.' },
  ];
  if (i.includes('restaurant') || i.includes('cafe') || i.includes('food') || i.includes('dining')) return [
    { q: 'Do you take reservations?', a: 'Yes, we accept reservations online and by phone. Walk-ins are also welcome based on availability.' },
    { q: 'Do you offer delivery?', a: 'Yes, we offer delivery through our website and partner apps, plus pickup for online orders.' },
    { q: 'What are your hours?', a: 'Our current hours are listed on our website and Google profile. Hours may vary on holidays.' },
    { q: 'Do you have vegetarian, vegan, or gluten-free options?', a: 'Yes, our menu includes vegetarian, vegan, and gluten-free dishes. Please let us know about any allergies.' },
    { q: 'Do you offer catering?', a: 'Yes, we cater events of all sizes. Contact us with your date and headcount for a custom quote.' },
  ];
  if (i.includes('medical') || i.includes('doctor') || i.includes('clinic') || i.includes('health') || i.includes('physician')) return [
    { q: 'What insurance do you accept?', a: 'We accept most major health insurance plans. Call to verify that your specific plan is in-network.' },
    { q: 'Are you accepting new patients?', a: 'Yes, we are accepting new patients. You can schedule your first appointment online or by phone.' },
    { q: 'Do you offer telehealth visits?', a: 'Yes, we offer secure telehealth appointments for many visit types when an in-person exam is not required.' },
    { q: 'What are typical wait times?', a: 'We work to minimize wait times and offer same-day or next-day appointments for urgent needs.' },
    { q: 'What specialties do you offer?', a: 'Our providers cover a range of specialties. Contact us to confirm we can address your specific health needs.' },
  ];
  return [
    { q: 'What services do you offer?', a: 'We offer a full range of services. Contact us to discuss exactly what you need and how we can help.' },
    { q: 'What are your hours?', a: 'Our current hours are listed on our website and Google Business Profile. Hours may vary on holidays.' },
    { q: 'Where are you located?', a: 'You can find our address, map, and directions on our website and Google profile. We look forward to seeing you.' },
    { q: 'How much do your services cost?', a: 'Pricing depends on your specific needs. Contact us for a transparent, no-obligation quote.' },
    { q: 'How do I book an appointment?', a: 'You can book online or by phone. We will confirm your appointment and answer any questions you have.' },
  ];
}

function detectSchemaType(industry: string): string {
  const i = (industry || '').toLowerCase();
  if (i.includes('dent')) return 'DentalClinic';
  if (i.includes('legal') || i.includes('law')) return 'LegalService';
  if (i.includes('hvac') || i.includes('heat') || i.includes('cool') || i.includes('air') ||
      i.includes('plumb') || i.includes('roof') || i.includes('construct') || i.includes('contractor')) return 'HomeAndConstructionBusiness';
  if (i.includes('restaurant') || i.includes('cafe') || i.includes('food') || i.includes('dining')) return 'Restaurant';
  if (i.includes('medical') || i.includes('doctor') || i.includes('clinic') || i.includes('health') || i.includes('physician')) return 'MedicalClinic';
  return 'LocalBusiness';
}

function buildTools(businessName: string, location: string, competitor: string, scanId: string, industry: string, countryCode: string) {
  const loc = location || 'your area';
  const phone = 'YOUR_PHONE';
  const ind = (industry || '').toLowerCase();
  const indLabel = industry || 'business';
  const cc = (countryCode || 'US').toUpperCase();
  const citySlug = (location || 'YourCity').split(',')[0].trim().replace(/\s+/g, '');
  const indSlug = (industry || 'business').split(/[\s,/]+/)[0].toLowerCase();

  const faqs = industryFaqs(industry);
  const faqEntities = faqs.map(f => `    {\n      "@type": "Question",\n      "name": ${JSON.stringify(f.q)},\n      "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(f.a.replace(/\bus\b/i, businessName))} }\n    }`).join(',\n');
  const schemaType = detectSchemaType(industry);

  // Industry-flavored review templates
  const reviewFlavor =
    ind.includes('dent') || ind.includes('medical') || ind.includes('doctor') || ind.includes('health') ? 'care' :
    ind.includes('legal') || ind.includes('law') ? 'matter' :
    ind.includes('restaurant') || ind.includes('cafe') || ind.includes('food') ? 'visit' :
    ind.includes('hvac') || ind.includes('heat') ? 'service call' : 'experience';

  const citationSets: Record<string, { name: string; url: string; note: string }[]> = {
    US: [
      { name: 'Google Business Profile', url: 'business.google.com', note: 'Critical for all AI + maps queries' },
      { name: 'Yelp', url: 'biz.yelp.com', note: 'Cited by multiple AI platforms for local' },
      { name: 'Healthgrades', url: 'healthgrades.com/provider-login', note: 'Authority for medical/dental' },
      { name: 'BBB', url: 'bbb.org/get-accredited', note: 'Trust signal in authority queries' },
      { name: 'Zocdoc', url: 'zocdoc.com/join', note: 'Booking + visibility for healthcare' },
    ],
    GB: [
      { name: 'Google Business Profile', url: 'business.google.com', note: 'Critical for all AI + maps queries' },
      { name: 'NHS', url: 'nhs.uk/about-us/list-your-service', note: 'Authority for UK healthcare' },
      { name: 'Trustpilot', url: 'business.trustpilot.com', note: 'Widely cited UK review signal' },
      { name: 'Checkatrade', url: 'checkatrade.com/join', note: 'Authority for UK trades/home services' },
      { name: 'Yell', url: 'business.yell.com', note: 'Established UK local directory' },
    ],
  };
  const citations = citationSets[cc] || citationSets.US;
  const citationList = citations.map((c, idx) => `${idx + 1}. ${c.name} — ${c.note}\n   Claim: https://${c.url}`).join('\n\n');

  return [
    { id: 'faq',      icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3l58.3 0c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24l0-13.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1l-58.3 0c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, title: 'FAQ Schema Builder',       desc: 'Industry-specific FAQPage JSON-LD with the exact questions AI platforms cite for your category', color: BLUE,   output: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [\n${faqEntities}\n  ]\n}\n</script>` },
    { id: 'schema',   icon: <svg viewBox="0 0 576 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 32c-17.7 0-32 14.3-32 32l0 2.3 0 99.6c0 5.6-4.5 10.1-10.1 10.1c-3.6 0-7-1.9-8.8-5.1L157.1 87C83 123.5 32 199.8 32 288l0 64 512 0 0-66.4c-.9-87.2-51.7-162.4-125.1-198.6l-48 83.9c-1.8 3.2-5.2 5.1-8.8 5.1c-5.6 0-10.1-4.5-10.1-10.1l0-99.6 0-2.3c0-17.7-14.3-32-32-32l-64 0zM16.6 384C7.4 384 0 391.4 0 400.6c0 4.7 2 9.2 5.8 11.9C27.5 428.4 111.8 480 288 480s260.5-51.6 282.2-67.5c3.8-2.8 5.8-7.2 5.8-11.9c0-9.2-7.4-16.6-16.6-16.6L16.6 384z"/></svg>, title: 'LocalBusiness Schema',     desc: 'Complete JSON-LD schema typed for your industry — fill the YOUR_* placeholders before publishing', color: PURPLE, output: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "${schemaType}",\n  "name": "${businessName}",\n  "image": "YOUR_IMAGE_URL",\n  "address": {\n    "@type": "PostalAddress",\n    "streetAddress": "YOUR_STREET_ADDRESS",\n    "addressLocality": "${loc}",\n    "postalCode": "YOUR_POSTAL_CODE",\n    "addressCountry": "${cc}"\n  },\n  "telephone": "${phone}",\n  "openingHoursSpecification": [\n    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:00", "closes": "17:00" }\n  ],\n  "url": "YOUR_WEBSITE_URL",\n  "priceRange": "YOUR_PRICE_RANGE"\n}\n</script>\n\nNote: Replace every YOUR_* placeholder with real data. Never publish fabricated address, phone, or hours — incorrect NAP data hurts rankings.` },
    { id: 'review',   icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg>, title: 'Review Response Generator', desc: 'Five star-rated, industry-flavored response templates for every Google review',                  color: GREEN,  output: `Review response templates for ${businessName} (replace {businessName} and {phone}, edit to fit each ${reviewFlavor}):\n\n★★★★★ 5-STAR\n"Thank you so much for the kind words — this made the whole {businessName} team's day! We're thrilled your ${reviewFlavor} was a great one and we can't wait to see you again."\n\n★★★★☆ 4-STAR\n"Thank you for the great feedback! We're glad you had a positive ${reviewFlavor}. If there's anything we could have done to earn that fifth star, we'd love to hear it at {phone}."\n\n★★★☆☆ 3-STAR\n"Thanks for taking the time to review us. We're glad parts of your ${reviewFlavor} went well, and we'd genuinely like to improve the rest. Please reach out to {phone} so we can make it right."\n\n★★☆☆☆ 2-STAR\n"We're sorry your ${reviewFlavor} fell short of what you expected from {businessName}. Your feedback matters and we want to fix this — please contact us at {phone} so we can understand what happened."\n\n★☆☆☆☆ 1-STAR\n"We sincerely apologize that your ${reviewFlavor} did not meet the standard we hold ourselves to. This is not the experience we want for anyone. Please call {phone} and ask for the manager so we can make this right."` },
    { id: 'reddit',   icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c0 0 0 0 0 0s0 0 0 0s0 0 0 0c0 0 0 0 0 0l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z"/></svg>, title: 'Reddit Contribution Draft', desc: 'Three helpful, non-promotional drafts plus the subreddits where they belong',                    color: '#EA580C', output: `Suggested subreddits: r/${citySlug}, r/${indSlug}, r/AskReddit local threads, r/smallbusiness (for advice threads).\nRule: be genuinely helpful first. Mention ${businessName} only if directly asked, and disclose you're affiliated.\n\nDRAFT 1 — Answering "any recommendations in ${loc}?"\n"A few things worth checking when picking a ${indLabel} in ${loc}: do they respond to recent reviews, are their hours/pricing posted upfront, and do they answer the phone? Those three together usually tell you more than the star average. Happy to share what I've learned if you DM."\n\nDRAFT 2 — Answering a "how do I choose?" question\n"Honestly the biggest tell is recent reviews, not the headline rating. Read the last 10 and look for patterns in how they handle problems. For a ${indLabel} specifically, also ask about ${reviewFlavor === 'care' ? 'insurance and emergency availability' : 'turnaround time and whether quotes are free'} before you commit."\n\nDRAFT 3 — Sharing local knowledge\n"For anyone new to ${loc} looking for a ${indLabel}: a lot of good local spots don't market well online, so don't only go by who ranks first. Call a couple, ask a specific question, and see who's actually helpful. That's been the best filter for me."` },
    { id: 'content',  icon: <svg viewBox="0 0 576 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 64C0 28.7 28.7 0 64 0L224 0l0 128c0 17.7 14.3 32 32 32l128 0 0 125.7-86.8 86.8c-10.3 10.3-17.5 23.1-21 37.2l-18.7 74.9c-2.3 9.2-1.8 18.8 1.3 27.5L64 512c-35.3 0-64-28.7-64-64L0 64zm384 64l-128 0L256 0 384 128zM549.8 235.7l14.4 14.4c15.6 15.6 15.6 40.9 0 56.6l-29.4 29.4-71-71 29.4-29.4c15.6-15.6 40.9-15.6 56.6 0zM311.9 417L441.1 287.8l71 71L382.9 487.9c-4.1 4.1-9.2 7-14.9 8.4l-60.1 15c-5.5 1.4-11.2-.2-15.2-4.2s-5.6-9.7-4.2-15.2l15-60.1c1.4-5.6 4.3-10.8 8.4-14.9z"/></svg>, title: 'Content Optimizer',         desc: 'Meta description, Open Graph, Twitter Card, and a full blog outline in one place',                color: AMBER,  output: `=== 1. META DESCRIPTION (155-160 chars) ===\n${businessName} — trusted ${indLabel} in ${loc}. Book online or call ${phone} for fast, friendly service. New customers welcome today.\n\n=== 2. OPEN GRAPH TAGS ===\n<meta property="og:title" content="${businessName} | ${indLabel} in ${loc}" />\n<meta property="og:description" content="Trusted ${indLabel} serving ${loc}. Book online or call ${phone}." />\n<meta property="og:image" content="YOUR_IMAGE_URL" />\n<meta property="og:type" content="website" />\n<meta property="og:url" content="YOUR_WEBSITE_URL" />\n\n=== 3. TWITTER CARD ===\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${businessName} | ${indLabel} in ${loc}" />\n<meta name="twitter:description" content="Trusted ${indLabel} serving ${loc}. Book online or call ${phone}." />\n<meta name="twitter:image" content="YOUR_IMAGE_URL" />\n\n=== 4. BLOG POST OUTLINE ===\nTarget keywords: "${indLabel} ${loc}", "best ${indLabel} near me", "${indLabel} ${citySlug}"\n\nH1: How to Choose the Right ${indLabel} in ${loc}\n  H2: What to Look For in a Local ${indLabel}\n    H3: Credentials and reviews that actually matter\n    H3: Questions to ask before you book\n  H2: Why ${loc} Residents Choose ${businessName}\n    H3: Our approach and what sets us apart\n  H2: Frequently Asked Questions\n    H3: ${faqs[0].q}\n    H3: ${faqs[1].q}\n  H2: Ready to Get Started? (CTA — call ${phone} or book online)` },
    { id: 'citations', icon: <svg viewBox="0 0 640 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>, title: 'Citation Finder',          desc: 'The directories AI platforms cite for your country — with claim links and a NAP note',           color: RED,    output: `Top citation sources for ${cc} (claim each one):\n\n${citationList}\n\n=== NAP CONSISTENCY NOTE ===\nUse the EXACT same Name, Address, and Phone (NAP) on every listing — character for character. "${businessName}" must be spelled identically everywhere, the address format must match (e.g. "St" vs "Street" consistently), and the phone number format must match. Inconsistent NAP data confuses search engines and AI platforms and directly lowers your trust score.` },
    { id: 'directory', icon: <svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M192 0c-41.8 0-77.4 26.7-90.5 64L64 64C28.7 64 0 92.7 0 128L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64l-37.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM72 272a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm104-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zM72 368a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm88 0c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16z"/></svg>, title: 'Directory Submitter',      desc: 'Step-by-step claim guide for your top 5 directories with profile text to paste',                color: GREEN,  output: `Directory submission guide for ${businessName}. Paste this profile text where each directory asks for a description:\n\nPROFILE TEXT TO PASTE:\n"${businessName} is a trusted ${indLabel} serving ${loc} and the surrounding area. We're focused on reliable, friendly service and welcome new customers. Call ${phone} or book online to get started."\n\n${citations.map((c, idx) => `STEP ${idx + 1} — ${c.name} (${c.note})\n  a) Go to https://${c.url}\n  b) Search for "${businessName}" and claim it (or create a new listing)\n  c) Verify ownership via phone/email/postcard\n  d) Paste the profile text above and add real hours, photos, and categories\n  e) Save and publish`).join('\n\n')}\n\nFinish: respond to every existing review within 24 hours.` },
    { id: 'competitive', icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, title: 'Competitor Analysis',    desc: 'Side-by-side vs your competitor — what to copy and the gaps to exploit',                        color: PURPLE, output: `SIDE-BY-SIDE: ${businessName} vs ${competitor || 'your top competitor'}\n\nWe have NOT measured ${competitor || 'your competitor'}'s schema, review cadence, directory listings, or community presence — this tool does not scan competitors, so any such table would be invented. Use the checklist below to check them yourself (each takes under a minute).\n\n=== WHAT TO CHECK ON ${((competitor || 'them') as string).toUpperCase()} ===\n[ ] FAQ schema — view-source their homepage, search for "FAQPage".\n[ ] LocalBusiness / ${schemaType} schema — view-source, search for "@type".\n[ ] Review response cadence — read their last 10 Google reviews: do they reply, and how fast?\n[ ] Directory listings — search their exact business name; count where they appear.\n[ ] Reddit/community presence — search "site:reddit.com \"${(competitor || 'competitor').toLowerCase()}\"".\n\n=== GENERAL PLAYS (suggestions, not findings) ===\n1. Match or beat their review-reply speed and tone.\n2. Replicate any FAQ/${schemaType} schema they expose.\n3. Be listed everywhere they are, plus one more directory.\n\n=== GAPS TO EXPLOIT ===\n• Most local ${indLabel}s neglect Reddit and video — get there first.\n• Industry-specific FAQ schema is rare — your FAQ tool gives you an edge.\n• Fast, personal review responses still differentiate. Reply within hours.\n\nFor measured competitor data, run a competitor scan from the Competitor page.` },
    { id: 'outreach', icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>, title: 'Press Outreach Templates',  desc: 'Three ready pitches — local news, industry publication, and a HARO response',                   color: BLUE,   output: `=== TEMPLATE 1 — LOCAL NEWS PITCH ===\nSubject: Local ${indLabel} story idea for [PUBLICATION] readers in ${loc}\n\nHi [EDITOR NAME],\n\nI run ${businessName}, a ${indLabel} here in ${loc}. I'm seeing [LOCAL TREND OR PROBLEM] affect a lot of people locally, and I think your readers would benefit from a practical breakdown.\n\nI'd be glad to provide expert commentary, data, or [SPECIFIC ANGLE]. Would a quick call this week work?\n\nBest,\n[YOUR NAME], ${businessName} — ${phone}\n\n=== TEMPLATE 2 — INDUSTRY PUBLICATION PITCH ===\nSubject: Contributed article: [TOPIC] for [PUBLICATION]\n\nHi [EDITOR NAME],\n\nI'm [YOUR NAME] of ${businessName}, a ${indLabel} in ${loc}. I'd like to contribute a ~[WORD COUNT]-word piece on [SPECIFIC INDUSTRY TOPIC], drawing on [YEARS] years of hands-on experience.\n\nProposed angle: [ONE-LINE THESIS]. Happy to send a full outline. Is this a fit for your editorial calendar?\n\nThanks,\n[YOUR NAME] — ${phone}\n\n=== TEMPLATE 3 — HARO RESPONSE ===\nSubject: Re: [QUERY TITLE] — expert source ([INDUSTRY])\n\nHi [REPORTER NAME],\n\nResponding to your query on [TOPIC]. I'm [YOUR NAME], [TITLE] at ${businessName}, a ${indLabel} in ${loc}.\n\n[2-3 SENTENCE QUOTABLE ANSWER WITH A SPECIFIC NUMBER OR EXAMPLE].\n\nHappy to expand or provide data. Bio: [ONE LINE]. Reachable at ${phone}.\n\nBest,\n[YOUR NAME]` },
    { id: 'video',    icon: <svg viewBox="0 0 576 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 128C0 92.7 28.7 64 64 64l256 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64L64 448c-35.3 0-64-28.7-64-64L0 128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2l0 256c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 337.1l0-17.1 0-128 0-17.1 14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z"/></svg>, title: 'Video Script Generator',    desc: 'A 1-minute TikTok script and a 3-minute YouTube script — hook first, CTA last',                 color: RED,    output: `=== 1-MINUTE TIKTOK SCRIPT ===\n[0-3s] HOOK: "Before you pick a ${indLabel} in ${loc}, watch this — most people get this wrong."\n[3-15s] "Number one: check how fast they reply to reviews. It tells you exactly how they'll treat you."\n[15-30s] "Number two: are their hours, pricing, and contact info easy to find? If you have to dig, that's a red flag."\n[30-45s] "Number three: read the last 10 reviews, not the star average. Look for patterns in how problems get handled."\n[45-55s] "Do those three things and you'll skip the headaches."\n[55-60s] CTA: "${businessName} in ${loc} — link in bio to book today."\n\n=== 3-MINUTE YOUTUBE SCRIPT ===\n[0-10s] HOOK: "Choosing the wrong ${indLabel} in ${loc} can cost you time and money. In the next three minutes I'll show you how to choose the right one."\n[10-40s] INTRO: "I'm [YOUR NAME] from ${businessName}. I've worked in this field for [YEARS] years, and I'm going to give you the same checklist I'd give a friend."\n[40s-1:20] POINT 1 — Reviews: "Don't trust the star average alone. Read recent reviews and watch how the business responds to criticism. A great ${indLabel} owns mistakes and fixes them."\n[1:20-2:00] POINT 2 — Transparency: "Good businesses make hours, pricing, and credentials easy to find. If basic info is hidden, expect surprises later."\n[2:00-2:40] POINT 3 — Fit: "Call and ask one specific question${reviewFlavor === 'care' ? ', like whether they take your insurance' : ', like whether quotes are free'}. How they handle that one call predicts the whole relationship."\n[2:40-3:00] CTA: "If you're in ${loc} and want a ${indLabel} that does all three, reach out to ${businessName} at ${phone} or the link below. Like and subscribe for more local tips."` },
    { id: 'knowledge', icon: <svg viewBox="0 0 576 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>, title: 'Knowledge Panel Guide',    desc: 'Step-by-step Google Knowledge Panel + Wikidata entity setup with 15 entity-building directories', color: '#0EA5E9', output: `=== GOOGLE KNOWLEDGE PANEL — STEP BY STEP ===\n1. Establish ${businessName} as an entity: consistent name everywhere (NAP), an official website with About page, and an Organization schema.\n2. Create/verify your Google Business Profile (business.google.com).\n3. Build authoritative mentions: news articles, directories, and a Wikidata entry (below).\n4. Once Google shows a panel, click "Claim this knowledge panel" and verify via your verified GBP or social accounts.\n5. Suggest edits through the panel once verified.\n\n=== WIKIDATA ENTITY TEMPLATE ===\nLabel: ${businessName}\nDescription: ${indLabel} in ${loc}\nStatements to add:\n  • instance of (P31): business / organization\n  • industry (P452): ${indLabel}\n  • headquarters location (P159): ${loc}\n  • official website (P856): YOUR_WEBSITE_URL\n  • inception (P571): YOUR_FOUNDING_YEAR\nReference every statement with a source URL (your site, a news article, or a directory).\n\n=== ENTITY DESCRIPTION (paste on your About page) ===\n"${businessName} is a ${indLabel} based in ${loc}. The company provides [CORE SERVICES] to customers across the ${loc} area and is known for [DISTINGUISHING TRAIT]."\n\n=== 15 ENTITY-BUILDING DIRECTORIES ===\n1. Google Business Profile  2. Wikidata  3. Crunchbase  4. LinkedIn Company Page\n5. Facebook Business Page  6. Bing Places  7. Apple Business Connect  8. Yelp\n9. BBB  10. Chamber of Commerce  11. Better local newspaper directory  12. Industry association directory\n13. Foursquare  14. Yellow Pages  15. Trustpilot` },
    { id: 'gbp',      icon: <svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>, title: 'Google Business Profile Optimizer', desc: 'Full GBP description, AI-optimized services, posting schedule, Q&A, and photo plan',            color: '#16A34A', output: `=== GBP BUSINESS DESCRIPTION (750 char max) ===\n"${businessName} is a trusted ${indLabel} serving ${loc} and surrounding communities. We focus on dependable, friendly service and treat every customer like a neighbor. New customers are always welcome — call ${phone} or book online. [Add 1-2 sentences on what makes you different, your experience, and your core services.]"\n\n=== AI-OPTIMIZED SERVICE LIST ===\nAdd each service as its own GBP service item with a short description containing "${indLabel} ${loc}":\n• [Service 1] in ${loc}\n• [Service 2] in ${loc}\n• [Service 3] in ${loc}\n• Emergency / same-day [service] (if applicable)\n• Free consultation / free quote (if applicable)\n\n=== 3-POSTS-PER-WEEK SCHEDULE ===\nMonday — Offer/Update post: a current promo or "now booking" with a CTA button.\nWednesday — Educational post: answer one common customer question (reuse your FAQ).\nFriday — Proof post: a review highlight, before/after, or photo of recent work.\n\n=== Q&A TO ADD (owner-seeded, then answer) ===\n${industryFaqs(industry).slice(0, 4).map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}\n\n=== PHOTO CATEGORIES TO UPLOAD ===\nLogo · Cover photo · Exterior (storefront/signage) · Interior · Team/staff · Work/products in action · Before & after` },
    { id: 'bio',      icon: <svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M192 0C139 0 96 43 96 96l0 160c0 53 43 96 96 96s96-43 96-96l0-160c0-53-43-96-96-96zM64 216c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 89.1 66.2 162.7 152 174.4l0 33.6-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l72 0 72 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0 0-33.6c85.8-11.7 152-85.3 152-174.4l0-40c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 70.7-57.3 128-128 128s-128-57.3-128-128l0-40z"/></svg>, title: 'AI-Optimized Bio',          desc: '150-word bio, 500-word bio, LinkedIn summary, credentials, and topics to own',                  color: '#9333EA', output: `=== 150-WORD BIO ===\n[YOUR NAME] is the [TITLE] behind ${businessName}, a ${indLabel} based in ${loc}. With [X] years of experience, [YOUR NAME] helps [TARGET AUDIENCE] with [CORE SERVICE/OUTCOME]. Known for [DISTINGUISHING TRAIT], [YOUR NAME] has [NOTABLE ACHIEVEMENT OR CREDENTIAL]. They are passionate about [TOPIC] and frequently share insights on [PLATFORM]. Based in ${loc}, [YOUR NAME] works with clients across the region and is available for [CONSULTATIONS / SPEAKING / MEDIA]. Reach out at ${phone}.\n\n=== 500-WORD BIO ===\n[Open with a hook about YOUR NAME and the problem they solve.] As [TITLE] of ${businessName} in ${loc}, [YOUR NAME] has spent [X] years mastering ${indLabel}. [Paragraph 2: career path and how they got here.] [Paragraph 3: philosophy and what makes their approach different.] [Paragraph 4: notable results, clients, credentials, press, or speaking.] [Paragraph 5: personal note and what they care about.] Today, [YOUR NAME] continues to [CURRENT FOCUS] from ${loc}, and welcomes connections at ${phone}. (Replace bracketed fields; aim for ~500 words.)\n\n=== LINKEDIN SUMMARY ===\n"${indLabel} expert | Founder of ${businessName} | ${loc}\nI help [AUDIENCE] [ACHIEVE OUTCOME]. Over [X] years I've [KEY ACHIEVEMENT]. At ${businessName} we [WHAT YOU DO]. Let's connect if you're interested in [TOPIC]. 📩 ${phone}"\n\n=== KEY CREDENTIALS (list yours) ===\n• [License / certification]\n• [Years of experience]\n• [Awards or recognition]\n• [Notable clients or projects]\n• [Education or affiliations]\n\n=== TOPICS TO BE KNOWN FOR ===\n• ${indLabel} in ${loc}\n• [Sub-specialty 1]\n• [Common customer problem you solve]\n• [An opinion/POV you can defend publicly]\n• [An adjacent trend you can comment on]` },
  ];
}

interface ScanData {
  id: string;
  input: string;
  location: string | null;
  competitor_name: string | null;
  overall_score: number;
  industry: string | null;
  country_code: string | null;
  mentioned_count: number;
  trust_score: number | null;
  user_business_name: string | null;
}

// Map a trust/SEO signal name to the matching Fix Engine tool id.
// Order matters — most specific signals are checked first.
function getToolIdForSignal(signal: string): string {
  const s = (signal || '').toLowerCase();
  if (!s) return 'faq';

  if (s.includes('faq') || s.includes('question')) return 'faq';

  // "Review keywords" contains 'review' but must route to content — check 'keyword' FIRST.
  if (s.includes('keyword')) return 'content';

  // Nextdoor is a directory listing, but contains no directory keyword and the word
  // 'community' (in "Nextdoor Community Presence") would otherwise route to reddit.
  // Check Nextdoor BEFORE the reddit/community branch.
  if (s.includes('nextdoor') || s.includes('next door')) return 'directory';

  if (s.includes('localbusiness') || s.includes('json-ld') || s.includes('business data') ||
      s.includes('markup') || s.includes('structured data') || s.includes('schema')) return 'schema';

  // Local NAP / contact signals → schema (LocalBusiness markup covers phone/address).
  // 'contact' does NOT contain 'content', so this is safe before the content branch.
  if (s.includes('phone') || s.includes('address') || s.includes('contact page') || s.includes('contact')) return 'schema';

  // Awards / local news / press → outreach. Check before review/content branches.
  if (s.includes('award') || s.includes('recognition') || s.includes('local news') ||
      s.includes('news') || s.includes('press') || s.includes('media') ||
      s.includes('journalist') || s.includes('outreach')) return 'outreach';

  // On-page content signals: H1/heading, alt/image, title tag, blog, services page, canonical.
  // Checked before the word-boundary review branch (none collide) and before directory.
  if (s.includes('h1') || s.includes('heading') ||
      s.includes('alt text') || s.includes('image description') || s.includes('image') ||
      s.includes('title tag') || /\btitle\b/.test(s) ||
      s.includes('blog') || s.includes('services page') || s.includes('services') ||
      s.includes('canonical') || s.includes('preferred page')) return 'content';

  // "Multiple sites" / cross-platform reviews → directory (claim more listings).
  // Check before the word-boundary review branch.
  if (s.includes('multiple site') || s.includes('multiple sites') || s.includes('multi-platform') ||
      s.includes('multiple platform')) return 'directory';

  // Word-boundary on "review" so it does NOT match "Preview" (e.g. "Twitter/X Preview Card").
  if (/\breview\b/.test(s) || s.includes('rating') || s.includes('response rate') || s.includes('reputation')) return 'review';

  // Video must be checked before 'content' so "Video content" routes to video, not content
  if (s.includes('video') || s.includes('youtube') || s.includes('tiktok')) return 'video';

  // Knowledge panel / entity signals — check early before generic schema/directory
  if (s.includes('knowledge panel') || s.includes('knowledge') || s.includes('entity') || s.includes('wikidata')) return 'knowledge';

  // Bio / about / personal brand
  if (s.includes('bio') || s.includes('about') || s.includes('personal brand') || s.includes('personal')) return 'bio';

  // GBP-specific terms win over the generic directory 'listing' check below
  if (s.includes('google business') || s.includes('gbp') || s.includes('maps') ||
      s.includes('business profile')) return 'gbp';

  // Facebook content/profile → content
  if (s.includes('facebook')) return 'content';

  // Content-style signals: meta description, open graph, twitter/x card, https/security, blog
  if (s.includes('content') || s.includes('blog') || s.includes('meta') || s.includes('description') ||
      s.includes('open graph') || s.includes('opengraph') || s.includes('twitter') || s.includes('social') ||
      s.includes('https') || s.includes('secure') || s.includes('ssl')) return 'content';

  // Forum / Quora / Reddit / community → reddit.
  // MUST be checked before the citations branch — "Online Forum Mentions" contains
  // 'mention' which would otherwise route to citations.
  if (s.includes('reddit') || s.includes('community') || s.includes('forum') || s.includes('quora')) return 'reddit';

  if (s.includes('citation') || s.includes('backlink') || s.includes('nap') || s.includes('mention')) return 'citations';

  if (s.includes('directory') || s.includes('listing') || s.includes('yelp') || s.includes('bbb') ||
      s.includes('healthgrades') || s.includes('zocdoc') || s.includes('trustpilot') ||
      s.includes('linkedin')) return 'directory';

  if (s.includes('competitor') || s.includes('competitive') || s.includes('rival')) return 'competitive';

  return 'faq';
}

type SitePlatform = 'html' | 'wordpress' | 'shopify' | 'squarespace';

const PLATFORM_TABS: { id: SitePlatform; label: string; icon: React.ReactNode }[] = [
  { id: 'html',        label: 'HTML/Custom',      icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg> },
  { id: 'wordpress',   label: 'WordPress',         icon: <svg viewBox="0 0 576 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 64C0 28.7 28.7 0 64 0L224 0l0 128c0 17.7 14.3 32 32 32l128 0 0 125.7-86.8 86.8c-10.3 10.3-17.5 23.1-21 37.2l-18.7 74.9c-2.3 9.2-1.8 18.8 1.3 27.5L64 512c-35.3 0-64-28.7-64-64L0 64zm384 64l-128 0L256 0 384 128zM549.8 235.7l14.4 14.4c15.6 15.6 15.6 40.9 0 56.6l-29.4 29.4-71-71 29.4-29.4c15.6-15.6 40.9-15.6 56.6 0zM311.9 417L441.1 287.8l71 71L382.9 487.9c-4.1 4.1-9.2 7-14.9 8.4l-60.1 15c-5.5 1.4-11.2-.2-15.2-4.2s-5.6-9.7-4.2-15.2l15-60.1c1.4-5.6 4.3-10.8 8.4-14.9z"/></svg> },
  { id: 'shopify',     label: 'Shopify',           icon: <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64l0 48-128 0 0-48zm-48 48l-64 0c-26.5 0-48 21.5-48 48L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-208c0-26.5-21.5-48-48-48l-64 0 0-48C336 50.1 285.9 0 224 0S112 50.1 112 112l0 48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z"/></svg> },
  { id: 'squarespace', label: 'Squarespace/Wix',   icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M192 104.8c0-9.2-5.8-17.3-13.2-22.8C167.2 73.3 160 61.3 160 48c0-26.5 28.7-48 64-48s64 21.5 64 48c0 13.3-7.2 25.3-18.8 34c-7.4 5.5-13.2 13.6-13.2 22.8c0 12.8 10.4 23.2 23.2 23.2l56.8 0c26.5 0 48 21.5 48 48l0 56.8c0 12.8 10.4 23.2 23.2 23.2c9.2 0 17.3-5.8 22.8-13.2c8.7-11.6 20.7-18.8 34-18.8c26.5 0 48 28.7 48 64s-21.5 64-48 64c-13.3 0-25.3-7.2-34-18.8c-5.5-7.4-13.6-13.2-22.8-13.2c-12.8 0-23.2 10.4-23.2 23.2L384 464c0 26.5-21.5 48-48 48l-56.8 0c-12.8 0-23.2-10.4-23.2-23.2c0-9.2 5.8-17.3 13.2-22.8c11.6-8.7 18.8-20.7 18.8-34c0-26.5-28.7-48-64-48s-64 21.5-64 48c0 13.3 7.2 25.3 18.8 34c7.4 5.5 13.2 13.6 13.2 22.8c0 12.8-10.4 23.2-23.2 23.2L48 512c-26.5 0-48-21.5-48-48L0 343.2C0 330.4 10.4 320 23.2 320c9.2 0 17.3 5.8 22.8 13.2C54.7 344.8 66.7 352 80 352c26.5 0 48-28.7 48-64s-21.5-64-48-64c-13.3 0-25.3 7.2-34 18.8C40.5 250.2 32.4 256 23.2 256C10.4 256 0 245.6 0 232.8L0 176c0-26.5 21.5-48 48-48l120.8 0c12.8 0 23.2-10.4 23.2-23.2z"/></svg> },
];

interface InstructionMethod {
  label: string;
  recommended?: boolean;
  steps: string[];
}
interface ApplicationInstructions {
  methods?: InstructionMethod[];
  steps?: string[];
  timeEstimate: string;
}

// The two <head>-injection fix types are the only ones where the actual steps
// differ by platform — everywhere else (reviews, directories, Reddit) happens
// off-site and the customer's website platform is irrelevant. WordPress and
// Squarespace/Wix are presented as explicit alternative METHODS (not a single
// numbered list with a buried "— OR —" step) so nothing reads as sequential
// when it isn't.
const PLATFORM_DEPENDENT_INSTRUCTIONS: Record<'faq_schema' | 'jsonld', Record<SitePlatform, ApplicationInstructions>> = {
  faq_schema: {
    html: {
      timeEstimate: '20-30 minutes',
      steps: [
        'Copy the FAQ Schema code above',
        'Open your website HTML file in a text editor',
        'Find the closing </head> tag',
        'Paste the code directly before </head>',
        'Save the file and upload it to your server',
        'Test it at: search.google.com/test/rich-results',
      ],
    },
    wordpress: {
      timeEstimate: '10-15 minutes',
      methods: [
        {
          label: 'Plugin Method',
          recommended: true,
          steps: [
            'Go to your WordPress Dashboard',
            'Click Plugins → Add New',
            'Search for "Insert Headers and Footers"',
            'Install and Activate the plugin',
            'Go to Settings → Insert Headers and Footers',
            'Paste the FAQ Schema code in the "Header" box',
            'Click Save',
            'Test at: search.google.com/test/rich-results',
          ],
        },
        {
          label: 'Theme Editor Method',
          recommended: false,
          steps: [
            'Go to Appearance → Theme Editor',
            'Select header.php on the right',
            'Find the </head> tag',
            'Paste the code before </head>',
            'Click Update File',
            'Test at: search.google.com/test/rich-results',
          ],
        },
      ],
    },
    shopify: {
      timeEstimate: '10-15 minutes',
      steps: [
        'Go to your Shopify Admin',
        'Click Online Store → Themes',
        'Click the "..." menu next to your active theme',
        'Click Edit Code',
        'In the left sidebar find theme.liquid',
        'Click on theme.liquid to open it',
        'Find the closing </head> tag',
        'Paste the FAQ Schema code before </head>',
        'Click Save',
        'Test at: search.google.com/test/rich-results',
      ],
    },
    squarespace: {
      timeEstimate: '10-15 minutes',
      methods: [
        {
          label: 'Squarespace',
          steps: [
            'Go to your Squarespace Dashboard',
            'Click Settings → Advanced',
            'Click Code Injection',
            'Paste the code in the "Header" section',
            'Click Save',
          ],
        },
        {
          label: 'Wix',
          steps: [
            'Go to your Wix Dashboard',
            'Click Settings → Custom Code',
            'Click + Add Custom Code',
            'Paste the FAQ Schema code',
            'Set "Place Code in" to Head',
            'Set "Add Code to Pages" to All Pages',
            'Click Apply',
          ],
        },
      ],
    },
  },
  jsonld: {
    html: {
      timeEstimate: '15-20 minutes',
      steps: [
        'Copy the LocalBusiness Schema code above',
        'Open your website HTML file',
        'Find the closing </head> tag',
        'Paste the code before </head>',
        'Save and upload the file',
        'Test at: search.google.com/test/rich-results',
        'Also test at: validator.schema.org',
      ],
    },
    wordpress: {
      timeEstimate: '10-15 minutes',
      methods: [
        {
          label: 'Plugin Method',
          recommended: true,
          steps: [
            'Go to your WordPress Dashboard',
            'Click Plugins → Add New',
            'Search for "Insert Headers and Footers"',
            'Install and Activate',
            'Go to Settings → Insert Headers and Footers',
            'Paste the schema code in the Header box',
            'Click Save',
            'Test at: search.google.com/test/rich-results',
          ],
        },
        {
          label: 'Theme Editor Method',
          recommended: false,
          steps: [
            'Go to Appearance → Theme Editor',
            'Open header.php',
            'Find </head> tag',
            'Paste code before </head>',
            'Click Update File',
          ],
        },
      ],
    },
    shopify: {
      timeEstimate: '10-15 minutes',
      steps: [
        'Go to Shopify Admin',
        'Click Online Store → Themes',
        'Click "..." → Edit Code',
        'Open theme.liquid',
        'Find </head> tag',
        'Paste the schema code before </head>',
        'Click Save',
        'Test at: search.google.com/test/rich-results',
      ],
    },
    squarespace: {
      timeEstimate: '10-15 minutes',
      methods: [
        {
          label: 'Squarespace',
          steps: [
            'Settings → Advanced → Code Injection',
            'Paste code in Header section',
            'Save',
          ],
        },
        {
          label: 'Wix',
          steps: [
            'Settings → Custom Code',
            'Add Custom Code',
            'Paste schema code',
            'Place Code in: Head',
            'Apply to: All Pages',
            'Click Apply',
          ],
        },
      ],
    },
  },
};

// Platform-independent instructions — reviews/Reddit/directories happen off-site,
// so the customer's website platform never changes these steps.
const PLATFORM_INDEPENDENT_INSTRUCTIONS: Record<string, ApplicationInstructions> = {
  gbp: {
    timeEstimate: '20-30 minutes',
    steps: [
      'Go to business.google.com and sign in',
      'Select your business (or claim it if not yet verified)',
      'Click "Edit profile" → "Business description"',
      'Paste the GBP description above',
      'Click "Edit profile" → "Services" and add each service listed above',
      'Go to "Updates" and create your first post using the schedule above',
      'Go to "Q&A" and seed the questions above (answer them yourself)',
      'Go to "Photos" and upload at least one image per category listed above',
    ],
  },
  reviews: {
    timeEstimate: '10 minutes/week',
    steps: [
      'Go to Google Business Profile: business.google.com',
      'Click "Reviews" in left menu',
      'Find each new review',
      'Click "Reply" below the review',
      'Copy the response template above and personalize it',
      "Replace [Name] with the reviewer's name",
      'Replace YOUR_BUSINESS_NAME with your actual business name',
      'Click "Post reply"',
      'Repeat for each new review weekly',
    ],
  },
  reddit: {
    timeEstimate: '1-2 hours',
    steps: [
      "Create a Reddit account if you don't have one (reddit.com)",
      'Search for the subreddits listed in your strategy above',
      'Join each relevant subreddit',
      'Read recent posts to understand the community tone',
      'Post your contribution using the draft above as a guide',
      'Do NOT copy/paste the draft exactly — personalize it',
      'Engage authentically and reply to comments',
      'Post 1-2 times per week consistently',
    ],
  },
  directory: {
    timeEstimate: '2-3 hours',
    steps: [
      'Use the same business name, address, and phone everywhere',
      'Start with Google Business Profile: business.google.com',
      'Then Yelp: biz.yelp.com',
      'Then Bing Places: bingplaces.com',
      'Then Apple Maps Connect: mapsconnect.apple.com',
      'Then Yellow Pages: yp.com/claim-business',
      'Use EXACTLY the same NAP (Name, Address, Phone) on all',
      'Take a screenshot of each completed listing',
    ],
  },
};

// Phase 3 — step-by-step apply instructions, keyed by the REAL generate-fix
// fixType strings (faq_schema/jsonld/directory/reviews/reddit). For faq_schema
// and jsonld, steps also depend on the customer's website platform; everything
// else happens off-site so platform is ignored there.
function getApplicationInstructions(fixType: string, platform: SitePlatform = 'html'): ApplicationInstructions {
  const platformMap = PLATFORM_DEPENDENT_INSTRUCTIONS[fixType as 'faq_schema' | 'jsonld'];
  if (platformMap) return platformMap[platform];

  return PLATFORM_INDEPENDENT_INSTRUCTIONS[fixType] || {
    timeEstimate: '30-60 minutes',
    steps: [
      'Copy the content above',
      'Log in to your website or the relevant platform',
      'Find the relevant section',
      'Paste and customise the content',
      'Save your changes',
      'Mark as applied below',
    ],
  };
}

// Shared renderer for both "Ready for Review" and "Ready to Apply" — a single
// source of truth for how methods vs. flat steps display, so the two sections
// can never drift out of sync with each other.
function renderInstructions(instr: ApplicationInstructions) {
  return (
    <div>
      {instr.methods ? (
        instr.methods.map((method, mi) => (
          <div key={mi} style={{ marginTop: mi > 0 ? 16 : 0, paddingTop: mi > 0 ? 16 : 0, borderTop: mi > 0 ? '1px solid #1e2a3a' : 'none' }}>
            <p style={{ color: method.recommended ? '#22c55e' : '#7c3aed', fontSize: 12, fontWeight: 700, margin: '0 0 8px' }}>
              {method.label}{method.recommended ? (<>{' '}<svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Recommended</>) : ''}
            </p>
            {method.steps.map((step, si) => (
              <p key={si} style={{ color: '#9ca3af', fontSize: 12, margin: '4px 0', paddingLeft: 8 }}>
                {si + 1}. {step}
              </p>
            ))}
          </div>
        ))
      ) : (
        instr.steps?.map((step, i) => (
          <p key={i} style={{ color: '#9ca3af', fontSize: 12, margin: '4px 0', paddingLeft: 8 }}>
            {i + 1}. {step}
          </p>
        ))
      )}
      <p style={{ color: '#4b5563', fontSize: 11, margin: '12px 0 0', fontStyle: 'italic' }}>
        <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M176 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l16 0 0 34.4C92.3 113.8 16 200 16 304c0 114.9 93.1 208 208 208s208-93.1 208-208c0-41.8-12.3-80.7-33.5-113.2l24.1-24.1c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L355.7 143c-28.1-23-62.2-38.8-99.7-44.6L256 64l16 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L224 0 176 0zm72 192l0 128c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-128c0-13.3 10.7-24 24-24s24 10.7 24 24z"/></svg> Estimated time: {instr.timeEstimate}
      </p>
    </div>
  );
}

// Generic YouTube search link for a fix/platform combo — no curated tutorial
// library exists yet, so this points at a reasonable live search instead of a
// fabricated video URL.
function tutorialSearchUrl(fixType: string, platform: SitePlatform): string {
  const fixLabel = fixType.replace(/_/g, ' ');
  const platformLabel = PLATFORM_TABS.find((p) => p.id === platform)?.label ?? platform;
  const q = encodeURIComponent(`how to add ${fixLabel} ${platformLabel} website tutorial`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

// Maps the 13 Fix Engine tools' own id namespace (faq/schema/review/...) onto
// the real generated_fixes fix_type strings getApplicationInstructions expects.
// Tools with no entry here (competitive, outreach, video, knowledge, bio,
// content) intentionally show no instructions block — there's no matching
// application-steps data for them, so omitting the entry is the honest
// behavior rather than fabricating steps.
const TOOL_TO_FIX_TYPE: Record<string, string> = {
  faq: 'faq_schema',
  schema: 'jsonld',
  review: 'reviews',
  reddit: 'reddit',
  citations: 'directory',
  directory: 'directory',
  gbp: 'gbp',
};

// Display-time safety net: /api/fixes/review already replaces YOUR_BUSINESS_NAME
// when a customer approves with a real name, but fixes approved without a name
// (or approved before this existed) can have the placeholder baked permanently into
// generated_content. Reuses safeBusinessName's search-query guard so a scan whose
// input looks like a query (e.g. "best dentist in LA") never gets injected as a
// business name — in that case it just leaves the placeholder visible, honestly.
function personalizeContent(content: string, rawBusinessName: string | null | undefined): string {
  if (!content) return content;
  const real = safeBusinessName(rawBusinessName);
  if (real === 'YOUR_BUSINESS_NAME') return content;
  return content
    .replace(/YOUR_BUSINESS_NAME/g, real)
    .replace(/\[Business Name\]/g, real)
    .replace(/\[businessName\]/g, real);
}

function FixEngineContent() {
  const searchParams = useSearchParams();
  const signal = searchParams.get('signal') || '';
  const [activeTool, setActiveTool] = useState(() => getToolIdForSignal(signal));
  const [copied, setCopied]         = useState(false);
  const [applied, setApplied]       = useState<string[]>([]);
  const [applyMsg, setApplyMsg]     = useState<string | null>(null);
  const [scan, setScan]             = useState<ScanData | null>(null);
  const [loading, setLoading]       = useState(true);
  // b89u: session state is tracked explicitly — logged-out visitors
  // previously fell into the "No scans yet" branch and got the
  // dashboard shell with a scan CTA instead of a sign-in message.
  const [signedIn, setSignedIn]     = useState<boolean | null>(null);
  const [noScan, setNoScan]         = useState(false);
  const [scanError, setScanError]   = useState(false); // ax73: scan-query failure ≠ "No scans yet"
  const [fetchKey, setFetchKey]     = useState(0);     // ax73: retry the whole load
  // Phase 2 — auto-generated fixes awaiting review.
  const [pendingFixes, setPendingFixes] = useState<Array<Record<string, any>>>([]);
  // b86n: the API's deduped total — the badge must show the same
  // number the dashboard banner shows, not the list length.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingError, setPendingError] = useState(false);
  const [approvedError, setApprovedError] = useState(false); // ax73: same class as pendingError
  const [appliedError, setAppliedError] = useState(false);
  const [approvingFix, setApprovingFix] = useState<Record<string, any> | null>(null);
  const [businessNameInput, setBusinessNameInput] = useState('');
  // Phase 3 — approved fixes ready to apply.
  const [approvedFixes, setApprovedFixes] = useState<Array<Record<string, any>>>([]);
  const [appliedMessage, setAppliedMessage] = useState<React.ReactNode>('');
  // Failure feedback for review / copy actions — never claim success on failure.
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  // Phase 4 — applied fixes being verified (and verified/needs-reinforcement results).
  const [appliedFixes, setAppliedFixes] = useState<Array<Record<string, any>>>([]);
  // Platform selector for "Ready to Apply" instructions — one selection applies
  // to every card since a business has a single website platform.
  const [sitePlatform, setSitePlatform] = useState<SitePlatform>('html');
  const [showTrustGuide, setShowTrustGuide] = useState(false);

  // Route to the correct tool whenever the ?signal= URL param changes
  useEffect(() => {
    if (signal) setActiveTool(getToolIdForSignal(signal));
  }, [signal]);

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSignedIn(false); setLoading(false); return; }
      setSignedIn(true);

      // Load auto-generated fixes awaiting review via the service-role API so the
      // read works regardless of RLS on generated_fixes (a direct client/anon read
      // returns empty when RLS is enabled). Independent of the scan below.
      // ax8r: the old empty catch meant a down API silently showed "no
      // fixes". Failures now surface as an error banner (see below).
      await loadPendingFixes();

      // Phase 3 — approved fixes ready to apply.
      await loadApprovedFixes();
      // Phase 4 — applied fixes (verifying / verified / needs reinforcement).
      await loadAppliedFixes();

      // ax73: a scan-query FAILURE is not "No scans yet" — only PGRST116
      // (no rows) means the user genuinely has no scan.
      const { data, error: scanErr } = await supabase
        .from('rankall_scans')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (scanErr && (scanErr as { code?: string }).code !== 'PGRST116') {
        setScanError(true); setLoading(false); return;
      }
      if (!data) { setNoScan(true); setLoading(false); return; }
      const row = data as Record<string, unknown>;
      setScan({
        id: String(row.id ?? ''),
        input: String(row.input ?? ''),
        location: (row.location as string | null) ?? null,
        competitor_name: (row.competitor_name as string | null) ?? null,
        overall_score: Number(row.overall_score ?? 0),
        industry: (row.industry as string | null) ?? null,
        country_code: (row.country_code as string | null) ?? null,
        mentioned_count: Number(row.mentioned_count ?? 0),
        trust_score: ((row.trust_signals as Record<string, unknown> | null)?.overall as number | undefined) ?? null,
        user_business_name: (row.user_business_name as string | null) ?? null,
      });
      setLoading(false);
    }
    fetchData();
  }, [fetchKey]);

  async function handleReviewFix(fixId: string, action: 'approved' | 'rejected', businessName?: string | null) {
    // Optimistically remove from the list, but roll back + show an error if the
    // API call fails — the fix must not vanish while claiming success.
    const removed = pendingFixes.find(f => f.id === fixId);
    setPendingFixes(prev => prev.filter(f => f.id !== fixId));
    setReviewError(null);
    try {
      const res = await fetch('/api/fixes/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fixId, action, businessName: businessName || null }),
      });
      if (!res.ok) throw new Error(`Review failed (${res.status})`);
      // Approved fixes move to the "Ready to Apply" section — refresh it so it
      // appears immediately (no manual page reload).
      if (action === 'approved') await loadApprovedFixes();
    } catch (err) {
      console.error('Fix review failed:', err);
      if (removed) setPendingFixes(prev => [removed, ...prev]);
      setReviewError('Could not save that review. The fix is still in your list — please try again.');
    }
  }

  // Phase 3 — mark an approved fix as applied: flips its status AND enters the
  // canonical Apply→Verify loop (schedules a rescan + records an outcome).
  // ax73: each loader reports its own failure (with retry) — a failed
  // load must never look like an empty section.
  async function loadPendingFixes() {
    try {
      const res = await fetch('/api/fixes/pending');
      if (!res.ok) throw new Error(`pending fixes failed: ${res.status}`);
      const json = await res.json();
      setPendingFixes(Array.isArray(json.fixes) ? json.fixes : []);
      setPendingCount(typeof json.count === 'number' ? json.count : null);
      setPendingError(false);
    } catch {
      setPendingError(true);
    }
  }

  async function loadApprovedFixes() {
    try {
      const res = await fetch('/api/fixes/pending?status=approved');
      if (!res.ok) throw new Error(`approved fixes failed: ${res.status}`);
      const json = await res.json();
      setApprovedFixes(Array.isArray(json.fixes) ? json.fixes : []);
      setApprovedError(false);
    } catch (err) {
      console.error('Failed to load approved:', err);
      setApprovedError(true);
    }
  }

  async function loadAppliedFixes() {
    try {
      const res = await fetch('/api/fixes/pending?status=applied');
      if (!res.ok) throw new Error(`applied fixes failed: ${res.status}`);
      const json = await res.json();
      setAppliedFixes(Array.isArray(json.fixes) ? json.fixes : []);
      setAppliedError(false);
    } catch (err) {
      console.error('Failed to load applied:', err);
      setAppliedError(true);
    }
  }

  async function handleMarkApplied(fixId: string, fixType: string) {
    // Optimistically remove, but only claim "Recorded!" once BOTH writes succeed.
    // On a review failure the fix returns to the list; on a verify-scheduling
    // failure we say so instead of promising verification that never got scheduled.
    const removed = approvedFixes.find(f => f.id === fixId);
    setApprovedFixes(prev => prev.filter(f => f.id !== fixId));
    setReviewError(null);
    try {
      const reviewRes = await fetch('/api/fixes/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fixId, action: 'applied' }),
      });
      if (!reviewRes.ok) throw new Error(`Mark-applied failed (${reviewRes.status})`);
      let verifyOk = true;
      if (scan?.id) {
        const applyRes = await fetch('/api/fixes/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scan_id: scan.id, fix_type: fixType, rescan_days: 7, generated_fix_id: fixId }),
        });
        verifyOk = applyRes.ok;
      }
      // Refresh the applied section so the fix appears there immediately (verifying).
      await loadAppliedFixes();
      if (verifyOk) {
        setAppliedMessage(<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Recorded! Rankall will verify this in 7 days.</>);
      } else {
        setAppliedMessage(<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Fix marked applied, but verification scheduling failed. Please try marking it applied again to schedule verification.</>);
      }
      setTimeout(() => setAppliedMessage(''), 5000);
    } catch (err) {
      console.error('Mark applied failed:', err);
      if (removed) setApprovedFixes(prev => [removed, ...prev]);
      setReviewError('Could not mark that fix as applied. It is still in your list — please try again.');
    }
  }

  if (loading) return <div style={{ padding: 40, color: GRAY }}>Loading...</div>;

  if (signedIn === false) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Sign in to use the Fix Engine.</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 16 }}>Your fix queue is generated from your own scans.</p>
        <a href="/login?next=/dashboard/fix" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</a>
      </div>
    </div>
  );

  if (scanError) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/dashboard" style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
        <span>›</span>
        <span>Fix Engine</span>
      </nav>
      <header className="pagehead">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Fix Engine</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>13 AI-powered tools to close every gap — content ready to use</p>
        </div>
      </header>
      <div className="card dash-card" style={{ marginTop: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Couldn&apos;t load your scans</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 16 }}>Your scans still exist — the fix page failed to load them.</p>
        <button onClick={() => { setScanError(false); setLoading(true); setFetchKey(k => k + 1); }} className="btn btn-blue">Retry</button>
      </div>
    </div>
  );

  if (noScan || !scan) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/dashboard" style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
        <span>›</span>
        <span>Fix Engine</span>
      </nav>
      <header className="pagehead">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Fix Engine</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>13 AI-powered tools to close every gap — content ready to use</p>
        </div>
      </header>
      <div className="card dash-card" style={{ marginTop: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>No scans yet.</p>
        <a href="/" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Run your first scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
      </div>
    </div>
  );

  // ax8r: honor the ?country= param the Trust Layer passes (it was ignored;
  // the page always used the scan's country_code). Param wins, scan is fallback.
  const countryParam = (searchParams.get('country') || '').toUpperCase();
  const TOOLS = buildTools(
    scan.input,
    scan.location ?? '',
    scan.competitor_name ?? '',
    scan.id,
    scan.industry ?? '',
    countryParam || scan.country_code || '',
  );

  const tool = TOOLS.find(t => t.id === activeTool)!;

  // Real, derived intelligence (replaces the old hardcoded +23 / 89%).
  const signals: ScanSignals = {
    overallScore: scan.overall_score,
    platformsMentioned: scan.mentioned_count,
    totalPlatforms: 11,
    competitorName: scan.competitor_name,
    trustScore: scan.trust_score,
  };
  // ax8r: the same 5 fixes the dots/labels track (was TOOLS.slice(0, 5),
  // whose 5th tool is 'content', not the 'directory' priority fix).
  const priorityFixTypes = PRIORITY_FIXES.map(f => f.tool);
  const predictedLift = computePredictedScoreLift(priorityFixTypes, signals);
  const predictedScore = projectScore(scan.overall_score, predictedLift);
  const aggConfidence = Math.round(
    priorityFixTypes.reduce((s, ft) => s + computeConfidence(ft, signals).value, 0) / priorityFixTypes.length,
  );
  const activeConfidence = computeConfidence(tool.id, signals);
  const activeEvidence = buildEvidence(tool.id, signals);
  // b89u: the review queue's own total, from the same canonical
  // per-fix impacts the cards display — the priority-tools banner
  // below is a different list and now says so.
  const pendingImpactTotal = pendingFixes.reduce((s, f) => s + (typeof f.predicted_impact === 'number' ? f.predicted_impact : 0), 0);

  async function copy() {
    // clipboard.writeText rejects when the browser blocks clipboard access —
    // only show "Copied" after it actually succeeds.
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(tool.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Copy failed — your browser blocked clipboard access. Select the text and copy it manually.');
    }
  }

  async function copyText(text: string) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError('Copy failed — your browser blocked clipboard access. Select the text and copy it manually.');
    }
  }

  async function markApplied(id: string) {
    // Un-applying is local-only (we don't retract a scheduled verification).
    if (applied.includes(id)) {
      setApplied(prev => prev.filter(x => x !== id));
      return;
    }
    // Optimistically mark, then persist via the canonical apply endpoint so the
    // Apply → Verify loop actually runs (schedules a rescan + records an outcome).
    setApplied(prev => [...prev, id]);
    setApplyMsg(null);
    try {
      const res = await fetch('/api/fixes/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ax72: manual tools use tool ids ('schema','review','citations') but
        // generated_fixes uses ('jsonld','reviews','directory'). The old code
        // sent the raw tool id, so the apply sync-back (exact fix_type match)
        // found no generated_fixes row and the applied fix never appeared
        // in the applied list. Translate via the same map the queue uses.
        body: JSON.stringify({ scan_id: scan?.id, fix_type: TOOL_TO_FIX_TYPE[id] ?? id, rescan_days: 7 }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyMsg(data.message || 'Great. Rankall will automatically verify this improvement in 7 days.');
      } else {
        setApplied(prev => prev.filter(x => x !== id));
        setApplyMsg('Could not record this fix. Please try again.');
      }
    } catch {
      setApplied(prev => prev.filter(x => x !== id));
      setApplyMsg('Could not record this fix. Please try again.');
    }
  }

  return (
    <PlanPageGuard feature="canSeeFixes" requiredPlan="local_pro">
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1px solid #E7E7F0}.btn-line:hover{border-color:#1B17FF;color:#1B17FF}
        .btn-ghost{background:transparent;color:#55556A}.btn-ghost:hover{background:#F6F6FB}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/dashboard" style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
        <span>›</span>
        <span>Fix Engine</span>
      </nav>

      {/* Action failure banners — shown when a review/copy actually failed */}
      {reviewError && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#991B1B', fontWeight: 600, marginBottom: 16 }}>
          {reviewError}
        </div>
      )}
      {copyError && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E', fontWeight: 600, marginBottom: 16 }}>
          {copyError}
        </div>
      )}

      {/* Platform selector — global, applies to every fix's instructions on this
          page. Changes the head-injection steps for FAQ / LocalBusiness schema;
          off-site fixes (reviews, directories, Reddit) ignore it. */}
      <div style={{ background: '#0f1629', border: '1px solid #374151', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
        <p style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>What type of website do you have?</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PLATFORM_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSitePlatform(tab.id)}
              style={{
                background: sitePlatform === tab.id ? BLUE : '#1a1a2e',
                border: `1px solid ${sitePlatform === tab.id ? BLUE : '#374151'}`,
                color: sitePlatform === tab.id ? '#fff' : '#9ca3af',
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Phase 2 — auto-generated fixes awaiting review (shown above the manual tools) */}
      {pendingError && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: RED, margin: 0 }}>Couldn't load your generated fixes</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '4px 0 8px' }}>The fix queue failed to load. Your fixes still exist.</p>
          <button onClick={loadPendingFixes} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Retry</button>
        </div>
      )}
      {pendingFixes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ color: NAVY, fontSize: 20, fontWeight: 800, margin: 0 }}><svg viewBox="0 0 576 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/></svg> Ready for Review</h2>
            <span style={{ background: PURPLE, color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
              {pendingCount ?? pendingFixes.length} {(pendingCount ?? pendingFixes.length) === 1 ? 'fix' : 'fixes'}
            </span>
          </div>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 16 }}>
            Generated from your scans — every fix is labelled with the business and scan it came from. Review and approve to implement.
          </p>
          {pendingImpactTotal > 0 && (
            <p style={{ color: GRAY, fontSize: 13, marginBottom: 16 }}>
              Estimated total: <strong style={{ color: NAVY }}>+{pendingImpactTotal} pts</strong> if you apply all {pendingFixes.length} fixes (fixes without an estimated impact aren&apos;t counted).
            </p>
          )}
          {pendingFixes.map(fix => (
            <div key={fix.id} style={{ background: '#0f1629', border: `1px solid ${PURPLE}`, borderLeft: `4px solid ${(fix.predicted_impact || 0) >= 15 ? '#059669' : (fix.predicted_impact || 0) >= 8 ? '#D97706' : '#94A3B8'}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>{fix.fix_title}</h3>
                    {fix.predicted_impact != null && (
                    <span style={{ background: (fix.predicted_impact || 0) >= 15 ? '#059669' : (fix.predicted_impact || 0) >= 8 ? '#D97706' : '#94A3B8', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                      est. +{fix.predicted_impact} pts
                    </span>
                    )}
                    {fix.verification_status === 'verified' ? (
                      <span style={{ background: '#065f46', color: '#6ee7b7', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}><svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Verified Recommendation</span>
                    ) : (
                      <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}><svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Predicted Recommendation</span>
                    )}
                  </div>
                  <span style={{ color: '#22c55e', fontSize: 13 }}>
                    {(() => { const est = fixTypeEstimate(fix.fix_type); return [fix.predicted_impact != null ? `est. +${fix.predicted_impact} pts` : null, est ? `${est.confidence}% confidence` : null, est?.difficulty ?? fix.difficulty, est?.timeToImplement ?? fix.time_to_implement].filter(Boolean).join(' · '); })()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleReviewFix(fix.id, 'rejected')} style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                    Skip
                  </button>
                  <button onClick={() => { setApprovingFix(fix); setBusinessNameInput(fix.scan_business || scan?.user_business_name || ''); }} style={{ background: PURPLE, border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Approve &amp; Use
                  </button>
                </div>
              </div>
              {fix.scan_business && (
                <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
                  For {fix.scan_business}{fix.scan_date ? ` — from your scan of ${new Date(fix.scan_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </p>
              )}
              {fix.why_recommended && (
                <div style={{ background: '#0a0a1a', borderLeft: `3px solid ${PURPLE}`, padding: '8px 12px', marginBottom: 8, borderRadius: '0 6px 6px 0' }}>
                  <p style={{ color: '#9ca3af', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>Why this was recommended:</span> {fix.why_recommended}
                  </p>
                  {fix.triggered_by_signal && (
                    <p style={{ color: '#6b7280', fontSize: 11, margin: '4px 0 0' }}>Trust signal: {fix.triggered_by_signal}</p>
                  )}
                </div>
              )}
              {fix.generated_content && (() => {
                const preview = personalizeContent(String(fix.generated_content), fix.scan_business || scan?.user_business_name || scan?.input);
                return (
                  <div style={{ background: '#1a1a2e', borderRadius: 8, padding: 12, fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', maxHeight: 120, overflow: 'hidden', position: 'relative' }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {preview.substring(0, 300)}{preview.length > 300 ? '…' : ''}
                    </pre>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(transparent,#1a1a2e)' }} />
                  </div>
                );
              })()}
              {(fix.fix_type === 'faq_schema' || fix.fix_type === 'jsonld') && (
                <div style={{ marginTop: 12, padding: 12, background: '#0a0a1a', borderRadius: 8, borderLeft: '3px solid #7c3aed' }}>
                  <p style={{ color: '#7c3aed', fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>
                    <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M192 0c-41.8 0-77.4 26.7-90.5 64L64 64C28.7 64 0 92.7 0 128L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64l-37.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM72 272a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm104-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zM72 368a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm88 0c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16z"/></svg> How to apply on {
                      sitePlatform === 'wordpress' ? 'WordPress'
                      : sitePlatform === 'shopify' ? 'Shopify'
                      : sitePlatform === 'squarespace' ? 'Squarespace/Wix'
                      : 'your website'
                    }:
                  </p>
                  {renderInstructions(getApplicationInstructions(fix.fix_type, sitePlatform))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Phase 3 — approved fixes ready to apply, with guided instructions */}
      {approvedError && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: RED, margin: 0 }}>Couldn't load your approved fixes</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '4px 0 8px' }}>The Ready to Apply section failed to load. Your fixes still exist.</p>
          <button onClick={loadApprovedFixes} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Retry</button>
        </div>
      )}
      {approvedFixes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ color: NAVY, fontSize: 20, fontWeight: 800, margin: 0 }}><svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Ready to Apply</h2>
            <span style={{ background: GREEN, color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
              {approvedFixes.length} approved
            </span>
          </div>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 16 }}>
            Copy the content, follow the steps, then mark it applied — we&apos;ll verify it in a rescan.
          </p>

          {approvedFixes.map(fix => {
            const instr = getApplicationInstructions(fix.fix_type, sitePlatform);
            const personalized = fix.generated_content
              ? personalizeContent(String(fix.generated_content), fix.scan_business || scan?.user_business_name || scan?.input)
              : '';
            return (
              <div key={fix.id} style={{ background: '#0f1629', border: `1px solid ${GREEN}`, borderRadius: 12, padding: 20, marginBottom: 12, animation: 'fadeIn 0.5s ease-in' }}>
                <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>{fix.fix_title}</h3>
                {fix.scan_business && (
                  <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
                    For {fix.scan_business}{fix.scan_date ? ` — from your scan of ${new Date(fix.scan_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </p>
                )}
                {fix.generated_content && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => copyText(personalized)}
                      style={{ position: 'absolute', top: 8, right: 8, background: '#1e293b', border: '1px solid #374151', color: '#93c5fd', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', zIndex: 1 }}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <pre style={{ background: '#1a1a2e', borderRadius: 8, padding: '14px', paddingTop: 34, margin: 0, fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>
                      {personalized}
                    </pre>
                  </div>
                )}
                <div style={{ background: '#0a0a1a', borderRadius: 8, padding: 16, marginTop: 12 }}>
                  <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>How to apply this fix:</p>
                  {renderInstructions(instr)}
                  <a
                    href={tutorialSearchUrl(fix.fix_type, sitePlatform)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', color: '#60a5fa', fontSize: 12, fontWeight: 600, marginTop: 10, textDecoration: 'none' }}
                  >
                    <svg viewBox="0 0 256 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"/></svg> Need help? Watch a tutorial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
                </div>
                <button
                  onClick={() => handleMarkApplied(fix.id, fix.fix_type)}
                  style={{ background: GREEN, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 16, width: '100%', fontFamily: 'inherit' }}
                >
                  <svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> I Applied This Fix
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Understanding Trust Signals — collapsible explainer + link to the full list. */}
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={() => setShowTrustGuide(v => !v)}
          className="btn btn-line" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', justifyContent: 'flex-start', padding: '12px 16px', color: NAVY }}
        >
          <span><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8l0 378.1C394 378 431.1 230.1 432 141.4L256 66.8s0 0 0 0z"/></svg> Understanding Trust Signals</span>
          <span style={{ marginLeft: 'auto', color: GRAY }}>{showTrustGuide ? <svg viewBox="0 0 320 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> : <svg viewBox="0 0 320 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>}</span>
        </button>
        {showTrustGuide && (
          <div style={{ border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '20px 16px', fontSize: 13, color: NAVY }}>
            {[
              {
                name: 'Google Business Profile',
                what: 'Your business listing on Google Maps and Search',
                where: 'business.google.com',
                why: 'A primary source AI platforms read for local business details',
                how: 'Claim, verify, and complete your profile 100%',
              },
              {
                name: 'FAQ Schema',
                what: 'Structured data that tells AI your most common Q&As',
                where: 'Your website header',
                why: 'AI platforms read FAQ schema to understand your business',
                how: 'Add FAQ JSON-LD to your website header',
              },
              {
                name: 'Citation Consistency',
                what: 'Your business name, address, phone consistent across the web',
                where: 'Google, Yelp, Yellow Pages, industry directories',
                why: 'AI trusts businesses with consistent information',
                how: 'Check and update NAP (Name, Address, Phone) on all directories',
              },
            ].map((sig) => (
              <div key={sig.name} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>Trust Signal: {sig.name}</p>
                <p style={{ margin: '0 0 4px', color: GRAY }}><strong style={{ color: NAVY }}>What it is:</strong> {sig.what}</p>
                <p style={{ margin: '0 0 4px', color: GRAY }}><strong style={{ color: NAVY }}>Where to go:</strong> {sig.where}</p>
                <p style={{ margin: '0 0 4px', color: GRAY }}><strong style={{ color: NAVY }}>Why it matters:</strong> {sig.why}</p>
                <p style={{ margin: 0, color: GRAY }}><strong style={{ color: NAVY }}>How to fix:</strong> {sig.how}</p>
              </div>
            ))}
            <a href="/dashboard/trust" style={{ display: 'inline-block', color: BLUE, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              Show all trust signals <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
          </div>
        )}
      </div>

      {/* Applied confirmation — outside the section so it survives applying the last fix */}
      {appliedMessage && (
        <p style={{ color: '#22c55e', fontSize: 14, textAlign: 'center', marginTop: 12, marginBottom: 20, padding: 8 }}>{appliedMessage}</p>
      )}

      {/* Phase 4 — applied fixes: verifying / verified / needs reinforcement */}
      {appliedError && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: RED, margin: 0 }}>Couldn't load your applied fixes</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '4px 0 8px' }}>The applied-fixes section failed to load. Your fixes still exist.</p>
          <button onClick={loadAppliedFixes} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Retry</button>
        </div>
      )}
      {appliedFixes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ color: NAVY, fontSize: 20, fontWeight: 800, margin: 0 }}><svg viewBox="0 0 448 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M288 0L160 0 128 0C110.3 0 96 14.3 96 32s14.3 32 32 32l0 132.8c0 11.8-3.3 23.5-9.5 33.5L10.3 406.2C3.6 417.2 0 429.7 0 442.6C0 480.9 31.1 512 69.4 512l309.2 0c38.3 0 69.4-31.1 69.4-69.4c0-12.8-3.6-25.4-10.3-36.4L329.5 230.4c-6.2-10.1-9.5-21.7-9.5-33.5L320 64c17.7 0 32-14.3 32-32s-14.3-32-32-32L288 0zM192 196.8L192 64l64 0 0 132.8c0 23.7 6.6 46.9 19 67.1L309.5 320l-171 0L173 263.9c12.4-20.2 19-43.4 19-67.1z"/></svg> Verification</h2>
            <span style={{ background: BLUE, color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
              {appliedFixes.length} applied
            </span>
          </div>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 16 }}>
            We rescan on the verification date set when you applied the fix (7 days by default) and confirm the real before→after change.
          </p>
          {appliedFixes.map(fix => {
            const vs = fix.verification_status as string | undefined;
            const before = fix.score_before as number | null;
            const after = fix.score_after as number | null;
            const badge = vs === 'verified'
              ? { bg: '#065f46', color: '#6ee7b7', label: (<><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>{' '}Verified</>) }
              : vs === 'needs_reinforcement'
                ? { bg: '#7c2d12', color: '#fdba74', label: (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>{' '}Needs reinforcement</>) }
                : { bg: '#1e3a5f', color: '#93c5fd', label: (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg>{' '}Verifying…</>) };
            return (
              <div key={fix.id} style={{ background: '#0f1629', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>{fix.fix_title}</h3>
                  <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{badge.label}</span>
                </div>
                {typeof after === 'number' ? (
                  <p style={{ color: '#cbd5e1', fontSize: 14, margin: 0 }}>
                    Score: <strong style={{ color: '#9ca3af' }}>{before ?? 0}</strong> → <strong style={{ color: after >= (before ?? 0) ? '#22c55e' : '#f87171' }}>{after}</strong>
                    <span style={{ color: '#6b7280' }}> ({after - (before ?? 0) >= 0 ? '+' : ''}{after - (before ?? 0)} pts)</span>
                  </p>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
                    Starting score {before ?? 0}/100{fix.scan_business ? ` for ${fix.scan_business}` : ''} — we&apos;ll rescan on its verification date and show the confirmed change here.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Personalization modal — replaces YOUR_BUSINESS_NAME placeholders on approve */}
      {approvingFix && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#0f1629', border: `1px solid ${PURPLE}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 480 }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Personalize your fix</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
              Add your business name to replace the placeholders in the generated content. You can skip and fill it in manually later.
            </p>
            <label style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 8 }}>Your business name</label>
            <input
              type="text"
              value={businessNameInput}
              onChange={e => setBusinessNameInput(e.target.value)}
              placeholder="e.g. Smile Center Dental"
              style={{ width: '100%', background: '#1a1a2e', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, marginBottom: 24, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setApprovingFix(null); setBusinessNameInput(''); }}
                style={{ flex: 1, background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { handleReviewFix(approvingFix.id, 'approved', null); setApprovingFix(null); setBusinessNameInput(''); }}
                style={{ flex: 1, background: 'transparent', border: '1px solid #6b7280', color: '#9ca3af', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}
              >
                {/* NOT "Skip": this approves the fix without personalizing it.
                    List-level "Skip" means reject — a second "Skip" doing the
                    opposite (approve) was silently mis-approving fixes. */}
                Approve without name
              </button>
              <button
                onClick={() => { handleReviewFix(approvingFix.id, 'approved', businessNameInput || null); setApprovingFix(null); setBusinessNameInput(''); }}
                style={{ flex: 2, background: PURPLE, border: 'none', color: '#fff', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}
              >
                <svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Approve &amp; Personalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="pagehead" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Fix Engine</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>13 AI-powered tools to close every gap — content ready to use</p>
        </div>
      </header>

      {/* Fix queue summary */}
      <div className="card dash-card" style={{ background: W, border: `1.5px solid #BFDBFE`, borderLeft: `4px solid ${BLUE}`, borderRadius: 14, padding: '16px 20px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>The 5 priority tools below, applied together → Score {scan.overall_score} to {predictedScore} (projected +{predictedLift})</p>
            <p style={{ fontSize: 13, color: GRAY }}>Tool-set projection from your real scan signals · {aggConfidence}% confidence (derived from platform coverage + trust signals). This is the priority TOOL set — your generated fix queue is at the top of this page, and the two counts measure different things.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {PRIORITY_FIXES.map((f, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: applied.includes(f.tool) ? GREEN : BORDER }} title={f.fix} />
            ))}
          </div>
        </div>
      </div>

      {/* ChatGPT Ads tip — full width, above the fix grid, for low scores */}
      {scan && scan.overall_score < 40 && (
        <div style={{ width: '100%', maxWidth: '100%', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d', margin: '0 0 4px' }}><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M272 384c9.6-31.9 29.5-59.1 49.2-86.2c0 0 0 0 0 0c5.2-7.1 10.4-14.2 15.4-21.4c19.8-28.5 31.4-63 31.4-100.3C368 78.8 289.2 0 192 0S16 78.8 16 176c0 37.3 11.6 71.9 31.4 100.3c5 7.2 10.2 14.3 15.4 21.4c0 0 0 0 0 0c19.8 27.1 39.7 54.4 49.2 86.2l160 0zM192 512c44.2 0 80-35.8 80-80l0-16-160 0 0 16c0 44.2 35.8 80 80 80zM112 176c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-61.9 50.1-112 112-112c8.8 0 16 7.2 16 16s-7.2 16-16 16c-44.2 0-80 35.8-80 80z"/></svg> While improving organically</p>
          <p style={{ fontSize: 13, color: '#166534', margin: '0 0 8px', lineHeight: 1.5 }}>
            Consider running ChatGPT Ads to appear immediately while your organic score improves. OpenAI&apos;s self-serve ad platform can put you in front of AI searchers right away.
          </p>
          <a href="https://ads.openai.com" target="_blank" rel="noopener noreferrer" style={{ color: '#15803d', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            Set up ChatGPT Ads <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Tool selector */}
        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>13 Fix Tools</p>
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${activeTool === t.id ? t.color : 'transparent'}`, background: activeTool === t.id ? `${t.color}10` : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginBottom: 4, transition: 'all 0.15s', position: 'relative' }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{t.icon}</span>
              <span style={{ fontSize: 13, fontWeight: activeTool === t.id ? 700 : 500, color: activeTool === t.id ? t.color : GRAY }}>{t.title}</span>
              {applied.includes(t.id) && (
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: GREEN }}><svg viewBox="0 0 448 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
              )}
            </button>
          ))}
        </div>

        {/* ax8r: a ?signal= link (e.g. from Trust Layer "Get generated fix
            code") used to land on the generic tool template even when a
            generated fix for that signal exists. Surface the generated fix
            for this signal first, with its own approve/skip actions. */}
        {(() => {
          const signalFix = signal
            ? pendingFixes.find(f => f.fix_type === (TOOL_TO_FIX_TYPE[activeTool] ?? activeTool))
            : undefined;
          if (!signalFix) return null;
          return (
            <div style={{ background: '#F5F3FF', border: `1.5px solid ${PURPLE}`, borderRadius: 14, padding: '20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Generated fix for &ldquo;{signal}&rdquo;</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>{signalFix.fix_title}</h3>
                  <p style={{ fontSize: 13, color: GREEN, fontWeight: 700, margin: 0 }}>{(() => { const est = fixTypeEstimate(signalFix.fix_type); return [signalFix.predicted_impact != null ? `est. +${signalFix.predicted_impact} pts` : null, est ? `${est.confidence}% confidence` : null, est?.difficulty ?? signalFix.difficulty, est?.timeToImplement ?? signalFix.time_to_implement].filter(Boolean).join(' · '); })()}</p>
                  {signalFix.why_recommended && (
                    <p style={{ fontSize: 13, color: GRAY, margin: '8px 0 0', lineHeight: 1.5 }}>{signalFix.why_recommended}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => handleReviewFix(signalFix.id, 'rejected')} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: GRAY, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                    Skip
                  </button>
                  <button onClick={() => { setApprovingFix(signalFix); setBusinessNameInput(signalFix.scan_business || scan?.user_business_name || ''); }} style={{ background: PURPLE, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    Approve
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Active tool */}
        <div>
          <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{tool.icon}</span>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, letterSpacing: '-0.5px' }}>{tool.title}</h2>
                </div>
                <p style={{ fontSize: 14, color: GRAY }}>{tool.desc}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => markApplied(tool.id)}
                  style={{ background: applied.includes(tool.id) ? GREEN : BG, border: `1.5px solid ${applied.includes(tool.id) ? GREEN : BORDER}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: applied.includes(tool.id) ? '#fff' : GRAY, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}
                >
                  {applied.includes(tool.id) ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Applied</>) : 'Mark Applied'}
                </button>
                <button
                  onClick={copy}
                  style={{ background: copied ? GREEN : BLUE, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 2px 8px ${copied ? GREEN : BLUE}33`, transition: 'all 0.2s' }}
                >
                  {copied ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied</>) : (<>Copy <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                </button>
              </div>
            </div>

            {/* Why this fix — real evidence + derived confidence (no fabrication) */}
            <div style={{ background: '#F8FAFC', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Why this is recommended</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: activeConfidence.value >= 70 ? GREEN : activeConfidence.value >= 50 ? '#D97706' : RED }}>
                  {activeConfidence.label} confidence · {activeConfidence.value}%
                </span>
              </div>
              {activeEvidence.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, color: NAVY }}>
                  <span style={{ color: GREEN, fontWeight: 700, flexShrink: 0 }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                  <span style={{ lineHeight: 1.5 }}>{e}</span>
                </div>
              ))}
            </div>

            {/* Apply confirmation — verification is scheduled, NOT immediate */}
            {applyMsg && applied.includes(tool.id) && (
              <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#065F46', fontWeight: 600 }}>
                <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> {applyMsg}
              </div>
            )}

            {/* Output */}
            <div style={{ background: '#1E293B', borderRadius: 10, padding: '20px', overflowX: 'auto' }}>
              <pre style={{ margin: 0, fontSize: 13, color: '#7DD3FC', lineHeight: 1.7, fontFamily: 'Courier New, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {tool.output}
              </pre>
            </div>

            {TOOL_TO_FIX_TYPE[activeTool] && (
              <div style={{ marginTop: 24, padding: 16, background: '#0a0a1a', borderRadius: 8, borderLeft: '3px solid #7c3aed' }}>
                <p style={{ color: '#7c3aed', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>
                  <svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M192 0c-41.8 0-77.4 26.7-90.5 64L64 64C28.7 64 0 92.7 0 128L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64l-37.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM72 272a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm104-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zM72 368a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm88 0c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16z"/></svg> How to add this to your{
                    sitePlatform === 'wordpress' ? ' WordPress site'
                    : sitePlatform === 'shopify' ? ' Shopify store'
                    : sitePlatform === 'squarespace' ? ' Squarespace/Wix site'
                    : ' website'
                  }:
                </p>
                {renderInstructions(getApplicationInstructions(TOOL_TO_FIX_TYPE[activeTool], sitePlatform))}
              </div>
            )}
          </div>

          {/* Fix impact preview — ax8r: the old +18 pts / 91% / 1 hour was
              hardcoded identically for all 13 tools and falsely labeled
              "based on similar verified outcomes". These numbers come from
              the same real per-tool computation as the confidence + evidence
              above (scan signals via lib/fixIntelligence). No time estimate:
              tool templates carry no measured apply time. */}
          <div className="card dash-card" style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: GREEN, marginBottom: 2 }}>Predicted impact for {tool.title}</p>
                <p style={{ fontSize: 12, color: GRAY }}>Projected from your scan signals</p>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {(() => {
                  // Item 8: the SAME canonical impact the fix queue shows
                  // (it used to be shrunk by remaining headroom: score 80 +
                  // knowledge_panel showed +5 here vs +23 in the queue). The
                  // capped outcome is shown separately as a projected score.
                  const impact = canonicalFixImpact(TOOL_TO_FIX_TYPE[activeTool] ?? activeTool);
                  const current = typeof scan?.overall_score === 'number' ? scan.overall_score : null;
                  return [
                    ...(impact != null ? [{ l: 'Est. score impact', v: `+${impact} pts`, c: GREEN }] : []),
                    ...(impact != null && current != null ? [{ l: 'Projected score (capped)', v: `${projectScore(current, impact)}/100`, c: GREEN }] : []),
                    { l: 'Confidence',    v: `${activeConfidence.value}% (${activeConfidence.label})`, c: BLUE  },
                  ];
                })().map(s => (
                  <div key={s.l} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</p>
                    <p style={{ fontSize: 11, color: GRAY }}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
    </PlanPageGuard>
  );
}

export default function FixPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: GRAY }}>Loading...</div>}>
      <FixEngineContent />
    </Suspense>
  );
}
