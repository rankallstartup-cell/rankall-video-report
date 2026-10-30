// Slice 2: jobs API route behaviour (GET list). Kept separate from
// video-jobs.test.ts because it imports the route module (next/server +
// supabase + pipeline); if that import ever stops working under vitest,
// this file alone fails and the pure + source-assertion coverage survives.
import { describe, it, expect, afterEach } from 'vitest';
import { GET } from '@/app/api/hackathon/video-report/jobs/route';

afterEach(() => {
  delete process.env.HACKATHON_VIDEO_REPORT_ENABLED;
});

describe('GET /api/hackathon/video-report/jobs', () => {
  it('404s when the flag is off', async () => {
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('lists jobs newest-first when the flag is on (empty on a fresh module)', async () => {
    process.env.HACKATHON_VIDEO_REPORT_ENABLED = '1';
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(data.jobs).toEqual([]);
  });
});
