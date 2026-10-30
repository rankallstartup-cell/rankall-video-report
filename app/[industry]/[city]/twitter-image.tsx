// Round 2: twitter:image used to point at /api/og/report while the
// sibling opengraph-image.tsx overrode og:image — the two cards differed.
// The Twitter card now renders the SAME generated image (file convention;
// file-based metadata takes precedence over the metadata object).
// `runtime` is segment config and must be a literal in this file.
export const runtime = 'edge';
export { default, size, contentType } from './opengraph-image';
