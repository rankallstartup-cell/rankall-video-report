'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

const supabase = getBrowserClient();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <div style={{ background: '#F6F6FB', minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ background: '#fff', border: '1.5px solid #EDEDF4', borderRadius: 18, padding: '40px 36px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Logo variant="dark" height={30} />
            </Link>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0A0A14', marginBottom: 8 }}>Reset your password</h1>
            <p style={{ fontSize: 14, color: '#55556A', lineHeight: 1.6 }}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {sent ? (
            <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 24, marginBottom: 10, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 512 512" width="24" height="24" fill="#059669" aria-hidden="true"><path d="M64 208.1L256 65.9 448 208.1l0 47.4L289.5 373c-9.7 7.2-21.4 11-33.5 11s-23.8-3.9-33.5-11L64 255.5l0-47.4zM256 0c-12.1 0-23.8 3.9-33.5 11L25.9 156.7C9.6 168.8 0 187.8 0 208.1L0 448c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-239.9c0-20.3-9.6-39.4-25.9-51.4L289.5 11C279.8 3.9 268.1 0 256 0z"/></svg></p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#065F46', marginBottom: 6 }}>Check your inbox</p>
              <p style={{ fontSize: 13, color: '#047857', lineHeight: 1.6 }}>
                We sent a password reset link to <strong>{email}</strong>. Check your spam folder if you don&apos;t see it.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0A0A14', marginBottom: 6 }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  style={{ width: '100%', border: '1.5px solid #EDEDF4', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#0A0A14', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {error && (
                <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{ width: '100%', background: loading || !email.trim() ? '#8A8AA3' : '#1B17FF', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: loading || !email.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {loading ? 'Sending…' : (<>Send reset link <svg viewBox="0 0 448 512" width="13" height="13" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
              </button>
            </form>
          )}

          <p style={{ fontSize: 13, color: '#8A8AA3', textAlign: 'center', marginTop: 20 }}>
            Remember it?{' '}
            <Link href="/login" style={{ color: '#1B17FF', fontWeight: 600, textDecoration: 'none' }}>Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
