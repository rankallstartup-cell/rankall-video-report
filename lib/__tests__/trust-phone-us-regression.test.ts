import { describe, it, expect } from 'vitest';
import { hasPhoneNumber } from '../trust';

// Fix round 2: the opening-hours stripper read "555-123" / "214-555" as
// hour ranges and deleted them before the US NANP check ran, so real US
// numbers failed the contact check.
const page = (body: string) => `<html><head><title>X</title></head><body>${body}</body></html>`;

describe('US numbers survive the opening-hours stripper', () => {
  it.each([
    '555-123-4567',
    '214-555-1234',
    '(214) 555-1234',
    '212-736-5000',
    '555.123.4567',
    'Call 214 555 1234 today',
    'Open 0900-1700. Call (214) 555-1234',
    'Mon–Fri 9am-5pm · 212-736-5000',
  ])('%s', (n) => {
    expect(hasPhoneNumber(page(`<p>${n}</p>`))).toBe(true);
  });
});

describe('international numbers still match', () => {
  it.each(['+44 20 7946 0958', '+91 98765 43210', '98765 43210', '(02) 9374 4000', '0412 345 678'])('%s', (n) => {
    expect(hasPhoneNumber(page(`<p>${n}</p>`))).toBe(true);
  });
});

describe('non-phone numerics still rejected', () => {
  it.each([
    '0900-1700',
    'Mon–Fri 0900-1700, Sat 0900-1300',
    '09:00–17:30',
    '9am-5pm',
    '9:30 am to 5:30 pm',
    'Rp 100.000.000',
    '+1000000',
  ])('%s', (n) => {
    expect(hasPhoneNumber(page(`<p>${n}</p>`))).toBe(false);
  });

  it('svg path data M1000 1500 2000', () => {
    expect(hasPhoneNumber(page('<svg><path d="M1000 1500 2000"/></svg><p>Hi</p>'))).toBe(false);
    expect(hasPhoneNumber(page('<p>M1000 1500 2000</p>'))).toBe(false);
  });
});
