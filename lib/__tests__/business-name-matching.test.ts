import { describe, it, expect } from 'vitest';
import { normalizeBusinessName, businessNamesMatch } from '../dataQuality';

describe('normalizeBusinessName', () => {
  it('strips LLP suffix', () => {
    expect(normalizeBusinessName('Power Rogers, LLP')).toBe('power rogers');
  });
  it('strips LLC suffix', () => {
    expect(normalizeBusinessName('Acme Services LLC')).toBe('acme services');
  });
  it('strips PC suffix', () => {
    expect(normalizeBusinessName('Clifford Law Offices PC')).toBe('clifford law offices');
  });
  it('strips & Associates', () => {
    expect(normalizeBusinessName('Smith Jones & Associates')).toBe('smith jones');
  });
  it('strips trailing city when provided', () => {
    expect(normalizeBusinessName('Power Rogers Chicago', 'Chicago')).toBe('power rogers');
  });
  it('leaves name intact when no suffix or city', () => {
    expect(normalizeBusinessName('Power Rogers')).toBe('power rogers');
  });
});

describe('businessNamesMatch', () => {
  it('"Power Rogers Chicago" matches "Power Rogers, LLP"', () => {
    expect(businessNamesMatch('Power Rogers Chicago', 'Power Rogers, LLP', 'Chicago')).toBe(true);
  });

  it('"Clifford Law Offices" matches "Clifford Law Offices PC"', () => {
    expect(businessNamesMatch('Clifford Law Offices', 'Clifford Law Offices PC')).toBe(true);
  });

  it('"Malman Law Chicago" matches "Law Offices of Steven J. Malman & Associates"', () => {
    expect(businessNamesMatch('Malman Law Chicago', 'Law Offices of Steven J. Malman & Associates', 'Chicago')).toBe(true);
  });

  it('"Power Rogers Chicago" does NOT match "Rogers Park Dental"', () => {
    expect(businessNamesMatch('Power Rogers Chicago', 'Rogers Park Dental', 'Chicago')).toBe(false);
  });

  it('"Power Rogers" matches "Power Rogers, LLP" without city', () => {
    expect(businessNamesMatch('Power Rogers', 'Power Rogers, LLP')).toBe(true);
  });

  it('empty strings do not match', () => {
    expect(businessNamesMatch('', 'Power Rogers')).toBe(false);
    expect(businessNamesMatch('Power Rogers', '')).toBe(false);
  });
});
