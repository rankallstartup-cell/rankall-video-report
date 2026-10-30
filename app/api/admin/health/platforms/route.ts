import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Admin-only platform health probe. Makes ONE raw API call to Gemini and Kimi
// with a minimal prompt and returns the pass/fail JSON directly — no scan
// infrastructure, so the raw status/error from each key is visible in the browser.

const TEST_PROMPT = 'Say the word yes';

interface GeminiResult {
  success: boolean;
  model: string;
  error?: string;
  status?: number;
  responsePreview?: string;
  attempts?: { model: string; status: number; error: string }[];
}

interface KimiResult {
  success: boolean;
  domain: string;
  error?: string;
  status?: number;
  responsePreview?: string;
  attempts?: { domain: string; status: number; error: string }[];
}

async function testGemini(): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { success: false, model: '', error: 'GEMINI_API_KEY not set' };
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro'];
  const attempts: { model: string; status: number; error: string }[] = [];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: TEST_PROMPT }] }], generationConfig: { maxOutputTokens: 20, temperature: 0 } }) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const reason = data?.error?.message || `HTTP ${res.status}`;
        attempts.push({ model, status: res.status, error: reason });
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) return { success: true, model, status: res.status, responsePreview: text.slice(0, 50), attempts };
      attempts.push({ model, status: res.status, error: 'empty response' });
    } catch (err) {
      attempts.push({ model, status: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const last = attempts[attempts.length - 1];
  return { success: false, model: '', status: last?.status, error: last?.error || 'all models failed', attempts };
}

async function testKimi(): Promise<KimiResult> {
  const key = process.env.KIMI_API_KEY;
  if (!key) return { success: false, domain: '', error: 'KIMI_API_KEY not set' };
  const domains = ['https://api.moonshot.ai/v1/chat/completions', 'https://api.moonshot.cn/v1/chat/completions'];
  const attempts: { domain: string; status: number; error: string }[] = [];
  for (const url of domains) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'kimi-k2.6', messages: [{ role: 'user', content: TEST_PROMPT }], temperature: 0, max_tokens: 20 }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        attempts.push({ domain: url, status: res.status, error: errText.slice(0, 200) });
        // On auth/forbidden try the other regional domain; otherwise stop.
        if (res.status === 401 || res.status === 403) continue;
        return { success: false, domain: url, status: res.status, error: errText.slice(0, 200), attempts };
      }
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        attempts.push({ domain: url, status: res.status, error: data.error.message || String(data.error) });
        continue;
      }
      const text = data.choices?.[0]?.message?.content || '';
      return { success: true, domain: url, status: res.status, responsePreview: text.slice(0, 50), attempts };
    } catch (err) {
      attempts.push({ domain: url, status: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const last = attempts[attempts.length - 1];
  return { success: false, domain: '', status: last?.status, error: last?.error || 'all domains failed', attempts };
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const [gemini, kimi] = await Promise.all([testGemini(), testKimi()]);
  return NextResponse.json({ gemini, kimi, timestamp: new Date().toISOString() });
}
