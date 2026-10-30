'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { generateReferralCode } from '@/lib/referralCode';

interface ReferralConversion {
  id: string;
  referred_email: string;
  plan: string;
  monthly_amount: number;
  commission: number;
  status: string;
  created_at: string;
}

interface User {
  id: string;
  email?: string;
}

export default function ReferralsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [conversions, setConversions] = useState<ReferralConversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = getBrowserClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      if (u) {
        const { data } = await supabase
          .from('referral_conversions')
          .select('*')
          .eq('referrer_user_id', u.id)
          .order('created_at', { ascending: false });
        setConversions(data ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  // b889: the canonical code (generateReferralCode — uppercase)
  // on the CURRENT origin. This page previously sliced the raw
  // UUID (lowercase) and hardcoded the production domain, so the
  // two surfaces showed different links for the same code and a
  // staging user copied a production link.
  const refCode = user ? generateReferralCode(user.id) : '';
  const refLink = user ? `${window.location.origin}/?ref=${refCode}` : '';

  const totalEarned = conversions.reduce((sum, c) => sum + (c.commission ?? 0), 0);
  const activeReferrals = conversions.filter(c => c.status === 'active').length;

  async function copyLink() {
    setCopyError(false);
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Never flash "Copied!" when the write failed — show an honest error instead.
      setCopyError(true);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif", background: '#0f0f23', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#8A8AA3', fontSize: '16px' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f23', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#1a1a3e', border: '1px solid #2d2d5e', borderRadius: '16px', padding: '48px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}><svg viewBox="0 0 576 512" width="40" height="40" fill="#10b981" aria-hidden="true"><path d="M0 112.5L0 422.3c0 18 10.1 35 27 41.3c87 32.5 174 10.3 261-11.9c79.8-20.3 159.6-40.7 239.3-18.9c23 6.3 48.7-9.5 48.7-33.4l0-309.9c0-18-10.1-35-27-41.3C462 15.9 375 38.1 288 60.3C208.2 80.6 128.4 100.9 48.7 79.1C25.6 72.8 0 88.6 0 112.5zM288 352c-44.2 0-80-43-80-96s35.8-96 80-96s80 43 80 96s-35.8 96-80 96zM64 352c35.3 0 64 28.7 64 64l-64 0 0-64zm64-208c0 35.3-28.7 64-64 64l0-64 64 0zM512 304l0 64-64 0c0-35.3 28.7-64 64-64zM448 96l64 0 0 64c-35.3 0-64-28.7-64-64z"/></svg></div>
          <h1 style={{ color: '#ffffff', fontSize: '28px', fontWeight: '800', margin: '0 0 12px' }}>Earn 25% Recurring Commission</h1>
          <p style={{ color: '#8A8AA3', fontSize: '16px', lineHeight: '1.6', margin: '0 0 32px' }}>
            Refer businesses to Rankall.io and earn 25% of every payment — for life.
          </p>
          <a
            href="/signup"
            style={{ display: 'inline-block', background: '#1B17FF', color: '#ffffff', textDecoration: 'none', padding: '14px 32px', borderRadius: '10px', fontWeight: '700', fontSize: '16px' }}
          >
            Sign up to get your link <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', padding: '32px 16px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#ffffff', fontSize: '32px', fontWeight: '900', margin: '0 0 8px' }}>
            Referral Program
          </h1>
          <p style={{ color: '#8A8AA3', fontSize: '16px', margin: '0' }}>
            Earn <span style={{ color: '#1B17FF', fontWeight: '700' }}>25% recurring commission</span> for every business you refer.
          </p>
        </div>

        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#1a1a3e', border: '1px solid #2d2d5e', borderRadius: '12px', padding: '24px' }}>
            <p style={{ color: '#8A8AA3', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Total Earned</p>
            <p style={{ color: '#1B17FF', fontSize: '28px', fontWeight: '900', margin: '0' }}>${totalEarned.toFixed(2)}</p>
          </div>
          <div style={{ background: '#1a1a3e', border: '1px solid #2d2d5e', borderRadius: '12px', padding: '24px' }}>
            <p style={{ color: '#8A8AA3', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Active Referrals</p>
            <p style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', margin: '0' }}>{activeReferrals}</p>
          </div>
          <div style={{ background: '#1a1a3e', border: '1px solid #2d2d5e', borderRadius: '12px', padding: '24px' }}>
            <p style={{ color: '#8A8AA3', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Commission Rate</p>
            <p style={{ color: '#10b981', fontSize: '28px', fontWeight: '900', margin: '0' }}>25%</p>
          </div>
        </div>

        {/* Referral link card */}
        <div style={{ background: '#1a1a3e', border: '1px solid #1B17FF', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Your Unique Referral Link</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, background: '#0f0f23', border: '1px solid #2d2d5e', borderRadius: '8px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '14px', color: '#c4b5fd', minWidth: '200px' }}>
              {refLink}
            </div>
            <button
              onClick={copyLink}
              style={{ background: copied ? '#10b981' : '#1B17FF', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '12px 20px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
          {copyError && (
            <p style={{ color: '#f87171', fontSize: '13px', margin: '12px 0 0' }}>
              Couldn't copy automatically — please copy the link manually.
            </p>
          )}
        </div>

        {/* How it works */}
        <div style={{ background: '#1a1a3e', border: '1px solid #2d2d5e', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>How It Works</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { step: '1', text: 'Share your unique referral link with local business owners' },
              { step: '2', text: 'They sign up and subscribe to any Rankall.io plan' },
              { step: '3', text: 'You earn 25% of every payment, every month — forever' },
            ].map(({ step, text }) => (
              <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '28px', height: '28px', background: '#1B17FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: '900' }}>{step}</span>
                </div>
                <p style={{ color: '#d1d5db', fontSize: '14px', lineHeight: '1.6', margin: '4px 0 0' }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Conversions table — always rendered: at zero referrals it
            is an honest empty state, not a missing section (b8b3). */}
        <div style={{ background: '#1a1a3e', border: '1px solid #2d2d5e', borderRadius: '12px', padding: '24px' }}>
          <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>Your Referrals</p>
          {conversions.length === 0 ? (
            <p style={{ color: '#8A8AA3', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
              No referrals yet — share your link above to get started. Referrals appear here once someone signs up through your link and subscribes.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Email', 'Plan', 'Monthly', 'Commission', 'Status'].map(h => (
                      <th key={h} style={{ color: '#8A8AA3', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 12px 12px 0', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conversions.map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid #2d2d5e' }}>
                      <td style={{ padding: '12px 12px 12px 0', color: '#d1d5db', fontSize: '13px' }}>{c.referred_email}</td>
                      <td style={{ padding: '12px 12px 12px 0', color: '#d1d5db', fontSize: '13px' }}>{c.plan}</td>
                      <td style={{ padding: '12px 12px 12px 0', color: '#d1d5db', fontSize: '13px' }}>${c.monthly_amount?.toFixed(2)}</td>
                      <td style={{ padding: '12px 12px 12px 0', color: '#10b981', fontSize: '13px', fontWeight: '700' }}>${c.commission?.toFixed(2)}</td>
                      <td style={{ padding: '12px 12px 12px 0' }}>
                        <span style={{ background: c.status === 'active' ? '#064e3b' : '#1f2937', color: c.status === 'active' ? '#10b981' : '#8A8AA3', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px' }}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
