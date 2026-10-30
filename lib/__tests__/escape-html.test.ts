import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeHtml } from '../escapeHtml';

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml(`O'Brien & Sons`)).toBe('O&#39;Brien &amp; Sons');
    expect(escapeHtml('`tpl`')).toBe('&#96;tpl&#96;');
    expect(escapeHtml(`" onerror="alert(1)`)).toBe('&quot; onerror=&quot;alert(1)');
  });
  it('handles null/undefined/numbers', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
  it('does not double-escape when applied once', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('generate-pdf hardening (source)', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');
  it('uses the shared escapeHtml and never interpolates raw clientName into HTML', () => {
    expect(route).toContain("import { escapeHtml } from '@/lib/escapeHtml'");
    expect(route).toContain('const clientHtml = esc(clientName)');
    expect(route).not.toMatch(/cityLine = city \? `\$\{clientName\}/);
    expect(route).not.toContain("assess ${clientName}'s");
  });
  it('agency_user_id is only honoured for the caller or their agency', () => {
    expect(route).toContain('effectiveAgencyId = user.id');
    expect(route).toContain(".eq('client_user_id', user.id)");
  });
  it('ownerless scans require ownership/admin (canAccessScan)', () => {
    expect(route).toContain('canAccessScan({ user_id: ownerId }');
    expect(route).not.toContain('if (ownerId && ownerId !== user.id)');
  });
  it('white-label has no Rankall purple fallback and print CSS removes browser margins', () => {
    expect(route).toContain("NEUTRAL_ACCENT = '#334155'");
    expect(route).toContain("whiteLabel ? '#F8FAFC' : '#F5F3FF'");
    expect(route).toContain('@page { size: A4; margin: 0; }');
    expect(route).toContain('revenueGapForScan');
    expect(route).not.toMatch(/\* 180\b/);
  });
});
