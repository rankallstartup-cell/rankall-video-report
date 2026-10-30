import type { MetadataRoute } from 'next';

// GEO strategy: allow every search + AI crawler explicitly.
// Bots with their own named group ignore `User-agent: *` entirely,
// so the private-path disallows must be repeated per group.
// Private paths: /api/ (server endpoints), /dashboard/, /auth/.
// NOT /r/: shared report pages are kept out of the index with a robots
// noindex meta tag, and a robots.txt Disallow would stop crawlers from
// fetching the page — so they would never SEE the noindex and could still
// index the bare URL from external links. Same for /report (noindex via
// metadata, not disallowed).
// EXCEPTION: /api/og/ serves the PUBLIC OG share-card images (homepage,
// pricing, blog, report cards). Social scrapers (Twitterbot,
// facebookexternalhit, LinkedInBot, …) fall under `User-agent: *` and
// respect robots.txt — if /api/og/ were disallowed they could not fetch
// the share-card images and every share would render without an image.
// `/api/og/` is more specific than `/api/`, so it wins for those paths
// while the rest of /api/ stays blocked.
const AI_CRAWLERS = [
  'GPTBot',           // OpenAI — ChatGPT answers + training
  'OAI-SearchBot',    // OpenAI Search
  'ChatGPT-User',     // ChatGPT user browsing
  'ClaudeBot',        // Anthropic
  'anthropic-ai',     // Anthropic training
  'PerplexityBot',    // Perplexity answers
  'Perplexity-User',  // Perplexity user browsing
  'Google-Extended',  // Google AI (Gemini / AI Overviews)
  'Applebot-Extended',// Apple Intelligence
  'Applebot',         // Apple Search
  'cohere-ai',        // Cohere
  'CCBot',            // Common Crawl (feeds many LLMs)
  'Bytespider',       // ByteDance
  'Amazonbot',        // Amazon (Rufus / Alexa)
  'Meta-ExternalAgent', // Meta AI
  'FacebookBot',      // Meta
  'DuckAssistBot',    // DuckDuckGo AI
  'YouBot',           // You.com
];

// /r/ is NOT disallowed: those share pages carry noindex (app/r/[id]/layout.tsx),
// and a Disallow would stop crawlers from ever reading that noindex.
// /admin/ (round 2): internal tools — also noindex via app/admin/layout.tsx.
const PRIVATE = ['/api/', '/dashboard/', '/auth/', '/admin/'];
const PUBLIC_OG = '/api/og/';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: 'Googlebot', allow: ['/', PUBLIC_OG], disallow: PRIVATE },
      { userAgent: 'Bingbot', allow: ['/', PUBLIC_OG], disallow: PRIVATE },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ['/', PUBLIC_OG],
        disallow: PRIVATE,
      })),
      { userAgent: '*', allow: ['/', PUBLIC_OG], disallow: PRIVATE },
    ],
    sitemap: 'https://rankall.io/sitemap.xml',
  };
}
