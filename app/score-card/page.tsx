import Link from 'next/link';
import ScoreCardView from '@/components/ScoreCardView';
import { loadShareableScanRow } from '@/lib/publicShare';
import { getTrustedDisplayName } from '@/lib/enrichment';

// b8b7 — server component. The old page was a client template that
// read score/business/industry/city/competitor straight from URL
// params and IGNORED scan_id: it showed 0 for a real 84-score scan,
// rendered the same false 0 card for a bogus id, and let anyone mint
// a "score 100" card by typing ?score=100 in the URL.
//
// Now: scan_id is required. The scan loads via loadShareableScanRow
// (service role + the /r/ share rule: ownerless scans, or owned scans
// the owner explicitly published). Bare / bogus / private ids get an
// honest state — never a card, never a 0 presented as measured.

export const dynamic = 'force-dynamic';

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", background: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 12px' }}>{title}</h1>
        <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.6, margin: '0 0 28px' }}>{body}</p>
        <Link href="/" style={{ display: 'inline-block', background: '#1B17FF', color: '#fff', borderRadius: 8, padding: '12px 28px', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
          Scan your business free
        </Link>
      </div>
    </div>
  );
}

export default async function ScoreCardPage({
  searchParams,
}: {
  searchParams: Promise<{ scan_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.scan_id) ? params.scan_id[0] : params.scan_id;
  const scanId = (raw ?? '').trim();

  if (!scanId) {
    return <EmptyState title="No scan selected" body="A score card needs a scan. Run a free scan to get your score card." />;
  }

  const row = await loadShareableScanRow(scanId);
  if (!row) {
    return <EmptyState title="Scan not found" body="This scan does not exist or is not shared publicly. Run a free scan to get your score card." />;
  }

  const enrichment = (row.enrichment ?? null) as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null;
  const business = getTrustedDisplayName(
    typeof row.input === 'string' ? row.input : null,
    typeof row.location === 'string' ? row.location : null,
    typeof row.user_business_name === 'string' ? row.user_business_name : null,
    enrichment?.google,
  );
  const score = typeof row.overall_score === 'number' && Number.isFinite(row.overall_score) ? Math.round(row.overall_score) : 0;
  const competitor = typeof row.competitor_name === 'string' && row.competitor_name.trim() ? row.competitor_name.trim() : null;
  const competitorScore = competitor && typeof row.competitor_score === 'number' && Number.isFinite(row.competitor_score)
    ? Math.round(row.competitor_score) : null;
  const scanDate = row.created_at
    ? new Date(String(row.created_at)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <ScoreCardView
      score={score}
      business={business}
      industry={typeof row.industry === 'string' ? row.industry : ''}
      city={typeof row.location === 'string' ? row.location : ''}
      competitor={competitor}
      competitorScore={competitorScore}
      scanDate={scanDate}
    />
  );
}
