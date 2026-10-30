import { describe, it, expect } from 'vitest';
import { detectPersonalProIntent } from '../queries';

describe('detectPersonalProIntent — firm vs person classification', () => {
  it('classifies multi-surname firm as business', () => {
    const r = detectPersonalProIntent('Salvi Schostok Pritchard Chicago');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('surname_stack');
  });

  it('classifies "Malman Law Chicago" as business (BUSINESS_INDICATORS)', () => {
    const r = detectPersonalProIntent('Malman Law Chicago');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('business_indicator');
  });

  it('classifies "Clifford Law Offices" as business (BUSINESS_INDICATORS)', () => {
    const r = detectPersonalProIntent('Clifford Law Offices');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('business_indicator');
  });

  it('classifies "John Smith Chicago" as person via two_caps (needs Places tiebreaker)', () => {
    const r = detectPersonalProIntent('John Smith Chicago');
    expect(r.isPersonal).toBe(true);
    expect(r.rule).toBe('two_caps');
    expect(r.name).toBe('John Smith');
    expect(r.location).toBe('Chicago');
  });

  // Ticket 7: Power Rogers is a Chicago law FIRM (Power Rogers LLP), not a
  // person. The old expectation asserted the bug (person via two_caps and a
  // Places lookup that, when Places is down, fell through to a person scan).
  it('classifies "Power Rogers Chicago" as a firm (surname_pair), not a person', () => {
    const r = detectPersonalProIntent('Power Rogers Chicago');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('surname_pair');
  });

  it.each([
    ['Power Rogers', 'surname_pair'],
    ['Kirkland Ellis Chicago', 'surname_pair'],
    ['Power Rogers LLP', 'business_indicator'],
    ['Power Rogers & Smith', 'business_indicator'],
    ['Rogers Law Group Chicago', 'business_indicator'],
    ['Smith & Associates', 'business_indicator'],
  ])('firm-like "%s" is never a person (%s)', (input, rule) => {
    const r = detectPersonalProIntent(input);
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe(rule);
  });

  it.each(['Taylor Swift', 'Morgan Freeman Memphis', 'Sarah Rogers Austin'])('real person "%s" still reads as a person', (input) => {
    expect(detectPersonalProIntent(input).isPersonal).toBe(true);
  });

  it('classifies "Dr Sarah Chen Austin" as person via title_prefix', () => {
    const r = detectPersonalProIntent('Dr Sarah Chen Austin');
    expect(r.isPersonal).toBe(true);
    expect(r.rule).toBe('title_prefix');
  });

  it('classifies "Smith Jones & Associates" as business', () => {
    const r = detectPersonalProIntent('Smith Jones & Associates');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('business_indicator');
  });

  it('classifies "Salvi Schostok Pritchard" (no city) as business', () => {
    const r = detectPersonalProIntent('Salvi Schostok Pritchard');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('surname_stack');
  });

  it('classifies "Skadden Arps Slate" as business', () => {
    const r = detectPersonalProIntent('Skadden Arps Slate');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('surname_stack');
  });

  it('classifies "John Smith" (no city) as person', () => {
    const r = detectPersonalProIntent('John Smith');
    expect(r.isPersonal).toBe(true);
    expect(r.rule).toBe('two_caps');
    expect(r.name).toBe('John Smith');
  });
});
