import { describe, it, expect } from 'vitest';
import { extractAllCompetitorsSync, nameSimilarity, isCrossIndustry } from '../analyser-ml';
import { scoreCompetitor } from '../extractCompetitors';

describe('extractAllCompetitors', () => {
  it('aggregates name variants into one competitor', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Anderson Window & Gutter Cleaning** is highly rated' },
      { platform: 'Gemini', response: '1. **Anderson Window Cleaning** is a top choice' },
      { platform: 'Perplexity', response: '1. **Anderson Window Cleaning Services LLC** for the best results' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing');
    const anderson = result.find(c => c.name.toLowerCase().includes('anderson'));
    expect(anderson).toBeDefined();
    expect(anderson!.platforms.length).toBe(3);
    expect(anderson!.mentions).toBeGreaterThanOrEqual(3);
  });

  it('keeps distinct competitors separate', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Anderson Window Cleaning** is great\n2. **Sparkle Glass Services** too' },
      { platform: 'Gemini', response: '1. **Sparkle Glass Services** is top rated' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const anderson = result.find(c => c.name.toLowerCase().includes('anderson'));
    const sparkle = result.find(c => c.name.toLowerCase().includes('sparkle'));
    expect(anderson).toBeDefined();
    expect(sparkle).toBeDefined();
  });

  it('extracts from numbered lists without bold', () => {
    const responses = [
      { platform: 'Claude', response: '1. Anderson Window Cleaning is recommended\n2. Sparkle Glass Services is also great' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles');
    const anderson = result.find(c => c.name.toLowerCase().includes('anderson'));
    expect(anderson).toBeDefined();
  });

  it('excludes the target business', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Bubbles Window Washing** is the best\n2. **Anderson Window Cleaning** is also good' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing');
    const bubbles = result.find(c => c.name.toLowerCase().includes('bubbles'));
    expect(bubbles).toBeUndefined();
  });

  it('rejects direct query-echo candidates and tags generic ones', () => {
    const queries = [
      'best window cleaning in Naperville',
      'top rated window cleaning Naperville',
      'best window cleaning Naperville near me',
      'window cleaning Naperville reviews',
      'highest rated window cleaning Naperville',
    ];
    const responses = [
      { platform: 'ChatGPT', response: '1. **Naperville Window Cleaning Reviews** is a great resource' },
      { platform: 'Gemini', response: '1. **Best Window Cleaning Naperville** services include...' },
      { platform: 'Claude', response: '1. **Anderson Window Cleaning** is highly rated' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing', undefined, {
      queries,
      city: 'Naperville',
      category: 'window cleaning',
    });
    // "Best Window Cleaning Naperville" is contained in query "best window cleaning Naperville near me" → hard-rejected
    const echo2 = result.find(c => c.name.toLowerCase().includes('best window cleaning naperville'));
    expect(echo2).toBeUndefined();
    // "Naperville Window Cleaning Reviews" — all tokens are generic → tagged, not rejected
    const echo1 = result.find(c => c.name.toLowerCase().includes('naperville window cleaning'));
    expect(echo1).toBeDefined();
    expect(echo1!.isGeneric).toBe(true);
    const anderson = result.find(c => c.name.toLowerCase().includes('anderson'));
    expect(anderson).toBeDefined();
    expect(anderson!.isGeneric).toBe(false);
  });

  it('tags generic candidates (city+category) instead of rejecting', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Naperville Window Cleaning Inc** is highly rated' },
      { platform: 'Gemini', response: '1. **Naperville Window Cleaning LLC** is a top choice' },
      { platform: 'Claude', response: '1. **Anderson Window Cleaning** is great' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing', undefined, {
      queries: ['best window cleaning in Naperville'],
      city: 'Naperville',
      category: 'window cleaning',
    });
    // Generic candidates are tagged, not rejected — Places decides at ≥ 0.9
    const naperville = result.find(c => c.name.toLowerCase().includes('naperville window'));
    expect(naperville).toBeDefined();
    expect(naperville!.isGeneric).toBe(true);
    const anderson = result.find(c => c.name.toLowerCase().includes('anderson'));
    expect(anderson).toBeDefined();
    expect(anderson!.isGeneric).toBe(false);
  });

  it('bare city+category without suffix is also tagged generic', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Naperville Window Cleaning** is top rated' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles', undefined, {
      queries: ['best window cleaning in Naperville'],
      city: 'Naperville',
      category: 'window cleaning',
    });
    const naperville = result.find(c => c.name.toLowerCase().includes('naperville window'));
    expect(naperville).toBeDefined();
    expect(naperville!.isGeneric).toBe(true);
  });
});

