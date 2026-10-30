// Anonymised peer leaderboard rows (privacy: ax8m). Pure — no DB access.
// Only the viewer's own row carries a real business name; every other row is
// "Business #N" and never exposes ids, user ids or names.
import { getTrustedDisplayName, type EnrichmentData } from '@/lib/enrichment';

export type LeaderboardSourceRow = {
  user_id: string | null;
  user_business_name: string | null;
  input: string | null;
  overall_score: number | null;
  created_at?: string | null;
  location?: string | null;
  enrichment?: EnrichmentData | null;
};

export type LeaderboardRow = { rank: number; name: string; score: number; isUser: boolean; date: string | null };

// b89w: the display name is the TRUSTED name — the same guard the
// dashboard and score history use. The raw stored user_business_name
// can be a poisoned Places match (b87d: scans of "Bright Smile Dental
// Dallas TX" stored "Brite Smiles Dentistry" from the wrong GBP
// match), and keying/naming by the raw value surfaced that wrong
// business as its own (You) row.
export function trustedLeaderboardName(r: LeaderboardSourceRow): string {
  return getTrustedDisplayName(r.input, r.location, r.user_business_name, r.enrichment?.google ?? null);
}

export function cityTokenFrom(location: string | null | undefined): string {
  return (location || '').split(',')[0].replace(/\s+[A-Za-z]{2}$/, '').trim();
}

export function toLeaderboardRows(rows: LeaderboardSourceRow[], viewerId: string | null): LeaderboardRow[] {
  return rows.map((r, i) => {
    const isUser = !!viewerId && r.user_id === viewerId;
    const realName = trustedLeaderboardName(r) || 'Your business';
    return {
      rank: i + 1,
      name: isUser ? `${realName} (You)` : `Business #${i + 1}`,
      score: typeof r.overall_score === 'number' ? r.overall_score : 0,
      isUser,
      // b89w: every real row carries its scan date as its source.
      date: r.created_at ?? null,
    };
  });
}

// Item 16: one row per business — the LATEST scan of each (user, business).
// Before, one user's repeat scans filled several ranks. Rows without a
// user_id are keyed by business name only. Result is ranked by score
// (highest first) and capped at `limit`.
function businessKey(r: LeaderboardSourceRow): string {
  // b89w: key on the trusted name, not the raw stored name — two scans
  // of one business whose stored names differ (one poisoned) are ONE
  // business with one latest scan, not two ranked rows. The guard's
  // fallback is the scanned input, which often appends the city
  // ("Bright Smile Dental Dallas TX" vs the accepted "Bright Smile
  // Dental"), so trailing location tokens are stripped from the key.
  let name = trustedLeaderboardName(r).trim().toLowerCase().replace(/\s+/g, ' ');
  const locTokens = new Set((r.location || '').toLowerCase().split(/[^a-z]+/).filter(Boolean));
  let parts = name.split(' ');
  while (parts.length > 1 && locTokens.has(parts[parts.length - 1])) parts = parts.slice(0, -1);
  name = parts.join(' ');
  return `${r.user_id ?? '-'}|${name}`;
}

export function latestPerBusiness(rows: LeaderboardSourceRow[], limit = 25): LeaderboardSourceRow[] {
  const ts = (r: LeaderboardSourceRow) => (r.created_at ? Date.parse(r.created_at) : 0) || 0;
  const latest = new Map<string, LeaderboardSourceRow>();
  for (const r of rows) {
    if (typeof r.overall_score !== 'number') continue;
    const k = businessKey(r);
    const cur = latest.get(k);
    if (!cur || ts(r) > ts(cur)) latest.set(k, r);
  }
  return [...latest.values()]
    .sort((a, b) => (b.overall_score as number) - (a.overall_score as number))
    .slice(0, limit);
}
