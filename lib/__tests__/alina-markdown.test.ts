// A9 — sanitised markdown: bold/italic/code/lists/headings render;
// raw HTML stays literal text; links only for same-site relative paths.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkdown, isAllowedLinkHref } from '@/lib/alinaMarkdown';
import AlinaMessage from '@/components/AlinaMessage';

describe('isAllowedLinkHref', () => {
  it('allows same-site relative paths only', () => {
    expect(isAllowedLinkHref('/report/abc-123')).toBe(true);
    expect(isAllowedLinkHref('/signup?plan=agency')).toBe(true);
    expect(isAllowedLinkHref('/pricing#plans')).toBe(true);
    expect(isAllowedLinkHref('https://rankall.io/pricing')).toBe(false);
    expect(isAllowedLinkHref('https://evil.example/x')).toBe(false);
    expect(isAllowedLinkHref('//evil.example/x')).toBe(false);
    expect(isAllowedLinkHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedLinkHref('data:text/html,<script>')).toBe(false);
    expect(isAllowedLinkHref('mailto:hello@rankall.io')).toBe(false);
    expect(isAllowedLinkHref('/path with space')).toBe(false);
  });
});

describe('parseMarkdown', () => {
  it('parses bold, italic, code, headings, lists', () => {
    const blocks = parseMarkdown('## Your plan\n\n- **Fix one** now\n- See `schema` docs\n\n*Italic* text');
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 });
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false });
    const firstItem = (blocks[1] as { items: unknown[][] }).items[0];
    expect(firstItem[0]).toMatchObject({ type: 'bold' });
    expect(blocks[2]).toMatchObject({ type: 'paragraph' });
  });

  it('keeps raw HTML as text tokens, never as markup', () => {
    const blocks = parseMarkdown('Hello <script>alert(1)</script> world');
    expect(JSON.stringify(blocks)).toContain('<script>');
    expect(blocks[0].type).toBe('paragraph');
  });

  it('renders disallowed links as literal text', () => {
    const blocks = parseMarkdown('Click [here](https://evil.example/x) now');
    const html = renderToStaticMarkup(React.createElement(AlinaMessage, { text: 'Click [here](https://evil.example/x) now' }));
    expect(html).not.toContain('href=');
    expect(html).toContain('[here](https://evil.example/x)');
    expect(blocks[0].type).toBe('paragraph');
  });
});

describe('AlinaMessage rendering', () => {
  it('escapes HTML and linkifies only same-site paths', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlinaMessage, { text: 'See [your report](/report/abc-123) and <img src=x onerror=alert(1)>\n\n- **Bold** item' }),
    );
    expect(html).toContain('href="/report/abc-123"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<li');
  });

  it('renders fenced code blocks as text', () => {
    const html = renderToStaticMarkup(React.createElement(AlinaMessage, { text: '```\n<script>evil()</script>\n```' }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
