import { describe, it, expect } from 'vitest';
import { detectBusinessMention } from '../analyser-ml';
import { calculateOverallScore } from '../scoring';

describe('detectBusinessMention — negation handling', () => {
  const BIZ = 'Zorbex Dental Loop';

  it('rejects "I don\'t have information about {name}"', () => {
    const response = `I don't have specific information about Zorbex Dental Loop. However, here are some highly-rated dentists in Chicago...`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "I couldn\'t find {name}"', () => {
    const response = `I couldn't find any business called Zorbex Dental Loop. You might want to search on Google Maps.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "no information about {name}"', () => {
    const response = `I have no information about Zorbex Dental Loop in my training data.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "I\'m not familiar with {name}"', () => {
    const response = `I'm not familiar with Zorbex Dental Loop. Here are some alternatives in Chicago.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "I cannot verify {name}"', () => {
    const response = `I cannot verify whether Zorbex Dental Loop exists or is currently operating.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  // P0d: hedged non-answers that used to grade as ✅ Recommended.
  it('rejects "I don\'t have access to reviews for {name}"', () => {
    const response = `I don't have access to reviews for Zorbex Dental Loop, so I can't speak to their quality.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "I can\'t provide a recommendation for {name}"', () => {
    const response = `I can't provide a recommendation for Zorbex Dental Loop as I don't have current data.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "I don\'t know much about {name} specifically"', () => {
    const response = `I don't know much about Zorbex Dental Loop specifically.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  // P0d FIXED: detectBusinessMention now rejects neutral echoes — a name
  // restated only as a topic marker ("Regarding X, here are some dentists")
  // is not a recommendation. See isEchoContext in analyser-ml.ts.
  it('rejects neutral echo where name is restated but not recommended', () => {
    const response = `Regarding Zorbex Dental Loop, here are some well-reviewed dentists in the Loop area: Bright Smile Dental, Lakefront Dentistry, Chicago Family Dental.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('rejects "here is what I found about {name}" followed by generic list', () => {
    const response = `Here is what I found about Zorbex Dental Loop. Top dentists in Chicago include: A Dental, B Dental, C Dental.`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('accepts genuine recommendation listing the business', () => {
    const response = `Top dentists in Chicago:\n1. Bright Smile Dental\n2. Zorbex Dental Loop\n3. Lakefront Dentistry`;
    expect(detectBusinessMention(response, BIZ)).toBe(true);
  });

  it('accepts positive review mentioning the business', () => {
    const response = `Zorbex Dental Loop is a highly rated dental practice in Chicago known for excellent patient care.`;
    expect(detectBusinessMention(response, BIZ)).toBe(true);
  });
});

describe('category-query scoring: nonexistent business not mentioned', () => {
  const BIZ = 'Zorbex Dental Loop';

  it('category response listing other businesses → mentioned false', () => {
    const response = `Here are some well-reviewed dentists in Chicago's Loop area:\n1. Bright Smile Dental\n2. Lakefront Dentistry\n3. Chicago Family Dental`;
    expect(detectBusinessMention(response, BIZ)).toBe(false);
  });

  it('category response mentioning the business → mentioned true', () => {
    const response = `Top dentists in Chicago:\n1. Bright Smile Dental\n2. Zorbex Dental Loop\n3. Lakefront Dentistry`;
    expect(detectBusinessMention(response, BIZ)).toBe(true);
  });
});

describe('nonexistent business scores zero', () => {
  it('score === 0 when all platforms say "I don\'t know"', () => {
    const platforms = [
      { weight: 0.25, mentionRate: 0, status: 'success' as const },
      { weight: 0.18, mentionRate: 0, status: 'success' as const },
      { weight: 0.15, mentionRate: 0, status: 'success' as const },
      { weight: 0.10, mentionRate: 0, status: 'success' as const },
      { weight: 0.09, mentionRate: 0, status: 'success' as const },
      { weight: 0.07, mentionRate: 0, status: 'success' as const },
      { weight: 0.06, mentionRate: 0, status: 'success' as const },
      { weight: 0.04, mentionRate: 0, status: 'success' as const },
      { weight: 0.03, mentionRate: 0, status: 'success' as const },
      { weight: 0.02, mentionRate: 0, status: 'success' as const },
      { weight: 0.01, mentionRate: 0, status: 'success' as const },
    ];
    const result = calculateOverallScore(platforms, 5);
    expect(result.score).toBe(0);
    expect(result.mentionedCount).toBe(0);
  });
});

describe('category query must not contain business name', () => {
  it('query for "Malman Law Chicago" must not contain "Malman"', () => {
    const businessName = 'Malman Law Chicago';
    const industry = 'lawyer';
    const city = 'Chicago';
    const query = `best ${industry} in ${city}`;
    expect(query.toLowerCase()).not.toContain('malman');
    expect(query).toBe('best lawyer in Chicago');
  });

  it('query for "Zorbex Dental Loop Chicago" must not contain "Zorbex"', () => {
    const businessName = 'Zorbex Dental Loop Chicago';
    const industry = 'dentist';
    const city = 'Chicago';
    const query = `best ${industry} in ${city}`;
    expect(query.toLowerCase()).not.toContain('zorbex');
    expect(query).toBe('best dentist in Chicago');
  });

  it('industry nouns produce natural queries', () => {
    const INDUSTRY_QUERY_NOUNS: Record<string, string> = {
      landscaping: 'landscaper',
      cleaning: 'cleaning service',
      roofing: 'roofer',
      realestate: 'real estate agent',
      hairsalon: 'hair salon',
      autorepair: 'auto repair shop',
    };
    const cases = [
      { industry: 'landscaping', expected: 'best landscaper in Chicago' },
      { industry: 'dentist', expected: 'best dentist in Chicago' },
      { industry: 'lawyer', expected: 'best lawyer in Chicago' },
      { industry: 'realestate', expected: 'best real estate agent in Chicago' },
    ];
    for (const { industry, expected } of cases) {
      const noun = INDUSTRY_QUERY_NOUNS[industry] || industry;
      const query = `best ${noun} in Chicago`;
      expect(query).toBe(expected);
    }
  });
});

describe('d42e — markdown-linked names are detected, not glued to URLs', () => {
  const BIZ = 'ATX Family Dental';

  it('detects a name inside a markdown link', () => {
    const response = `Top South Austin Pick: [ATX Family Dental](https://www.atxfamilydental.com/) — great reviews, family-friendly.`;
    expect(detectBusinessMention(response, BIZ)).toBe(true);
  });

  it('detects a name when the link URL contains name-like text', () => {
    const response = `Try [ATX Family Dental](https://www.atxfamilydental.com/locations/south-austin) for your checkup.`;
    expect(detectBusinessMention(response, BIZ)).toBe(true);
  });

  it('still rejects substring matches ("ace" inside "grace")', () => {
    const response = `We recommend Grace Dental for your cleaning.`;
    expect(detectBusinessMention(response, 'Ace Dental')).toBe(false);
  });
});
