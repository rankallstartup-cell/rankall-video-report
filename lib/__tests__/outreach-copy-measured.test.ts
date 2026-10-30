import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildVideoScript,
  buildWhatsAppMessage,
  whatsappLogScore,
  parseLinkedInInput,
  buildLinkedInPrompt,
  linkedInFallbackFollowup,
} from '../outreachCopy';

// Item 4: outreach copy states only measured facts.
describe('video script', () => {
  it('never derives platform counts from the score or invents ChatGPT / "3 to 5 more"', () => {
    const s = buildVideoScript({ businessName: 'Acme Dental', score: 45, competitorName: 'Bright Smiles' });
    expect(s).not.toMatch(/out of (the )?12/);
    expect(s).not.toContain('including ChatGPT');
    expect(s).not.toContain('3 to 5');
    expect(s).not.toContain('6 weeks');
    expect(s).toContain('45 out of 100');
    expect(s).toContain('Bright Smiles');
  });
  it('uses the measured mention count when supplied', () => {
    const s = buildVideoScript({ businessName: 'Acme', mentionedCount: 3, totalPlatforms: 12 });
    expect(s).toContain('recommended on 3 out of the 12 AI platforms');
    expect(s).not.toContain('undefined');
  });
});

describe('WhatsApp message', () => {
  const base = { businessName: 'Acme', reportUrl: 'https://rankall.io/report/x' };
  it('no "outranking" claim when no competitor score was measured', () => {
    for (const cc of ['US', 'GB', 'AE', 'IN', 'PH']) {
      const m = buildWhatsAppMessage({ ...base, countryCode: cc, competitorName: 'Rival', score: 30 });
      expect(m).not.toMatch(/outranking|ahead of you|scores higher|aage hai|nangunguna/);
      expect(m).not.toContain('a competitor');
    }
  });
  it('claims a lead only when measured and higher', () => {
    expect(buildWhatsAppMessage({ ...base, competitorName: 'Rival', competitorScore: 60, score: 30 })).toContain('Rival is currently outranking you (60/100)');
    expect(buildWhatsAppMessage({ ...base, competitorName: 'Rival', competitorScore: 20, score: 30 })).not.toContain('outranking');
  });
  it('omits the score line when unmeasured (no "—/100")', () => {
    const m = buildWhatsAppMessage({ ...base });
    expect(m).not.toContain('/100');
    expect(m).not.toContain('undefined');
  });
  it('logs the measured score, never a default 0', () => {
    expect(whatsappLogScore(undefined)).toBeNull();
    expect(whatsappLogScore(42.4)).toBe(42);
    const src = readFileSync(join(process.cwd(), 'app/api/outreach/send-whatsapp/route.ts'), 'utf8');
    expect(src).not.toContain('appearedCount ?? 0');
  });
});

describe('LinkedIn message', () => {
  it('requires owner + business', () => {
    expect(parseLinkedInInput({ owner_name: 'Sam' }).ok).toBe(false);
    expect(parseLinkedInInput(null).ok).toBe(false);
  });
  it('omits missing parts instead of printing "undefined"', () => {
    const p = parseLinkedInInput({ owner_name: 'Sam', business_name: 'Acme' });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const prompt = buildLinkedInPrompt(p.facts);
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('AI Score');
    expect(prompt).not.toContain('ChatGPT recommending');
    const fb = linkedInFallbackFollowup(p.facts);
    expect(fb).not.toContain('undefined');
    expect(fb).not.toContain('ChatGPT');
  });
  it('keeps valid facts and rejects junk ones', () => {
    const p = parseLinkedInInput({ owner_name: 'Sam', business_name: 'Acme', score: '55', competitor: 'Rival', report_url: 'javascript:alert(1)', scan_id: 'abc' });
    if (!p.ok) throw new Error('expected ok');
    expect(p.facts.score).toBe(55);
    expect(p.facts.reportUrl).toBeNull();
    expect(p.facts.scanId).toBe('abc');
    expect(buildLinkedInPrompt(p.facts)).toContain('AI Score: 55/100');
    const junk = parseLinkedInInput({ owner_name: 'Sam', business_name: 'Acme', score: 'abc' });
    if (!junk.ok) throw new Error('expected ok');
    expect(junk.facts.score).toBeNull();
  });
});

describe('video page uses measured values', () => {
  const src = readFileSync(join(process.cwd(), 'app/video/[scan_id]/page.tsx'), 'utf8');
  it('no score-derived platform counts, no 0 competitor fallback', () => {
    expect(src).not.toContain('Math.round((score / 100) * 11)');
    expect(src).not.toContain('Math.round((competitorScore / 100) * 11)');
    expect(src).not.toContain('scan.competitor_score || 0');
    expect(src).not.toContain("'Top Competitor'");
    expect(src).not.toContain('In approximately 8 weeks');
    expect(src).toContain("from('rankall_platform_results')");
  });
});
