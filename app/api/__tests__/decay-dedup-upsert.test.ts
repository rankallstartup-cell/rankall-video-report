import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ax74 residual: email_sequence_log has a UNIQUE index on
// (user_id, trigger_event) — one row per (user, event). The decay
// route INSERTed one row per scan, so every warning after the first
// violated the index, the error was swallowed, the dedup row was
// never recorded, and the same warning re-sent every week forever.
// The row now holds the latest warned scan_id and is UPSERTed on
// (user_id, trigger_event), which can never violate the index.
describe('ax74 decay-email dedup respects the unique index', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/api/cron/score-decay-warning/route.ts'), 'utf-8');

  // ax74 (final): the per-scan key `decay:<scan_id>` replaces the single
  // overwritten 'score_decay_warning' row, and the row is CLAIMED (upsert
  // onConflict + ignoreDuplicates via lib/emailDedupe, error checked) before
  // sending — the old upsert-after-send ignored its {error}.
  it('claims a per-scan key before sending, never inserts after', () => {
    expect(src).toContain("emailDedupeKey('decay', pair[0].id)");
    expect(src).toContain('claimEmailSend(');
    expect(src).not.toContain(".from('email_sequence_log').insert(");
    expect(src.indexOf('claimEmailSend(')).toBeLessThan(src.indexOf("fetch('https://api.resend.com/emails'"));
    const lib = readFileSync(join(process.cwd(), 'lib/emailDedupe.ts'), 'utf-8');
    expect(lib).toContain("onConflict: 'user_id,trigger_event', ignoreDuplicates: true");
  });

  it('a failed send releases the claim so the next run retries', () => {
    expect(src).toContain('releaseEmailClaim(supabase, uid, decayKey)');
  });
});
