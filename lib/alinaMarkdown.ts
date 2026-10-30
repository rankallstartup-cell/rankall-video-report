// A9: minimal markdown for Alina replies. PURE tokenizer — no HTML is
// ever built from the model text. The renderer (AlinaMessage.tsx) turns
// these tokens into React elements, so raw HTML in a reply stays literal
// text (React escapes it), never parsed markup.
//
// Links: ONLY relative rankall.io paths are linkified (/report/<id>,
// /signup?plan=agency, /pricing, /contact). Absolute URLs, protocol-
// relative URLs, and javascript:/data:/mailto: hrefs render as literal
// text — the model can never turn a reply into an off-site link.

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type MarkdownBlock =
  | { type: 'paragraph'; children: InlineToken[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: InlineToken[] }
  | { type: 'list'; ordered: boolean; items: InlineToken[][] }
  | { type: 'code'; text: string };

/** A link href is allowed only when it is a same-site relative path. */
export function isAllowedLinkHref(href: string): boolean {
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//')) return false;
  if (/[\s<>\\]/.test(href)) return false;
  return true;
}

function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let rest = text;
  while (rest.length) {
    // Find the earliest opener among bold, italic, code, link.
    const boldIdx = rest.indexOf('**');
    const codeIdx = rest.indexOf('`');
    const linkIdx = rest.indexOf('[');
    let italicIdx = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '*' && rest[i + 1] !== '*' && rest[i - 1] !== '*') {
        // Single * not adjacent to ** — treat as italic opener only when
        // it is not glued between alphanumerics (3*4 is not emphasis).
        const before = rest[i - 1] ?? ' ';
        const after = rest[i + 1] ?? ' ';
        if (!/[A-Za-z0-9]/.test(before) && after !== ' ') { italicIdx = i; break; }
      }
    }
    const candidates = [
      { idx: boldIdx, kind: 'bold' as const },
      { idx: codeIdx, kind: 'code' as const },
      { idx: linkIdx, kind: 'link' as const },
      { idx: italicIdx, kind: 'italic' as const },
    ].filter((c) => c.idx >= 0).sort((a, b) => a.idx - b.idx);
    if (!candidates.length) {
      out.push({ type: 'text', text: rest });
      break;
    }
    const first = candidates[0];
    if (first.idx > 0) out.push({ type: 'text', text: rest.slice(0, first.idx) });
    rest = rest.slice(first.idx);
    if (first.kind === 'bold') {
      const end = rest.indexOf('**', 2);
      if (end < 0) { out.push({ type: 'text', text: rest }); break; }
      out.push({ type: 'bold', children: parseInline(rest.slice(2, end)) });
      rest = rest.slice(end + 2);
    } else if (first.kind === 'italic') {
      const end = rest.indexOf('*', 1);
      if (end < 0) { out.push({ type: 'text', text: rest }); break; }
      out.push({ type: 'italic', children: parseInline(rest.slice(1, end)) });
      rest = rest.slice(end + 1);
    } else if (first.kind === 'code') {
      const end = rest.indexOf('`', 1);
      if (end < 0) { out.push({ type: 'text', text: rest }); break; }
      out.push({ type: 'code', text: rest.slice(1, end) });
      rest = rest.slice(end + 1);
    } else {
      const closeText = rest.indexOf(']');
      const openParen = closeText >= 0 ? rest.indexOf('(', closeText) : -1;
      const closeParen = openParen >= 0 ? rest.indexOf(')', openParen) : -1;
      if (closeText < 0 || openParen !== closeText + 1 || closeParen < 0) {
        out.push({ type: 'text', text: '[' });
        rest = rest.slice(1);
        continue;
      }
      const label = rest.slice(1, closeText);
      const href = rest.slice(openParen + 1, closeParen);
      if (isAllowedLinkHref(href)) {
        out.push({ type: 'link', text: label, href });
      } else {
        // Disallowed href — render the whole markdown as literal text.
        out.push({ type: 'text', text: rest.slice(0, closeParen + 1) });
      }
      rest = rest.slice(closeParen + 1);
    }
  }
  return out;
}

export function parseMarkdown(input: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = input.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    // Fenced code block.
    if (trimmed.startsWith('```')) {
      const fenceLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        fenceLines.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      blocks.push({ type: 'code', text: fenceLines.join('\n') });
      continue;
    }
    // Heading.
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        children: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }
    // List (consecutive items).
    const listMatch = trimmed.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*]|\d+[.)])\s+(.+)$/);
        if (!m || /^\d/.test(m[1]) !== ordered) break;
        items.push(parseInline(m[2]));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    // Paragraph: consecutive non-blank, non-special lines.
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      const t = next.trim();
      if (!t) break;
      if (t.startsWith('```') || /^#{1,3}\s/.test(t) || /^([-*]|\d+[.)])\s/.test(t)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paraLines.join('\n')) });
  }
  return blocks;
}
