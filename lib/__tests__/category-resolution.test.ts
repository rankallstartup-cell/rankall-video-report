import { describe, it, expect } from 'vitest';
import { resolveCategory, matchCategoryGlobal, findCategoryByQueryTerm, CATEGORIES } from '../categories';

describe('resolveCategory cross-sector rescue', () => {
  it('resolves gutter cleaning from general_contractor + website signal', () => {
    const result = resolveCategory(
      ['general_contractor'],
      'Family Window Washing & Gutter Cleaning provides professional window washing gutter cleaning services',
      'US',
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('website_signal_cross_sector');
  });

  it('specific Places type wins over weak in-sector website signal', () => {
    const result = resolveCategory(
      ['dentist'],
      'We are a dental office providing periodontist services for our patients',
      'US',
    );
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('dentist');
    expect(result!.confidence).toBe('places_narrowed');
  });

  it('strong website signal (3+ mentions) overrides specific Places type', () => {
    const result = resolveCategory(
      ['dentist'],
      'Leading periodontist in the area. Our periodontist team specializes in gum disease. As a periodontist office we serve patients.',
      'US',
    );
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('periodontist');
    expect(result!.confidence).toBe('website_signal');
  });

  it('same-category website match returns website_signal confidence', () => {
    const result = resolveCategory(
      ['dentist'],
      'We offer general dentistry, periodontal treatment, and cosmetic services',
      'US',
    );
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('dentist');
    expect(result!.confidence).toBe('website_signal');
  });

  it('generic Places type defers to website signal', () => {
    const result = resolveCategory(
      ['cleaning_service'],
      'We provide commercial cleaning and janitorial services for offices',
      'US',
    );
    expect(result).not.toBeNull();
    expect(result!.entry.queryTerm.toLowerCase()).toContain('commercial cleaning');
    expect(result!.confidence).toBe('website_signal');
  });
});

describe('matchCategoryGlobal', () => {
  it('finds a cleaning category across all sectors', () => {
    const match = matchCategoryGlobal('window washing and gutter cleaning services', 'US');
    expect(match).not.toBeNull();
  });
});

describe('findCategoryByQueryTerm', () => {
  it('finds exact queryTerm match globally', () => {
    const result = findCategoryByQueryTerm('window cleaning', 'US');
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('window-cleaning');
    expect(result!.confidence).toBe('haiku_global');
  });

  it('returns null for non-existent category', () => {
    const result = findCategoryByQueryTerm('underwater basket weaving', 'US');
    expect(result).toBeNull();
  });
});
