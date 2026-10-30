'use client'
import { useState } from 'react'

const TEST_USER_ID = '9e8aea3b-deef-4907-adfb-6d98981ea63f'
const TEST_EMAIL = 'rankallstartup@gmail.com'

// Each test posts to the admin-only /api/admin/test-email proxy, which attaches
// CRON_SECRET server-side and forwards to the real endpoint. The secret never
// touches the client bundle. Milestone payloads use the flat field names the
// /api/milestone-email route actually reads.
const EMAIL_TESTS: Array<{ label: string; request: Record<string, unknown> }> = [
  {
    label: 'First Fix Applied',
    request: {
      testType: 'milestone',
      payload: {
        user_id: TEST_USER_ID,
        email: TEST_EMAIL,
        milestone: 'first_fix_applied',
        score: 31,
        fix_type: 'faq_schema',
        predicted_impact: 18,
        business_name: 'Test Business'
      }
    }
  },
  {
    label: 'Score Jump (+36 pts)',
    request: {
      testType: 'milestone',
      payload: {
        user_id: TEST_USER_ID,
        email: TEST_EMAIL,
        milestone: 'score_jump',
        score: 67,
        prev_score: 31,
        business_name: 'Test Business'
      }
    }
  },
  {
    label: 'Competitor Overtaken',
    request: {
      testType: 'milestone',
      payload: {
        user_id: TEST_USER_ID,
        email: TEST_EMAIL,
        milestone: 'competitor_overtaken',
        score: 68,
        competitor_score: 65,
        competitor_name: 'Test Competitor',
        business_name: 'Test Business'
      }
    }
  },
  {
    label: 'Day 2 Onboarding',
    request: {
      testType: 'sequence',
      payload: {
        userId: TEST_USER_ID,
        email: TEST_EMAIL,
        businessName: 'Test Business',
        triggerEvent: 'day2',
        currentScore: 31,
        competitorName: 'Test Competitor',
        industry: 'dentist',
        countryCode: 'US'
      }
    }
  },
  {
    label: 'Day 60 Agency Upsell',
    request: {
      testType: 'sequence',
      payload: {
        userId: TEST_USER_ID,
        email: TEST_EMAIL,
        businessName: 'Test Business',
        triggerEvent: 'day60',
        currentScore: 67,
        competitorName: 'Test Competitor',
        industry: 'dentist',
        countryCode: 'US'
      }
    }
  },
  {
    label: 'Re-engagement Cron',
    request: { testType: 'cron', endpoint: '/api/cron/re-engagement' }
  },
  {
    label: 'Monthly ROI Cron',
    request: { testType: 'cron', endpoint: '/api/cron/monthly-roi' }
  },
  {
    label: 'Referral Invite Cron',
    request: { testType: 'cron', endpoint: '/api/cron/referral-invite' }
  }
]

export default function EmailTestPanel() {
  const [results, setResults] =
    useState<Record<string, string>>({})
  const [loading, setLoading] =
    useState<Record<string, boolean>>({})

  const runTest = async (test: typeof EMAIL_TESTS[0]) => {
    setLoading(prev => ({
      ...prev, [test.label]: true
    }))

    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.request)
      })

      const data = await res.json()
        .catch(() => ({}))

      setResults(prev => ({
        ...prev,
        [test.label]: res.ok
          ? `✅ Sent (${JSON.stringify(
              data).slice(0, 100)})`
          : `❌ Failed: ${data.error
              || res.status}`
      }))
    } catch (err: any) {
      setResults(prev => ({
        ...prev,
        [test.label]: `❌ Error: ${
          err.message}`
      }))
    } finally {
      setLoading(prev => ({
        ...prev, [test.label]: false
      }))
    }
  }

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E7E7F0',
      borderRadius: 12,
      padding: 24,
      marginTop: 24
    }}>
      <h3 style={{
        color: '#0A0A14',
        fontSize: 16,
        fontWeight: 700,
        margin: '0 0 16px'
      }}>
        📧 Email System Test
      </h3>
      <p style={{
        color: '#55556A',
        fontSize: 13,
        margin: '0 0 16px'
      }}>
        Milestone/sequence tests send to {TEST_EMAIL}. Cron tests send only to
        your admin inbox (no real users are emailed).
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns:
          'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12
      }}>
        {EMAIL_TESTS.map(test => (
          <div key={test.label}>
            <button
              onClick={() => runTest(test)}
              disabled={loading[test.label]}
              style={{
                width: '100%',
                background: loading[test.label]
                  ? '#E7E7F0'
                  : '#1B17FF',
                color: loading[test.label] ? '#94A3B8' : 'white',
                border: '1px solid #E7E7F0',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading[test.label]
                  ? 'not-allowed'
                  : 'pointer',
                textAlign: 'left'
              }}>
              {loading[test.label]
                ? '⏳ Sending...'
                : test.label}
            </button>
            {results[test.label] && (
              <p style={{
                fontSize: 11,
                margin: '4px 0 0',
                color: results[test.label]
                  .startsWith('✅')
                  ? '#22c55e'
                  : '#ef4444'
              }}>
                {results[test.label]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
