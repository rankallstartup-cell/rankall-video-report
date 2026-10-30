// A9: renders an assistant reply as sanitised markdown. No
// dangerouslySetInnerHTML anywhere — tokens become React elements, so
// raw HTML in the model text is escaped, never parsed. Links render
// only for same-site relative paths (the tokenizer enforces that).
import React from 'react';
import { parseMarkdown, type InlineToken, type MarkdownBlock } from '@/lib/alinaMarkdown';

function renderInline(tokens: InlineToken[], keyPrefix: string): React.ReactNode[] {
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    if (t.type === 'text') {
      // Preserve single line breaks inside a paragraph.
      const parts = t.text.split('\n');
      return (
        <React.Fragment key={key}>
          {parts.map((part, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {part}
            </React.Fragment>
          ))}
        </React.Fragment>
      );
    }
    if (t.type === 'bold') return <strong key={key}>{renderInline(t.children, key)}</strong>;
    if (t.type === 'italic') return <em key={key}>{renderInline(t.children, key)}</em>;
    if (t.type === 'code') {
      return (
        <code key={key} style={{ background: '#E2E8F0', borderRadius: 4, padding: '1px 4px', fontSize: '0.9em' }}>
          {t.text}
        </code>
      );
    }
    return (
      <a key={key} href={t.href} style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>
        {t.text}
      </a>
    );
  });
}

function renderBlock(b: MarkdownBlock, i: number): React.ReactNode {
  if (b.type === 'heading') {
    const Tag = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5';
    return (
      <Tag key={i} style={{ margin: '6px 0 2px', fontSize: b.level === 1 ? 14 : 13, fontWeight: 800 }}>
        {renderInline(b.children, `h${i}`)}
      </Tag>
    );
  }
  if (b.type === 'code') {
    return (
      <pre key={i} style={{ background: '#0F172A', color: '#E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: '4px 0' }}>
        {b.text}
      </pre>
    );
  }
  if (b.type === 'list') {
    const Tag = b.ordered ? 'ol' : 'ul';
    return (
      <Tag key={i} style={{ margin: '4px 0', paddingLeft: 18 }}>
        {b.items.map((item, j) => (
          <li key={j} style={{ marginBottom: 2 }}>{renderInline(item, `li${i}-${j}`)}</li>
        ))}
      </Tag>
    );
  }
  return <p key={i} style={{ margin: '0 0 6px' }}>{renderInline(b.children, `p${i}`)}</p>;
}

export default function AlinaMessage({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return <>{blocks.map((b, i) => renderBlock(b, i))}</>;
}
