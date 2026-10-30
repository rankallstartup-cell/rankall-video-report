'use client';

import { useState, useEffect } from 'react';
import { AI_REFRESH_NOTE, aiTimeline } from '@/lib/aiRefreshCopy';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase'
import { signalsForCountry, ALL_SIGNALS, type TrustSignalDef } from '@/lib/trustSignals'
import { trustFixGainPoints, sanitizeTitleTagSignal } from '@/lib/trust';
import { getTrustedStoredGoogle, getTrustedDisplayName, type EnrichmentData } from '@/lib/enrichment';
const supabase = getBrowserClient();

// Map a runtime signal's display label to a canonical TRUST_SIGNALS entry by
// normalized contains/startsWith. Returns the matched canonical def, or null if
// no confident match (in which case the signal is always shown — never hidden).
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Explicit aliases mapping a runtime signal name (or its humanLabel) to the
// canonical TRUST_SIGNALS id, for cases where labels diverge and prefix/contains
// matching is not reliable (e.g. "BBB" vs "Better Business Bureau").
const CANONICAL_ALIASES: Record<string, string> = {
  bbb: 'bbb',
  bbblisting: 'bbb',
  bbbaccreditation: 'bbb',
  betterbusinessbureau: 'bbb',
  yelp: 'yelp',
  yelplisting: 'yelp',
  yelpbusinesslisting: 'yelp',
  yelpprofile: 'yelp',
  healthgrades: 'healthgrades',
  healthgradeslisting: 'healthgrades',
  healthgradesprofile: 'healthgrades',
};

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const AMBER  = '#D97706';
const RED    = '#DC2626';
const PURPLE = '#1B17FF';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';

interface TrustSignal {
  name: string;
  status: 'good' | 'warning' | 'danger' | 'missing' | 'not_checked';
  value: string;
  impact: 'high' | 'medium' | 'low';
  fixAvailable: boolean;
}

interface TrustSignalReport {
  technical: TrustSignal[];
  directory: TrustSignal[];
  reviews: TrustSignal[];
  community: TrustSignal[];
  // ax88: present on scans saved after this change; older scans omit it.
  aiPlatforms?: TrustSignal[];
  overall: number;
}

const CAT_META = [
  { key: 'technical' as const, label: 'Technical',  color: AMBER,  desc: 'How well your website is set up for AI discovery' },
  { key: 'directory' as const, label: 'Directory',  color: GREEN,  desc: 'Your presence on business directories AI platforms check' },
  { key: 'reviews'   as const, label: 'Reviews',    color: BLUE,   desc: 'What customers are saying across review platforms' },
  { key: 'community' as const, label: 'Community',  color: PURPLE, desc: 'Whether people discuss your business online' },
  { key: 'aiPlatforms' as const, label: 'AI Platforms', color: '#0891B2', desc: 'How consistently AI platforms see and recommend you' },
];

// ── Human-readable label map ──────────────────────────────────────────
const LABEL_MAP: Record<string, string> = {
  'FAQ Schema':                  'AI-Friendly FAQ on Website',
  'FAQPage Schema':              'AI-Friendly FAQ on Website',
  'LocalBusiness JSON-LD':       'Business Data Markup',
  'LocalBusiness Schema':        'Business Data Markup',
  'Response rate signals':       'Review Response Rate',
  'Review Response Rate':        'Review Response Rate',
  'Multi-platform reviews':      'Reviews on Multiple Sites',
  'Review count':                'Review Count Visibility',
  'Review Count':                'Review Count Visibility',
  'HTTPS':                       'Secure Website (HTTPS)',
  'Meta Description':            'Search Description Tag',
  'Meta description':            'Search Description Tag',
  'Open Graph Tags':             'Social Sharing Preview',
  'Open Graph tags':             'Social Sharing Preview',
  'Twitter Card':                'Twitter/X Preview Card',
  'Canonical URL':               'Preferred Page Address',
  'H1 Tag':                      'Main Page Heading',
  'H1 tag':                      'Main Page Heading',
  'Title Tag':                   'Page Title Tag',
  'Title tag':                   'Page Title Tag',
  'Blog or Content Section':     'Blog / Content Section',
  'Blog section':                'Blog / Content Section',
  'Services Page':               'Services or Products Page',
  'Services page':               'Services or Products Page',
  'Contact page':                'Contact Page',
  'Phone number on page':        'Phone Number on Page',
  'Address on page':             'Address on Page',
  'Reviews or Testimonials':     'On-Site Testimonials',
  'Structured Data (any schema)':'Structured Data Present',
  'Image Alt Text':              'Image Descriptions',
  'Image alt text':              'Image Descriptions',
  'Content Freshness':           'Content Up to Date',
  'Google Business Profile':     'Google Business Profile',
  'Google Business':             'Google Business Profile',
  'Yelp listing':                'Yelp Business Listing',
  'Yelp Listing':                'Yelp Business Listing',
  'Yelp':                        'Yelp Business Listing',
  'BBB listing':                 'BBB Accreditation',
  'BBB Listing':                 'BBB Accreditation',
  'BBB':                         'BBB Accreditation',
  'Healthgrades':                'Healthgrades Listing',
  'Zocdoc':                      'Zocdoc Listing',
  'Facebook':                    'Facebook Business Page',
  'Trustpilot':                  'Trustpilot Listing',
  'LinkedIn':                    'LinkedIn Company Page',
  'Nextdoor mentions':           'Nextdoor Community Presence',
  'Nextdoor presence':           'Nextdoor Community Presence',
  'Reddit mentions':             'Reddit Mentions',
  'Reddit':                      'Reddit Mentions',
  'Local news citations':        'Local News Coverage',
  'Local news mentions':         'Local News Coverage',
  'Awards or recognition':       'Awards & Recognition',
  'Forum mentions':              'Online Forum Mentions',
  'Review mentions':             'Reviews Surfaced by AI',
  'Rating mentions':             'Star Ratings Visible',
  'Review recency':              'Review Recency',
  'Review keywords':             'Positive Review Keywords',
  'Citation count':              'Business Citation Count',
  'NAP consistency':             'Name, Address & Phone Consistency',
};

function humanLabel(raw: string): string {
  return LABEL_MAP[raw] ?? raw;
}

// ── Fix instructions per signal ────────────────────────────────────────
interface FixInstruction {
  steps: string[];
  timeline: string;
}

