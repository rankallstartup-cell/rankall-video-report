#!/usr/bin/env node
console.log('trace-category: starting');

async function main() {
  const BASE = 'https://www.rankall.io';

  // ── Step 1: detect-query ─────────────────────────────────────────────────
  console.log('\n=== STEP 1: detect-query ===');
  let dq;
  try {
    const dqRes = await fetch(`${BASE}/api/detect-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Power Rogers Chicago' }),
    });
    console.log('Status:', dqRes.status);
    const text = await dqRes.text();
    console.log('Raw response:', text);
    dq = JSON.parse(text);
  } catch (err) {
    console.error('detect-query failed:', err);
    return;
  }

  // ── Step 2: scan ─────────────────────────────────────────────────────────
  console.log('\n=== STEP 2: scan ===');
  const scanBody = {
    input: 'Power Rogers Chicago',
    isBusinessName: true,
    detectedCategory: dq.category || null,
    detectedCity: dq.location_text || null,
    ...(dq.resolved_category ? { resolved_category: dq.resolved_category, category_confidence: dq.category_confidence } : {}),
    ...(dq.intent ? { detectedIntent: dq.intent } : {}),
    forceRescan: true,
  };
  console.log('Request body:', JSON.stringify(scanBody, null, 2));

  try {
    const scanRes = await fetch(`${BASE}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanBody),
    });
    console.log('Status:', scanRes.status);
    const text = await scanRes.text();
    console.log('Raw response:', text.slice(0, 2000));
  } catch (err) {
    console.error('scan failed:', err);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
