import { describe, it, expect } from 'vitest';
import { detectBusinessMention } from '../analyser-ml';

describe('detectBusinessMention — entity suffix matching', () => {
  it('"Power Rogers Chicago" matches response containing "Power Rogers & Smith"', () => {
    const response = 'Power Rogers & Smith is a leading personal injury firm in Chicago known for their trial expertise.';
    const result = detectBusinessMention(response, 'Power Rogers Chicago', 'Chicago');
    expect(result).toBe(true);
  });

  it('"Power Rogers Chicago" matches response containing "Power Rogers, LLP"', () => {
    const response = 'You should consider Power Rogers, LLP for personal injury cases in Chicago.';
    const result = detectBusinessMention(response, 'Power Rogers Chicago', 'Chicago');
    expect(result).toBe(true);
  });

  it('"Power Rogers Chicago" does NOT match "Rogers Park Dental"', () => {
    const response = 'Rogers Park Dental is a great dentist in Chicago.';
    const result = detectBusinessMention(response, 'Power Rogers Chicago', 'Chicago');
    expect(result).toBe(false);
  });

  it('"Power Rogers Chicago" matches without city param via fuzzy path', () => {
    const response = 'Power Rogers & Smith is a leading personal injury firm in Chicago.';
    const result = detectBusinessMention(response, 'Power Rogers Chicago');
    expect(result).toBe(true);
  });
});