const FIX_INSTRUCTIONS: Record<string, FixInstruction> = {
  'AI-Friendly FAQ on Website': {
    steps: [
      'Write 5–8 questions your customers most frequently ask (e.g. "Do you accept insurance?", "How long does it take?")',
      'Go to rankall.io/dashboard/fix to get your pre-generated FAQPage JSON-LD code',
      'Paste the code block just before the </head> tag on your website homepage',
      'Verify it worked: paste your URL into Google\'s Rich Results Test at search.google.com/test/rich-results',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Business Data Markup': {
    steps: [
      'Get your pre-generated LocalBusiness JSON-LD from rankall.io/dashboard/fix',
      'Verify all details are correct: name, address, phone, hours, and website URL',
      'Paste the script block just before the </head> tag on your homepage',
      'Test it at search.google.com/test/rich-results — it should show "LocalBusiness" detected',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Google Business Profile': {
    steps: [
      'Go to business.google.com and search for your business name',
      'Click "Claim this business" — or "Add your business" if not listed',
      'Fill in your full name, address, phone, hours, and business category',
      'Choose verification method (postcard, phone, or video — postcard takes 5–7 days)',
      'Once verified, add 5+ photos, your services list, and a business description',
    ],
    timeline: aiTimeline('Google verifies the listing first (time depends on the method).'),
  },
  'Yelp Business Listing': {
    steps: [
      'Go to biz.yelp.com and search for your business',
      'Click "Claim this business" — or "Add a business" if not found',
      'Complete your full profile: hours, phone, website, photos, and description',
      'Respond to any existing reviews (even old ones) to show activity',
      'Add your business to the correct categories so AI search finds you',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'BBB Accreditation': {
    steps: [
      'Go to bbb.org and click "For Businesses"',
      'Search for your business — if listed, claim it free of charge',
      'Fill in your full contact details, categories, and business description',
      'Respond to any existing reviews or complaints to improve your rating',
      'Optional: apply for BBB Accreditation (paid; pricing varies by local BBB)',
    ],
    timeline: aiTimeline('BBB sets its own listing and accreditation review times.'),
  },
  'Name, Address & Phone Consistency': {
    steps: [
      'Search your business name on Google — note every site that lists your info',
      'Check Yelp, Facebook, Apple Maps, Bing Places, and any industry directories',
      'Make sure your name, address, and phone are identical on every site (same abbreviations, same suite format)',
      'Update any mismatches directly on each platform — prioritise Google, Yelp, and Facebook first',
      'Run a free citation audit at whitespark.ca or brightlocal.com to catch any you missed',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Reddit Mentions': {
    steps: [
      'Search Reddit for your city + industry (e.g. "r/chicago dentist") — identify 2–3 active subreddits',
      'Create or use a personal Reddit account — do not create a business account',
      'Spend 1 week reading and upvoting helpful posts before posting yourself',
      'Answer a genuine question in your area of expertise without mentioning your business',
      'After 2–3 helpful posts, naturally mention your business in a relevant thread when it genuinely fits',
    ],
    timeline: AI_REFRESH_NOTE
  },
  'Nextdoor Community Presence': {
    steps: [
      'Go to nextdoor.com/business and claim or create your free business page',
      'Complete your profile with photos, hours, services, and a genuine description',
      'Ask 2–3 local customers who use Nextdoor to recommend your business on the platform',
      'Respond to any community posts in your neighbourhood where your expertise is relevant',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Local News Coverage': {
    steps: [
      'Identify 2–3 local news sites or community blogs that cover local businesses',
      'Email the editor with a story angle: milestone anniversary, charity event, community initiative, or expert commentary',
      'Alternatively, write a guest column or "expert tip" piece and pitch it to a local business journal',
      'Make sure your business name and website URL appear in the article',
    ],
    timeline: aiTimeline('Publication timing is up to the editor.'),
  },
  'Online Forum Mentions': {
    steps: [
      'Search Quora for questions in your industry (e.g. "how often should I get a dental checkup?")',
      'Write a genuinely helpful, detailed answer — do not promote your business directly',
      'Include your business name naturally in your bio or at the end: "I run [Business] in [City]"',
      'Find 1–2 niche forums related to your industry and contribute answers over 2–4 weeks',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Review Response Rate': {
    steps: [
      'Open your Google Business Profile and go to Reviews',
      'Reply to every unanswered review — even a brief "Thank you for your kind words, [name]!" counts',
      'For negative reviews: acknowledge, apologise, and offer to resolve offline',
      'Set a weekly reminder to reply to new reviews within 48 hours going forward',
      'Do the same on Yelp and Facebook if you have reviews there',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Reviews on Multiple Sites': {
    steps: [
      'Email your last 10–20 customers with a simple ask: "We\'d love a Yelp review if you have a minute"',
      'Add a Yelp and Facebook review link to your email signature and thank-you receipts',
      'Ask customers who left Google reviews if they\'d share on one other platform',
      'Target at least 3 platforms: Google, Yelp, and one industry-specific site (Healthgrades, Houzz, Avvo, etc.)',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Review Count Visibility': {
    steps: [
      'Add a "Leave us a review" link to your email signature with a direct link to your Google review form',
      'Add a QR code to receipts, invoices, or business cards pointing to your Google review page',
      'Ask 5 satisfied customers by name this week — a direct personal ask converts better than a generic link',
      'Reply to all existing reviews to signal activity and encourage more',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Secure Website (HTTPS)': {
    steps: [
      'Log in to your web hosting control panel (cPanel, Cloudflare, etc.)',
      'Look for "SSL/TLS" or "Let\'s Encrypt" — most hosts offer free SSL in one click',
      'Enable the SSL certificate for your domain',
      'Set up a redirect: all http:// traffic should automatically forward to https://',
      'Test at ssllabs.com/ssltest to confirm it\'s working correctly',
    ],
    timeline: aiTimeline('SSL is live as soon as your host enables it.'),
  },
  'Search Description Tag': {
    steps: [
      'Write a 140–160 character summary of your business: what you do, where, and your key differentiator',
      'Add it to your homepage HTML: <meta name="description" content="Your text here">',
      'In WordPress: use Yoast or RankMath — edit the "Meta description" field in the page editor',
      'In Squarespace/Wix/Webflow: find "SEO settings" for the page and paste in the description',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Blog / Content Section': {
    steps: [
      'Identify 3 questions your customers ask most often (look at your Google reviews or DMs)',
      'Write a 400–600 word article answering one question clearly — no fluff, just useful info',
      'Publish it on a /blog or /articles section of your website',
      'Add your city and industry in the article title naturally (e.g. "5 Signs You Need a Chicago Plumber Today")',
      'Publish one new article per month minimum',
    ],
    timeline: AI_REFRESH_NOTE
  },
  'Services or Products Page': {
    steps: [
      'Create a /services page that lists every service you offer',
      'Give each service its own short paragraph describing what it includes and who it\'s for',
      'Add your city naturally in at least one service description',
      'Link to the services page from your homepage navigation',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'On-Site Testimonials': {
    steps: [
      'Ask 3–5 recent happy customers for a short quote you can use on your website',
      'Add a Testimonials or Reviews section to your homepage — above the fold if possible',
      'Include the customer\'s first name, last initial, and service they received',
      'Consider adding a star rating graphic alongside each quote',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Content Up to Date': {
    steps: [
      'Check your homepage — does it mention current prices, hours, or seasonal services?',
      'Update one thing on your homepage this week: a price, a phone number, or add a new service',
      'Publish a new blog post or update an existing article with current information',
      'Update the copyright year in your footer',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Image Descriptions': {
    steps: [
      'In your website editor, click on each image and find the "Alt text" or "Alternative text" field',
      'Write a 5–10 word description of what the image shows (e.g. "Dr Smith performing dental exam Chicago")',
      'Include your city and service in at least 2–3 image alt texts',
      'In WordPress: edit each image in the Media Library and fill in the "Alternative Text" field',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Main Page Heading': {
    steps: [
      'Make sure your homepage has exactly one H1 tag — not zero, not two',
      'Write it to include your main service and city: e.g. "Trusted Plumber in Houston, TX"',
      'In WordPress page editor: the first "Heading 1" block is your H1',
      'In HTML: <h1>Trusted Plumber in Houston, TX</h1> near the top of your page',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Page Title Tag': {
    steps: [
      'Write a title under 60 characters: "[Business Name] — [Service] in [City]"',
      'Add it to your homepage HTML: <title>Your Title Here</title>',
      'In WordPress: the "SEO Title" field in Yoast or RankMath at the bottom of the page editor',
      'In Squarespace: Page Settings → SEO → Title',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Social Sharing Preview': {
    steps: [
      'Add these three meta tags to your homepage <head>:',
      '<meta property="og:title" content="Your Business Name — Service in City">',
      '<meta property="og:description" content="Short description of your business">',
      '<meta property="og:image" content="https://yourdomain.com/og-image.jpg"> (1200×630px recommended)',
      'Test at developers.facebook.com/tools/debug to see the preview',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Twitter/X Preview Card': {
    steps: [
      'Add these tags to your homepage <head>:',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="Your Business Name">',
      '<meta name="twitter:description" content="Short description">',
      'Test at cards-dev.twitter.com/validator',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Preferred Page Address': {
    steps: [
      'Add this tag to your homepage <head>: <link rel="canonical" href="https://yourdomain.com/">',
      'Make sure the URL exactly matches how you want it indexed (with or without www, trailing slash)',
      'In WordPress: Yoast and RankMath set this automatically — check it\'s enabled in plugin settings',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Structured Data Present': {
    steps: [
      'Start with the Business Data Markup fix — adding LocalBusiness JSON-LD satisfies this signal',
      'Go to rankall.io/dashboard/fix to get your pre-built JSON-LD code',
      'Paste it before the </head> tag on your homepage',
      'Verify at search.google.com/test/rich-results',
    ],
    timeline: AI_REFRESH_NOTE,
  },
  'Business Citation Count': {
    steps: [
      'Submit your business (name, address, phone, website) to these free directories this week:',
      '1. Bing Places — bingplaces.com',
      '2. Apple Maps — mapsconnect.apple.com',
      '3. Foursquare — business.foursquare.com',
      '4. Manta — manta.com/claim',
      '5. Hotfrog — hotfrog.com',
      'Use the exact same NAP on all of them as your Google Business Profile',
    ],
    timeline: AI_REFRESH_NOTE,
  },
};

function getFixInstructions(name: string): FixInstruction | null {
  const label = humanLabel(name);
  return FIX_INSTRUCTIONS[label] ?? null;
}

// ── Per-signal plain-English copy ─────────────────────────────────────
interface SignalCopy {
  whatThisMeans: string;
  whyItMatters: string;
  whatToDo?: React.ReactNode;
  maintain?: string;
}

function getSignalCopy(name: string, status: string): SignalCopy {
  const isGood = status === 'good';
  const key = humanLabel(name);

  const copies: Record<string, SignalCopy> = {
    'AI-Friendly FAQ on Website': {
      whatThisMeans: 'A special code block on your site that lets AI read your most common questions and answers directly.',
      whyItMatters: 'ChatGPT and Gemini pull FAQ answers directly from this markup — businesses with it get cited more often.',
      whatToDo: 'Add a FAQ section to your homepage and mark it up with FAQPage JSON-LD schema. Your web developer can do this in under an hour.',
    },
    'Business Data Markup': {
      whatThisMeans: 'Hidden code on your website that tells AI your exact business name, address, phone, and hours.',
      whyItMatters: 'AI platforms often skip businesses without this when answering "who should I call?" queries.',
      whatToDo: 'Ask your developer to add a LocalBusiness JSON-LD block to your homepage <head> tag. Takes about 15 minutes.',
    },
    'Review Response Rate': {
      whatThisMeans: 'How consistently you reply to customer reviews on Google, Yelp, and other platforms.',
      whyItMatters: 'Replying to reviews shows an active, engaged business to customers and to platforms that read review data.',
      whatToDo: 'Reply to your last 10 unanswered Google reviews this week. Even \'Thank you for your kind words!\' improves your response rate signal.',
      maintain: 'Reply to every new review within 48 hours to keep your response rate signal strong.',
    },
    'Review Recency': {
      whatThisMeans: 'How recently your business has received new reviews across all platforms.',
      whyItMatters: 'AI platforms prefer businesses with fresh social proof. Reviews older than 3 months carry less weight than recent ones.',
      whatToDo: 'Ask your last 5 happy customers to leave a Google review. Send them a direct link to your Google review page.',
      maintain: 'Maintain momentum by asking every new customer for a Google review.',
    },
    'Reviews Surfaced by AI': {
      whatThisMeans: 'Whether AI platforms mention your customer reviews when answering recommendation queries about your business.',
      whyItMatters: 'When AI surfaces your reviews, customers searching for businesses like yours see your social proof directly in the answer.',
      whatToDo: 'Build review volume on Google and Yelp, and keep them fresh — AI surfaces reviews from businesses with active, recent feedback.',
      maintain: 'Maintain momentum by asking every new customer for a Google review.',
    },
    'Star Ratings Visible': {
      whatThisMeans: 'Whether your star ratings appear in AI platform responses about your business.',
      whyItMatters: 'Star ratings let AI signal quality to users comparing businesses. Without visible ratings, AI cannot vouch for you.',
      whatToDo: 'Grow your Google and Yelp review counts so your average star rating is established and gets cited by AI.',
      maintain: 'Keep collecting reviews so your rating stays current and visible to AI platforms.',
    },
    'Positive Review Keywords': {
      whatThisMeans: 'Whether AI detects positive descriptive words (friendly, professional, reliable) in reviews about your business.',
      whyItMatters: 'These keywords tell AI — and customers — exactly what makes your service good, beyond just a star number.',
      whatToDo: 'Encourage happy customers to describe their experience in detail when reviewing, not just leave a star rating.',
      maintain: 'Keep encouraging detailed reviews so positive keywords stay associated with your business.',
    },
    'Reviews on Multiple Sites': {
      whatThisMeans: 'Whether customers have reviewed you on more than one platform (Google, Yelp, Facebook, etc.).',
      whyItMatters: 'Reviews on more than one platform corroborate each other and give AI more independent sources to draw on.',
      whatToDo: 'Email your 10 most recent customers asking for a Yelp or Facebook review — most Google reviewers haven\'t done this yet.',
    },
    'Review Count Visibility': {
      whatThisMeans: 'The total number of public reviews your business has across all platforms.',
      whyItMatters: 'Review volume is a common proxy for how established a business is. A very small number of reviews gives AI little to go on.',
      whatToDo: 'Add a "Leave us a review" link to your email signature and receipts. Ask every satisfied customer this month.',
      maintain: 'Maintain momentum by asking every new customer for a Google review.',
    },
    'Secure Website (HTTPS)': {
      whatThisMeans: 'Whether your website uses a secure, encrypted connection (the padlock in the browser bar).',
      whyItMatters: 'Google AI and Perplexity apply a trust penalty to non-HTTPS sites and rarely recommend them.',
      whatToDo: 'Contact your web host and enable SSL — it\'s free through most providers. Usually done with one click.',
    },
    'Search Description Tag': {
      whatThisMeans: 'A short sentence under your page title in search results that describes what your business does.',
      whyItMatters: 'AI reads this to understand your business at a glance. Missing it means AI may describe you incorrectly.',
      whatToDo: 'Add a meta description to your homepage — 140–160 characters summarising your main service and location.',
    },
    'Google Business Profile': {
      whatThisMeans: 'Your free business profile on Google that appears in Maps, Search, and AI results.',
      whyItMatters: 'Google Business Profile is one of the main sources of local business data (hours, location, reviews) that search and AI features read. An incomplete profile gives them less to work with.',
      whatToDo: 'Claim your profile at business.google.com. Verify, add photos, and complete every field including services and hours.',
      maintain: 'Post updates, add fresh photos, and respond to reviews monthly to keep your profile active.',
    },
    'Yelp Business Listing': {
      whatThisMeans: 'Your business page on Yelp, one of the key directories AI uses to verify local businesses.',
      whyItMatters: 'Yelp data feeds into ChatGPT and Perplexity local results. An unclaimed listing hurts your credibility.',
      whatToDo: 'Claim your Yelp listing at biz.yelp.com and make sure your name, address, and phone are correct.',
      maintain: 'Keep your Yelp profile updated with current hours, photos, and respond to every review within 48 hours.',
    },
    'Healthgrades Listing': {
      whatThisMeans: 'Your provider profile on Healthgrades, a leading directory for medical and dental practices.',
      whyItMatters: 'Healthgrades is a common source for healthcare provider information. A missing or thin profile gives AI and patients less to go on.',
      whatToDo: 'Claim your free profile at healthgrades.com/provider-login and complete your credentials, photo, and specialties.',
      maintain: 'Add your credentials, photo, and patient education content to strengthen your Healthgrades profile.',
    },
    'Zocdoc Listing': {
      whatThisMeans: 'Your bookable provider profile on Zocdoc, a major healthcare scheduling and discovery platform.',
      whyItMatters: 'AI platforms surface Zocdoc profiles for healthcare booking queries. Being listed adds visibility and convenience.',
      whatToDo: 'Join at zocdoc.com/join and complete your profile with availability, insurances accepted, and a photo.',
      maintain: 'Keep your availability and accepted insurances current so patients can always book.',
    },
    'Facebook Business Page': {
      whatThisMeans: 'Your business page on Facebook, which AI platforms check for activity, reviews, and contact info.',
      whyItMatters: 'An active Facebook page signals a real, operating business and feeds recommendation and review data to AI.',
      whatToDo: 'Create or claim your Facebook Business Page, complete your About section, and post occasionally to stay active.',
      maintain: 'Post once or twice a month and keep your hours and contact details accurate.',
    },
    'Trustpilot Listing': {
      whatThisMeans: 'Your review profile on Trustpilot, a widely cited independent review platform.',
      whyItMatters: 'AI platforms treat Trustpilot reviews as third-party trust signals, especially in the UK and Europe.',
      whatToDo: 'Claim your free profile at business.trustpilot.com and invite recent customers to review you there.',
      maintain: 'Invite new customers to review you on Trustpilot and respond to feedback regularly.',
    },
    'LinkedIn Company Page': {
      whatThisMeans: 'Your company page on LinkedIn, which AI uses to verify your business as a legitimate organisation.',
      whyItMatters: 'A LinkedIn presence strengthens your entity profile and authority signals that AI platforms read.',
      whatToDo: 'Create a LinkedIn Company Page, add your logo, description, website, and location, then post occasionally.',
      maintain: 'Keep your company details current and post updates to stay active.',
    },
    'BBB Accreditation': {
      whatThisMeans: 'Whether your business is listed and accredited with the Better Business Bureau.',
      whyItMatters: 'A BBB listing is a third-party record that your business exists and how it handles complaints, which AI answers can reference.',
      whatToDo: 'Register at bbb.org. Free listing takes 15 minutes. Accreditation adds extra credibility.',
      maintain: 'Respond to any complaints promptly to keep your BBB rating high.',
    },
    'NAP Consistency': {
      whatThisMeans: 'Whether your business Name, Address, and Phone number are identical everywhere online.',
      whyItMatters: 'Inconsistent NAP data confuses AI — it may list the wrong location or skip you entirely for local queries.',
      whatToDo: 'Search your business name on Google and check that your NAP matches on every site. Fix any differences within the week.',
    },
    'Reddit Mentions': {
      whatThisMeans: 'Whether your business has been discussed on Reddit forums relevant to your area or industry.',
      whyItMatters: 'Reddit discussions are a common source for AI answers, so organic mentions of your business there can surface in AI responses.',
      whatToDo: 'Ask a satisfied customer to share their experience in a relevant local or industry subreddit — naturally, not as an ad.',
    },
    'Nextdoor Community Presence': {
      whatThisMeans: 'Whether your business is active and recommended on Nextdoor, the neighborhood app.',
      whyItMatters: 'Perplexity and Claude increasingly cite Nextdoor recommendations for local service businesses. Neighbors trust neighbors.',
      whatToDo: 'Claim your free Nextdoor Business Page at business.nextdoor.com. Ask happy customers to recommend you there.',
      maintain: 'Stay active on Nextdoor and ask satisfied customers to recommend you to keep your presence strong.',
    },
    'Awards & Recognition': {
      whatThisMeans: 'Whether your business has awards, certifications, or "best of" recognition that AI platforms can cite.',
      whyItMatters: 'A named award from a real organisation is something AI answers can cite to set you apart from similar businesses.',
      whatToDo: 'Enter local "best of" awards, pursue industry certifications, and display any recognition prominently on your site.',
      maintain: 'Keep pursuing relevant awards and certifications, and display them on your website and profiles.',
    },
    'Local News Coverage': {
      whatThisMeans: 'Whether your business has been mentioned in local news articles or press.',
      whyItMatters: 'AI platforms treat local press citations as a strong authority signal — like a third-party endorsement.',
      whatToDo: 'Reach out to your local newspaper or news site with a story angle (community event, milestone, new service).',
      maintain: 'Keep pitching local press a few times a year so your coverage stays fresh.',
    },
    'Online Forum Mentions': {
      whatThisMeans: 'Whether people discuss your business in online communities outside Reddit (Quora, niche forums, etc.).',
      whyItMatters: 'Organic forum mentions tell AI that real people trust and recommend your business unprompted.',
      whatToDo: 'Answer 2–3 questions on Quora or a relevant forum as an expert in your field — include your business naturally.',
    },
    'Blog / Content Section': {
      whatThisMeans: 'Whether your website has a regularly updated blog or news section.',
      whyItMatters: 'AI platforms favor businesses that publish helpful content. Fresh content signals an active, credible business.',
      whatToDo: 'Publish one blog post per month answering a common customer question, e.g. \'How often should you visit a dentist?\'.',
      maintain: 'Keep publishing one helpful post a month to maintain freshness.',
    },
    'Services or Products Page': {
      whatThisMeans: 'Whether your website has a dedicated page listing all your services.',
      whyItMatters: 'AI platforms pull service information directly from your services page when answering \'what does [business] offer?\' queries.',
      whatToDo: 'Create a /services page listing each service with a short description. Include your city in the page title.',
      maintain: 'Review your services page quarterly and add any new offerings.',
    },
    'Contact Page': {
      whatThisMeans: 'Whether your website has a dedicated contact page with your address, phone, email, and map.',
      whyItMatters: 'AI platforms verify business legitimacy by checking for accessible contact information. No contact page = lower trust.',
      whatToDo: 'Create a /contact page with your full NAP, a Google Maps embed, and a contact form.',
      maintain: 'Keep your contact details and map accurate on your contact page.',
    },
    'Phone Number on Page': {
      whatThisMeans: 'Whether your phone number appears as clickable text on your website homepage.',
      whyItMatters: 'AI platforms verify businesses by checking if contact info is visible and consistent. Missing phone = lower trust score.',
      whatToDo: 'Add your phone number in text format (not just an image) to your homepage header and footer.',
      maintain: 'Keep your phone number consistent with your Google Business Profile everywhere it appears.',
    },
    'Address on Page': {
      whatThisMeans: 'Whether your physical address appears as readable text on your website.',
      whyItMatters: 'AI platforms use a visible address to confirm where a business is located, which matters for local searches.',
      whatToDo: 'Add your full address in text to your homepage footer. Match it exactly to your Google Business Profile.',
      maintain: 'Keep your address identical to your Google Business Profile across your whole site.',
    },
    'On-Site Testimonials': {
      whatThisMeans: 'Customer quotes or reviews shown directly on your website.',
      whyItMatters: 'On-site social proof signals to AI that real customers have validated your business.',
      whatToDo: 'Add 3–5 real customer quotes to your homepage or a dedicated testimonials page this week.',
    },
    'Content Up to Date': {
      whatThisMeans: 'Whether your website content has been updated recently.',
      whyItMatters: 'AI platforms de-prioritise sites that look stale — fresh content signals an active, reliable business.',
      whatToDo: 'Update your homepage text, add a new blog post, or refresh your services page with current offerings.',
    },
    'Image Descriptions': {
      whatThisMeans: 'Text descriptions attached to images on your website that AI and search engines can read.',
      whyItMatters: 'AI platforms index image alt text to understand your business context. Missing alt text means AI misses visual proof of your services.',
      whatToDo: 'Add descriptive alt text to every image, e.g. alt=\'Dr Smith performing dental cleaning at Naperville office\'.',
      maintain: 'Add alt text to every new image you upload going forward.',
    },
    'Main Page Heading': {
      whatThisMeans: 'The main heading on your webpage. AI platforms read this first to understand what your business does and where you\'re located.',
      whyItMatters: 'Businesses with keyword-rich H1 tags appear in AI recommendations more often. Include your service and city.',
      whatToDo: 'Update your homepage H1 to include your primary service and city, e.g. \'Naperville Family Dentistry — Accepting New Patients\'.',
      maintain: 'Keep your H1 aligned with your main service and city as your business evolves.',
    },
    'Page Title Tag': {
      whatThisMeans: 'The text that appears in browser tabs and search results. This is the first thing AI reads about your page.',
      whyItMatters: 'Title tags tell AI exactly what your business does and where. Optimized titles appear in AI recommendations more often.',
      whatToDo: 'Update your homepage title tag to \'[Business Name] — [Service] in [City], [State]\'.',
      maintain: 'Keep your title tag accurate to your business name, service, and city.',
    },
    'Social Sharing Preview': {
      whatThisMeans: 'The preview image, title and description that appears when someone shares your site on social media.',
      whyItMatters: 'AI platforms check Open Graph tags as an engagement signal. Missing tags look like an abandoned site.',
      whatToDo: 'Add og:title, og:description, and og:image meta tags to your homepage <head> section.',
    },
    'Twitter/X Preview Card': {
      whatThisMeans: 'How your website appears when shared on Twitter/X.',
      whyItMatters: 'Enables rich card previews that increase click-through and signal an active online presence to AI.',
      whatToDo: 'Add twitter:card, twitter:title, and twitter:description meta tags to your homepage.',
    },
    'Preferred Page Address': {
      whatThisMeans: 'A tag telling search engines and AI which URL is the "official" version of your page.',
      whyItMatters: 'Without it, AI may index duplicate URLs and dilute your trust signals across them.',
      whatToDo: 'Add <link rel="canonical" href="https://yourdomain.com"> to your homepage <head> tag.',
    },
    'Structured Data Present': {
      whatThisMeans: 'Any form of machine-readable data markup on your site (not just LocalBusiness schema).',
      whyItMatters: 'Structured data is the main way AI platforms read and verify your business details at scale.',
      whatToDo: 'Start with a LocalBusiness JSON-LD block — see the Business Data Markup fix for the exact code.',
    },
    'Business Citation Count': {
      whatThisMeans: 'How many different websites list your business name, address, and phone number.',
      whyItMatters: 'More citations across trusted sites = higher AI confidence that your business is real and established.',
      whatToDo: 'Submit your business to 5 free directories this week: Bing Places, Apple Maps, Foursquare, Manta, and Hotfrog.',
    },
  };

  const fallback: SignalCopy = {
    whatThisMeans: 'A signal AI platforms use to evaluate how trustworthy and visible your business is online.',
    whyItMatters: 'Improving this signal increases the likelihood AI platforms recommend your business.',
    whatToDo: 'Visit the Fix Engine for a step-by-step guide to improving this signal.',
  };

  const copy = copies[key] ?? fallback;
  if (isGood) {
    const maintenance = copy.maintain ?? 'maintain this signal by reviewing it monthly';
    return {
      whatThisMeans: copy.whatThisMeans,
      whyItMatters: copy.whyItMatters,
      whatToDo: (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Great work! Keep it up — {maintenance}</>),
    };
  }
  return copy;
}

// ── Status helpers ────────────────────────────────────────────────────
const statusColor = (s: string) => s === 'good' ? GREEN : s === 'warning' ? AMBER : s === 'not_checked' ? GRAY : RED;
const statusBg    = (s: string) => s === 'good' ? '#ECFDF5' : s === 'warning' ? '#FFFBEB' : s === 'not_checked' ? BG : '#FEF2F2';
const statusBd    = (s: string) => s === 'good' ? '#A7F3D0' : s === 'warning' ? '#FDE68A' : s === 'not_checked' ? BORDER : '#FECACA';
const statusLabel = (s: string) =>
  s === 'not_checked' ? 'Not checked' : s === 'good' ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Passing</>) : s === 'warning' ? (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>{' '}Needs attention</>) : s === 'danger' ? (<><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>{' '}Critical</>) : (<><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>{' '}Not found</>);

// ── Expandable fix section component ─────────────────────────────────
function HowToFix({ name, expanded, onToggle, status, signals }: { name: string; expanded: boolean; onToggle: () => void; status: string; signals: Array<{ status: string }> }) {
  const fix = getFixInstructions(name);
  if (!fix) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: BLUE, background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'space-between' }}
      >
        <span><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg> How to fix this</span>
        <span style={{ fontSize: 10 }}>{expanded ? (<><svg viewBox="0 0 320 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg>{' '}Hide</>) : (<><svg viewBox="0 0 320 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>{' '}Show steps</>)}</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 8, background: W, border: '1.5px solid #C9C6FF', borderRadius: 10, padding: '14px 16px' }}>
          {/* Steps */}
          <p style={{ fontSize: 11, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Step-by-step</p>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {fix.steps.map((step, i) => (
              <li key={i} style={{ fontSize: 12, color: NAVY, lineHeight: 1.6, marginBottom: 6 }}>{step}</li>
            ))}
          </ol>
          {/* Timeline + impact */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: AMBER, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 100, padding: '4px 10px', lineHeight: 1.45 }}>
              <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M176 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l16 0 0 34.4C92.3 113.8 16 200 16 304c0 114.9 93.1 208 208 208s208-93.1 208-208c0-41.8-12.3-80.7-33.5-113.2l24.1-24.1c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L355.7 143c-28.1-23-62.2-38.8-99.7-44.6L256 64l16 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L224 0 176 0zm72 192l0 128c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-128c0-13.3 10.7-24 24-24s24 10.7 24 24z"/></svg> {fix.timeline}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '4px 10px' }}>
              <svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg> Est. impact: +{trustFixGainPoints({ status }, signals)} pts
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrustPage() {
  const [trustData, setTrustData] = useState<TrustSignalReport | null>(null);
  const [loading, setLoading]     = useState(true);
  const [noScan, setNoScan]       = useState(false);
  const [expandedFix, setExpandedFix] = useState<string | null>(null);
  const [country, setCountry]     = useState('US');
  // ax89: the scan's industry, so industry-only signals (e.g. Healthgrades)
  // are filtered for businesses outside that industry.
  const [industry, setIndustry]   = useState('');
  const [scanDate, setScanDate]   = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // b8ad: page-level sign-in gate — logged-out visitors used to get the
  // full report shell with zeroed counts and no way forward. null =
  // unknown (still checking); false = signed out -> gate; true = signed in.
  const [signedIn, setSignedIn]   = useState<boolean | null>(null);
  // b8ad: provenance — which business + which scan these signals belong
  // to. The page never named the business, so a reader had to cross-check
  // /dashboard to know the signals were Royal Lane's, not rankall.io's.
  const [displayName, setDisplayName] = useState('');
  const [scanInput, setScanInput]     = useState('');

  async function fetchData() {
    setLoadError(false);
    setNoScan(false);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSignedIn(false); setLoading(false); return; }
      setSignedIn(true);

      const { data: scan, error } = await supabase
        .from('rankall_scans')
        // ax8r: created_at included so the page can show which scan these
        // signals came from (staleness was invisible before).
        // b8ad: user_business_name + input + location feed the provenance
        // header via getTrustedDisplayName (never the wrong business's name).
        .select('trust_signals, country_code, created_at, industry, input, location, user_business_name, enrichment')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // PGRST116 = no rows; treat as "no scan", not an error.
      if (error && error.code !== 'PGRST116') throw error;
      if (!scan || !scan.trust_signals) { setNoScan(true); setLoading(false); return; }
      if (scan.country_code) setCountry(String(scan.country_code).toUpperCase());
      if ((scan as any).industry) setIndustry(String((scan as any).industry));
      if ((scan as any).created_at) setScanDate(String((scan as any).created_at));
      // b8ad: provenance — trusted display name (falls back to the scan's
      // own input when the stored Google name fails re-validation, so a
      // poisoned row can never re-label the report) + the scanned input.
      const scanRow = scan as { input?: string | null; location?: string | null; user_business_name?: string | null; enrichment?: { google?: EnrichmentData['google'] | null } | null };
      setDisplayName(getTrustedDisplayName(scanRow.input, scanRow.location, scanRow.user_business_name, scanRow.enrichment?.google ?? null));
      setScanInput(String(scanRow.input ?? ''));
      // #40: same title-tag sanitiser as the report page — never quote a
      // title that may belong to another business (unverified website or
      // a stored Google record that no longer passes the match check).
      const raw = scan.trust_signals as TrustSignalReport;
      const storedGoogle = scanRow.enrichment?.google ?? null;
      const googleMismatch = !!storedGoogle && !getTrustedStoredGoogle(scanRow.input, scanRow.location, storedGoogle);
      setTrustData({
        ...raw,
        technical: (raw.technical ?? []).map(sig => sanitizeTitleTagSignal(sig, googleMismatch) as TrustSignal),
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div style={{ padding: 40, color: GRAY }}>Loading...</div>;

  if (loadError) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 60, color: GRAY }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg></div>
        <h3 style={{ color: NAVY, marginBottom: 8 }}>Something went wrong</h3>
        <p style={{ marginBottom: 16 }}>We couldn't load your trust signals. Please try again.</p>
        <button onClick={fetchData} style={{ background: PURPLE, color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' }}>Try Again</button>
      </div>
    </div>
  );

  // b8ad: signed-out visitors get the gate, not the report shell with
  // zeroed counts and a stale sidebar. Same pattern as /dashboard/usage.
  if (signedIn === false) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Sign in to view your trust report.</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          Your trust signals belong to your account. Sign in to see them, or run a free scan to get your first report.
        </p>
        <Link href="/login?next=/dashboard/trust" style={{ display: 'inline-block', background: PURPLE, color: 'white', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in</Link>
      </div>
    </div>
  );

  if (noScan) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8l0 378.1C394 378 431.1 230.1 432 141.4L256 66.8s0 0 0 0z"/></svg></div>
        <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>No trust signals yet</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          Run a scan to see your trust score — dozens of signals checked across technical setup, business directories, reviews, community mentions, and AI platform coverage.
        </p>
        <Link href="/" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Run my first scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
    </div>
  );

  const allSignals = trustData
    ? [...(trustData.technical ?? []), ...(trustData.directory ?? []), ...(trustData.reviews ?? []), ...(trustData.community ?? []), ...(trustData.aiPlatforms ?? [])]
    : [];
  // good/warning/danger are computed AFTER the country filter (see visibleSignals
  // below) so the summary pills match the signals actually shown in the list.
  const overallScore = trustData?.overall ?? 0;
  const overallColor = overallScore >= 75 ? GREEN : overallScore >= 50 ? AMBER : RED;

  const toggleFix = (key: string) => setExpandedFix(prev => prev === key ? null : key);

  // ── Country filtering + impact points ────────────────────────────────
  // Signals applicable to this scan's country. We match a runtime signal to a
  // canonical TRUST_SIGNALS entry; if it maps to a known signal that is NOT in
  // the allowed set, we hide it. Unknown/unmappable signals are always shown.
  const allowed = signalsForCountry(country, industry);
  const allowedIds = new Set(allowed.map(s => s.id));

  // Resolve a runtime signal name to a canonical TRUST_SIGNALS def, or null if
  // it cannot be confidently mapped. Tries: explicit alias table, then exact /
  // prefix label matching (normalized). Never guesses on a weak partial.
  const mapToCanonical = (rawName: string): TrustSignalDef | null => {
    const candidates = [normalizeLabel(rawName), normalizeLabel(humanLabel(rawName))];
    for (const c of candidates) {
      const aliasId = CANONICAL_ALIASES[c];
      if (aliasId) {
        const def = ALL_SIGNALS.find(s => s.id === aliasId);
        if (def) return def;
      }
    }
    for (const def of ALL_SIGNALS) {
      const dn = normalizeLabel(def.label);
      for (const c of candidates) {
        if (c.length >= 4 && (c === dn || dn.startsWith(c) || c.startsWith(dn))) return def;
      }
    }
    return null;
  };

  // True only if the signal maps to a KNOWN canonical signal that is excluded
  // for this country. Unmappable signals are always shown (never hidden).
  const isHiddenForCountry = (rawName: string): boolean => {
    const def = mapToCanonical(rawName);
    if (!def) return false;
    return !allowedIds.has(def.id);
  };

  // Only signals actually shown in the list (country filter applied), so every
  // summary pill agrees with what the user sees below.
  const visibleSignals = allSignals.filter(s => !isHiddenForCountry(s.name));
  const good    = visibleSignals.filter(s => s.status === 'good').length;
  const warning = visibleSignals.filter(s => s.status === 'warning').length;
  const danger  = visibleSignals.filter(s => s.status === 'danger' || s.status === 'missing').length;

  // b8ad: score-formula inputs. The score was a bare number with no
  // formula, and the +pts badges (fix-gain estimates) sum past it,
  // which does not explain it. Formula: Passing x 1 + Needs attention
  // x 1/2, divided by MEASURED signals (not_checked excluded — the
  // same rule as calculateOverall), x 100.
  const measuredCount = visibleSignals.filter(s => s.status !== 'not_checked').length;
  const formulaScore = measuredCount > 0 ? Math.round(((good + warning * 0.5) / measuredCount) * 100) : 0;

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px' }}>

      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: '#64748B', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link href="/dashboard" style={{ color: '#1B17FF', textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
        <span>›</span>
        <span>Trust Layer</span>
      </nav>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Trust Layer</p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6, letterSpacing: '-0.5px' }}>Trust Signal Report</h1>
        {displayName && (
          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
            Trust signals for {displayName}
          </p>
        )}
        {scanDate && (
          <p style={{ fontSize: 13, color: GRAY, margin: '0 0 4px' }}>
            From your scan{scanInput ? <> of &ldquo;{scanInput}&rdquo;</> : null} on {new Date(scanDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — rescan to refresh.
          </p>
        )}
        <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, maxWidth: 620 }}>
          These signals tell AI platforms how much to trust your business. Fixing the red and amber signals below directly increases how often AI recommends you.
        </p>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { l: 'Signals tracked',  v: visibleSignals.length, c: BLUE  },
          { l: (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Passing</>),        v: good,               c: GREEN },
          { l: (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>{' '}Needs attention</>),v: warning,            c: AMBER },
          { l: (<><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>{' '}Critical/Missing</>),v: danger,            c: RED   },
        ].map((s, i) => (
          <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 14px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 32, fontWeight: 900, color: s.c, marginBottom: 4, lineHeight: 1 }}>{s.v}</p>
            <p style={{ fontSize: 12, color: GRAY }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* Trust score overview */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Overall Trust Score</p>
            <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, maxWidth: 500 }}>
              Your Trust Score shows how much AI platforms trust your business. Higher scores mean AI is more likely to recommend you when customers search.
            </p>
            {measuredCount > 0 && (
              <p style={{ fontSize: 12, color: GRAY, lineHeight: 1.6, maxWidth: 500, marginTop: 8 }}>
                How it is calculated: each Passing signal counts 1, each Needs attention counts ½, Critical/Missing counts 0, divided by {measuredCount} measured signals{formulaScore === overallScore ? ` — this report: (${good} × 1 + ${warning} × ½) ÷ ${measuredCount} = ${overallScore}` : ''}. Signals never measured are excluded, not scored 0.
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 40, fontWeight: 900, color: overallColor, lineHeight: 1, marginBottom: 2 }}>{overallScore}</p>
            <p style={{ fontSize: 12, color: GRAY }}>/100</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: overallColor, marginTop: 4 }}>
              {overallScore >= 75 ? 'Strong trust signals' : overallScore >= 50 ? 'Room to improve' : 'Needs urgent attention'}
            </p>
          </div>
        </div>
        {/* Per-category counts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginTop: 4 }}>
          {CAT_META.map(cat => {
            // ax8r: category counts used UNFILTERED signals while the summary
            // pills and the visible list use the country filter — counts
            // could disagree with what the user sees. Same filter here.
            const signals   = trustData ? (trustData[cat.key] ?? []).filter(s => !isHiddenForCountry(s.name)) : [];
            const catGood    = signals.filter(s => s.status === 'good').length;
            const catWarning = signals.filter(s => s.status === 'warning').length;
            const catDanger  = signals.filter(s => s.status === 'danger' || s.status === 'missing').length;
            return (
              <div key={cat.key} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: cat.color, marginBottom: 4 }}>{cat.label}</p>
                <p style={{ fontSize: 11, color: LGRAY, marginBottom: 4 }}>{cat.desc}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {catGood > 0    && <span style={{ fontSize: 11, color: GREEN }}>{catGood} passing</span>}
                  {catWarning > 0 && <span style={{ fontSize: 11, color: AMBER }}>{catWarning} warning</span>}
                  {catDanger > 0  && <span style={{ fontSize: 11, color: RED }}>{catDanger} critical</span>}
                  {signals.length === 0 && <span style={{ fontSize: 11, color: LGRAY }}>No data</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signal categories */}
      {CAT_META.map(cat => {
        const signals = trustData ? (trustData[cat.key] ?? []) : [];
        if (signals.length === 0) return null;
        return (
          <div key={cat.key} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ background: `${cat.color}10`, padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{cat.label}</p>
                <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{cat.desc}</p>
              </div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
                {signals.map((sig, si) => {
                  // Country filtering: hide signals that map to a known canonical
                  // signal not applicable to this scan's country (e.g. Healthgrades
                  // for GB). Unmappable signals are always shown.
                  if (isHiddenForCountry(sig.name)) return null;
                  const isGood  = sig.status === 'good';
                  const label   = humanLabel(sig.name);
                  const copy    = getSignalCopy(sig.name, sig.status);
                  const fixKey  = `${cat.key}-${si}`;
                  return (
                    <div key={si} style={{ background: statusBg(sig.status), border: `1.5px solid ${statusBd(sig.status)}`, borderRadius: 12, padding: '16px' }}>

                      {/* Signal name + badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{label}</span>
                            {!isGood && sig.status !== 'not_checked' && (
                              <span style={{ fontSize: 10, fontWeight: 800, color: PURPLE, background: '#ECEBFF', border: '1px solid #DCDAFF', borderRadius: 100, padding: '1px 7px', whiteSpace: 'nowrap' }}>
                                +{trustFixGainPoints(sig, allSignals)} pts if fixed
                              </span>
                            )}
                          </p>
                          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(sig.status), background: W, border: `1px solid ${statusBd(sig.status)}`, borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            {statusLabel(sig.status)}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sig.impact === 'high' ? RED : sig.impact === 'medium' ? AMBER : GRAY, background: BG, borderRadius: 100, padding: '2px 8px', border: `1px solid ${BORDER}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {sig.impact === 'high' ? (<><svg viewBox="0 0 512 512" width="10" height="10" fill="#EF4444" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg>{' '}High</>) : sig.impact === 'medium' ? (<><svg viewBox="0 0 512 512" width="10" height="10" fill="#F59E0B" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg>{' '}Medium</>) : (<><svg viewBox="0 0 512 512" width="13" height="13" fill="#D1D5DB" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg>{' '}Low</>)} impact
                        </span>
                      </div>

                      {/* Raw value */}
                      <p style={{ fontSize: 12, color: GRAY, lineHeight: 1.5, marginBottom: 10 }}>{sig.value}</p>

                      {/* What this means */}
                      <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>What this means</p>
                        <p style={{ fontSize: 12, color: GRAY, lineHeight: 1.55 }}>{copy.whatThisMeans}</p>
                      </div>

                      {/* Why it matters */}
                      <div style={{ background: isGood ? '#ECFDF5' : W, border: `1px solid ${isGood ? '#A7F3D0' : BORDER}`, borderRadius: 8, padding: '8px 10px', marginBottom: copy.whatToDo ? 0 : 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: isGood ? GREEN : NAVY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Why it matters</p>
                        <p style={{ fontSize: 12, color: isGood ? GREEN : GRAY, lineHeight: 1.5 }}>{copy.whyItMatters}</p>
                      </div>

                      {/* What to do — quick action for gaps, maintenance tip for passing */}
                      {copy.whatToDo && (
                        <div style={{ background: isGood ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${isGood ? '#A7F3D0' : '#FDE68A'}`, borderRadius: 8, padding: '8px 10px', marginTop: isGood ? 8 : 0, marginBottom: 10 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: isGood ? GREEN : AMBER, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{isGood ? 'Keep it up' : 'Quick action'}</p>
                          <p style={{ fontSize: 12, color: isGood ? GREEN : NAVY, lineHeight: 1.55 }}>{copy.whatToDo}</p>
                        </div>
                      )}

                      {/* How to fix — expandable step-by-step */}
                      {!isGood && sig.status !== 'not_checked' && (
                        <HowToFix
                          name={sig.name}
                          expanded={expandedFix === fixKey}
                          onToggle={() => toggleFix(fixKey)}
                          status={sig.status}
                          signals={allSignals}
                        />
                      )}

                      {/* Fix link */}
                      {sig.fixAvailable && (
                        <Link
                          href={`/dashboard/fix?signal=${encodeURIComponent(sig.name)}&country=${encodeURIComponent(country)}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: BLUE, textDecoration: 'none', background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 7, padding: '6px 12px', marginTop: 10 }}
                        >
                          Get generated fix code <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

    </div>
  );
}

