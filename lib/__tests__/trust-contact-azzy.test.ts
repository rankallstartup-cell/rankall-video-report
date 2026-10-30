import { describe, it, expect } from 'vitest';
import { hasPhoneNumber, hasAddress, visibleText } from '../trust';

// azzy residual: phone/address checks ran on RAW HTML (scripts, styles,
// SVG path data, attributes) and accepted hours/prices/counts as phones
// and "24 hour Drive Thru" as an address.
const page = (body: string, head = '') => `<html><head><title>X</title>${head}</head><body>${body}</body></html>`;

describe('azzy phone — must NOT match', () => {
  it.each([
    ['opening hours', '<p>Mon–Fri 0900-1700, Sat 0900-1300</p>'],
    ['hours with a third group', '<p>Hours: 0900-1700 0900-1200</p>'],
    ['IDR price', '<p>Paket mulai Rp 100.000.000</p>'],
    ['thousands', '<p>Over 1,000,000 smiles served</p>'],
    ['bare +1000000 count', '<p>+1000000 happy customers</p>'],
    ['timestamp', '<p>Posted 2026-01-15 10:30:00</p>'],
    ['svg path data', '<svg viewBox="0 0 10 10"><path d="M1000 1500 2000 0412 345 678"/></svg><p>Hello</p>'],
    ['script json', '<script>var ids = {"a":"020 7946 0958","b":"(555) 123-4567"}</script><p>Hello</p>'],
    ['style rules', '<style>.x{margin:0 1000px 2000px 0}</style><p>Hello</p>'],
    ['attribute ids', '<div data-id="555-123-4567">Hello</div>'],
  ])('%s', (_label, body) => {
    expect(hasPhoneNumber(page(body))).toBe(false);
  });
});

describe('azzy phone — SHOULD match', () => {
  it.each([
    ['Indian mobile 5+5', '<p>Call 98765 43210</p>'],
    ['Indian mobile after keyword', '<p>WhatsApp: 9876543210</p>'],
    ['Indian landline', '<p>Tel 079-2630 1234</p>'],
    ['UK intl', '<p>+44 20 7946 0958</p>'],
    ['UK local', '<p>020 7946 0958</p>'],
    ['AU local', '<p>(02) 9374 4000</p>'],
    ['US', '<p>(555) 123-4567</p>'],
    ['tel: link', '<a href="tel:+61293744000">Call us</a>'],
  ])('%s', (_label, body) => {
    expect(hasPhoneNumber(page(body))).toBe(true);
  });
});

describe('azzy address — must NOT match', () => {
  it.each([
    '<p>Our 24 hour Drive Thru is open late</p>',
    '<p>Our 24 Hour Drive Thru is open late</p>',
    '<p>Rated 5 on Google Place Reviews</p>',
    '<p>Over 300 Happy Patients Way more than before</p>',
    '<script>var a = "45 High Street, London";</script><p>Hi</p>',
  ])('%s', (body) => {
    expect(hasAddress(page(body))).toBe(false);
  });
});

describe('azzy address — SHOULD match', () => {
  it.each([
    '<p>Ahmedabad, Gujarat 380015</p>',
    '<p>Sydney NSW 2000</p>',
    '<p>London SW1A 1AA</p>',
    '<p>Dallas, TX 75201</p>',
    '<p>Toronto, ON M5V 3L9</p>',
    '<footer>Visit us at 45 High Street, London</footer>',
    '<p>123 Main Street, Dallas</p>',
    '<address>1 Infinite Loop</address>',
  ])('%s', (body) => {
    expect(hasAddress(page(body))).toBe(true);
  });
});

describe('visibleText', () => {
  it('drops script/style/svg/head and tags', () => {
    const t = visibleText(page('<script>x=1</script><style>a{}</style><svg><path d="M1 2"/></svg><p>Hi&nbsp;there</p>', '<meta name="d" content="z">'));
    expect(t.trim()).toBe('Hi there');
  });
});
