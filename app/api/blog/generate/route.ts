import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cronAuthFailure } from '@/lib/cronAuth'

export const maxDuration = 60

// Service role client - bypasses RLS, lazy init to avoid build-time crash
let _adminClient: SupabaseClient | null = null
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _adminClient
}
const supabaseAdmin = new Proxy({} as SupabaseClient, { get(_t, p) { return (getAdminClient() as any)[p] } })

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: Request) {
  // Auth check — Bearer CRON_SECRET (matches the cron + admin trigger).
  // Fails CLOSED when CRON_SECRET is unset (the old string compare accepted
  // a literal "Bearer undefined" header).
  const authFail = cronAuthFailure(request)
  if (authFail) return authFail

  const body = await request.json()
  const {
    industry,
    city,
  }: { industry: string; city: string; country?: string } = body

  if (!industry || !city) {
    return Response.json({ error: 'industry and city are required' }, { status: 400 })
  }

  console.log('[blog] called with:', { industry, city })

  let htmlContent: string
  let title: string

  try {
    console.log('[blog] calling Anthropic for:', industry, city)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: 'You are an SEO content writer for Rankall.io, a tool that scans 12 AI platforms to show if a local business appears in AI recommendations.',
        messages: [
          {
            role: 'user',
            content: `Write a blog post targeting people searching for things like:
- "why isn't my ${industry} on ChatGPT"
- "how to get my business recommended by AI"
- "ChatGPT recommendations for ${industry} in ${city}"

Business type: ${industry}
Location: ${city}

Rules:
- First line must be the title only, no prefix. Write it like a real search query answer, not a report title.
- Good titles: "Why ChatGPT Isn't Recommending Your ${city} ${industry} (And How to Fix It)" or "How ${city} ${industry}s Can Appear on ChatGPT, Gemini and Perplexity"
- Bad titles: "AI Visibility Report: ${industry} in ${city}"
- Answer the search intent directly in the first paragraph
- Use "ChatGPT recommendations" naturally 2-3 times
- Use "AI visibility" 3-4 times
- Use "local business AI" once
- Include 3 actionable fixes with one sentence each
- End with one line CTA to scan at rankall.io
- Plain text only. No HTML. No markdown. 400-500 words total.`,
          },
        ],
      }),
    })

    console.log('[blog] Anthropic response status:', res.status)

    if (res.status !== 200) {
      const errBody = await res.text()
      console.error('[blog] Anthropic error body:', errBody)
      return NextResponse.json({
        error: 'Anthropic API error',
        status: res.status,
        body: errBody,
      }, { status: 500 })
    }

    const data = await res.json()
    console.log('[blog] Anthropic data received, content length:', data.content?.[0]?.text?.length)

    const raw = (data.content?.[0]?.text ?? '').trim()
    const stopReason: string = data.stop_reason ?? 'unknown'
    console.log('ANTHROPIC STOP REASON:', stopReason)
    console.log('CONTENT END:', raw.slice(-200))
    if (!raw) {
      return NextResponse.json({ error: 'Unexpected response from Anthropic' }, { status: 500 })
    }

    const newlineIdx = raw.indexOf('\n')
    if (newlineIdx > 0) {
      title = raw.slice(0, newlineIdx).trim()
      htmlContent = raw.slice(newlineIdx + 1).trim()
    } else {
      title = `How ${city} ${industry} Businesses Can Improve AI Visibility`
      htmlContent = raw
    }
  } catch (err) {
    console.error('[blog] Anthropic fetch failed:', err)
    return NextResponse.json({
      error: 'Anthropic API call failed',
      details: String(err),
    }, { status: 500 })
  }

  // Generate slug + excerpt for the index/SEO.
  const timestamp = String(Date.now()).slice(-6)
  const slug = `${toKebabCase(title)}-${timestamp}`
  const plain = htmlContent.replace(/\s+/g, ' ').trim()
  const excerpt = plain.length > 157 ? `${plain.slice(0, 157)}…` : plain

  try {
    const { error: insertError } = await supabaseAdmin.from('blog_posts').insert({
      slug,
      title,
      content: htmlContent,
      excerpt,
      industry,
      city,
      meta_description: excerpt,
      published: true,
      published_at: new Date().toISOString(),
    })
    console.log('[blog] insert error:', insertError?.message || 'none')
    console.log('[blog] insert slug:', slug)

    if (insertError) {
      console.error('[blog] FAILED:', insertError)
      return NextResponse.json({
        error: insertError.message,
        hint: insertError.hint,
        details: insertError.details,
        slug: null,
      }, { status: 500 })
    }
  } catch (e) {
    console.log('CATCH ERROR:', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }

  return Response.json({ success: true, slug, title })
}