describe('nameSimilarity (containment-based)', () => {
  it('scores 1.0 when candidate tokens are a subset of Places name', () => {
    expect(nameSimilarity('Window Genie', 'Window Genie of Naperville and East Aurora')).toBe(1);
  });

  it('scores < 1 when candidate has tokens not in Places name', () => {
    expect(nameSimilarity('Window Genie Express', 'Window Genie of Naperville')).toBeLessThan(1);
  });

  it('ignores entity suffixes and stopwords', () => {
    expect(nameSimilarity('Anderson Window Cleaning LLC', 'Anderson Window Cleaning')).toBe(1);
  });

  it('strips city tokens from candidate before computing containment', () => {
    expect(nameSimilarity('Fish Window Cleaning of Naperville', 'Fish Window Cleaning', 'Naperville')).toBe(1);
  });

  it('does NOT strip city tokens when city is omitted (generic candidates)', () => {
    const sim = nameSimilarity('Naperville Window Cleaning', 'Powerhouse Window Cleaning & Power Washing');
    expect(sim).toBeLessThan(0.9);
  });
});

describe('query-echo competitors never survive extraction', () => {
  it('hard-rejects a candidate contained in a scan query', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Top Window Cleaning Naperville** is a great resource\n2. **Anderson Window Cleaning** is highly rated' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing', undefined, {
      queries: ['top window cleaning naperville near me'],
      city: 'Naperville',
      category: 'window cleaning',
    });
    const echo = result.find(c => c.name.toLowerCase().includes('top window cleaning naperville'));
    expect(echo).toBeUndefined();
    const real = result.find(c => c.name.toLowerCase().includes('anderson'));
    expect(real).toBeDefined();
  });

  it('tags all-generic-token candidates so async layer requires Places confirmation', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Best Window Cleaning Naperville** is recommended\n2. **Anderson Window Cleaning** is great' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles Window Washing', undefined, {
      queries: ['best window cleaning in Naperville'],
      city: 'Naperville',
      category: 'window cleaning',
    });
    const generic = result.find(c => c.name.toLowerCase().includes('best window'));
    if (generic) expect(generic.isGeneric).toBe(true);
    const real = result.find(c => c.name.toLowerCase().includes('anderson'));
    expect(real).toBeDefined();
    expect(real!.isGeneric).toBe(false);
  });
});

describe('extractAllCompetitorsSync returns variants-ready data', () => {
  it('grouped candidates preserve the best name for variant matching', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Squeegee Squad** is great' },
      { platform: 'Gemini', response: '1. **Squeegee Squad Services** is top rated' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles');
    const sq = result.find(c => c.name.toLowerCase().includes('squeegee'));
    expect(sq).toBeDefined();
    expect(sq!.platforms.length).toBe(2);
  });
});

describe('scoreCompetitor uses detectBusinessMention across all platforms', () => {
  it('detects a competitor on 3 platforms using two name variants', () => {
    const variants = ['Anderson Window Cleaning', 'Anderson Window & Gutter Cleaning'];
    const platformResults = [
      { platform: 'ChatGPT', weight: 0.25, response: 'I recommend Anderson Window Cleaning for great service.' },
      { platform: 'Gemini', weight: 0.18, response: 'Anderson Window & Gutter Cleaning is top rated in the area.' },
      { platform: 'Perplexity', weight: 0.09, response: 'Try Anderson Window Cleaning for professional results.' },
      { platform: 'Claude', weight: 0.06, response: 'There are many window cleaning services available.' },
      { platform: 'Grok', weight: 0.07, response: 'Window cleaning is important for home maintenance.' },
    ];
    const result = scoreCompetitor(variants, platformResults);
    expect(result.platforms).toHaveLength(3);
    expect(result.platforms).toContain('ChatGPT');
    expect(result.platforms).toContain('Gemini');
    expect(result.platforms).toContain('Perplexity');
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('cross-industry competitor rejection', () => {
  it('rejects "Smile & Shine Dental" in a window-cleaning scan via keyword', () => {
    expect(isCrossIndustry('Smile & Shine Dental Care', null, 'window-cleaning')).toBe(true);
  });

  it('rejects dental Places types in a window-cleaning scan', () => {
    expect(isCrossIndustry('Smile & Shine', ['dentist', 'health', 'point_of_interest'], 'window-cleaning')).toBe(true);
  });

  it('allows a real window cleaning competitor', () => {
    expect(isCrossIndustry('Anderson Window Cleaning', null, 'window-cleaning')).toBe(false);
  });

  it('allows a competitor with cleaning_service type in a window-cleaning scan', () => {
    expect(isCrossIndustry('ClearView Window Cleaning', ['cleaning_service', 'point_of_interest'], 'window-cleaning')).toBe(false);
  });
});

describe('name truncation', () => {
  it('truncates at trailing sentence fragment after period', () => {
    const responses = [
      { platform: 'ChatGPT', response: '1. **Fish Window Cleaning. They are known for quality**' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles');
    const fish = result.find(c => c.name.toLowerCase().includes('fish'));
    expect(fish).toBeDefined();
    expect(fish!.name).not.toMatch(/they/i);
  });

  it('truncates at connective words', () => {
    const responses = [
      { platform: 'Gemini', response: '1. **Sparkle Glass Services which offers great deals**' },
    ];
    const result = extractAllCompetitorsSync(responses, 'Bubbles');
    const sparkle = result.find(c => c.name.toLowerCase().includes('sparkle'));
    expect(sparkle).toBeDefined();
    expect(sparkle!.name).not.toMatch(/which/i);
  });
});
