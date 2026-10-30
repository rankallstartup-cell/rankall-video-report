import { describe, it, expect } from 'vitest';
import { detectPersonalProIntent, splitSpecialtyLocation } from '../queries';

describe('trailing city/state is location, never specialty (item 18)', () => {
  it('"John Smith Chicago" → location Chicago, no specialty', () => {
    const r = detectPersonalProIntent('John Smith Chicago');
    expect(r.isPersonal).toBe(true);
    expect(r.name).toBe('John Smith');
    expect(r.location).toBe('Chicago');
    expect(r.specialty).toBe('');
  });
  it('specialty + city', () => {
    const r = detectPersonalProIntent('John Smith dentist Chicago');
    expect(r.specialty).toBe('dentist');
    expect(r.location).toBe('Chicago');
  });
  it('multi-word places and City ST pairs', () => {
    expect(splitSpecialtyLocation(['realtor', 'New', 'York'])).toEqual({ specialty: 'realtor', location: 'New York' });
    expect(splitSpecialtyLocation(['dentist', 'Chicago', 'IL'])).toEqual({ specialty: 'dentist', location: 'Chicago IL' });
    expect(splitSpecialtyLocation(['dentist', 'Chicago,', 'IL'])).toEqual({ specialty: 'dentist', location: 'Chicago IL' });
    expect(splitSpecialtyLocation(['San', 'Francisco'])).toEqual({ specialty: '', location: 'San Francisco' });
  });
  it('a lone profession is the specialty, not the location', () => {
    expect(splitSpecialtyLocation(['dentist'])).toEqual({ specialty: 'dentist', location: '' });
    expect(splitSpecialtyLocation([])).toEqual({ specialty: '', location: '' });
  });
  it('title prefix path too: "Dr. Jane Doe Austin"', () => {
    const r = detectPersonalProIntent('Dr. Jane Doe Austin');
    expect(r.location).toBe('Austin');
    expect(r.specialty).toBe('');
  });
});
