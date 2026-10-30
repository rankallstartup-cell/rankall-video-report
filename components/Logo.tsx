// The RankAll logo (mark + wordmark). Use this everywhere a logo is shown,
// never a hand-built "R" badge or a plain "rankall.io" text logo.
//   variant: 'dark' on light backgrounds, 'white' on dark backgrounds.
export default function Logo({ variant = 'dark', height = 28 }: { variant?: 'dark' | 'white'; height?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={variant === 'white' ? '/rankall-logo-white.png' : '/rankall-logo-dark.png'}
      alt="RankAll"
      width={height * 5}
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}
