'use client';

import { useState, Suspense } from 'react';
import { initialUnsubscribeView, type UnsubscribeView } from '@/lib/unsubscribeView';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HONEYPOT_FIELD } from '@/lib/publicFormGuardShared';
import Logo from '@/components/Logo';

// b8be rewrite — the old page had three defects:
//   1. It showed "You have been unsubscribed" on a BARE load: the render
//      fell through to the success branch whenever it was not loading
//      and not failed — no action had happened (the API was never
//      called without params, so the bare load unsubscribed nobody,
//      but the page claimed it had).
//   2. With ?email=&token= it auto-fired a GET that unsubscribed on
//      page load — no explicit consent, and email-client prefetchers
//      would unsubscribe people who never clicked.
//   3. It never said which emails stop vs continue.
// New behavior: NOTHING happens on load, ever. A signed link shows a
// confirm form (explicit "Yes, unsubscribe me" POSTs). A bare load
// explains how to unsubscribe and does nothing. Both states say
// transactional emails continue. The API route (POST-only) does the
// mutating; GET only explains.

function UnsubscribeContent() {
  const params = useSearchParams();
  const paramEmail = params.get('email') || '';
  const paramToken = params.get('token') || '';
  const paramSuccess = params.get('success') === 'true';

  const [view, setView] = useState<UnsubscribeView>(() =>
    initialUnsubscribeView(paramEmail, paramToken, paramSuccess));

  const confirm = () => {
    setView('loading');
    fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: paramEmail, token: paramToken, [HONEYPOT_FIELD]: '' }),
    })
      .then((r) => setView(r.ok ? 'done' : 'failed'))
      .catch(() => setView('failed'));
  };

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", background: '#F6F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
              <Logo variant="dark" height={30} />
            </Link>

        <div style={{ background: '#fff', border: '1.5px solid #EDEDF4', borderRadius: 20, padding: '48px 40px' }}>
          {view === 'done' ? (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', border: '2px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>✓</div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0A0A14', margin: '0 0 12px' }}>You have been unsubscribed</h1>
              <p style={{ fontSize: 15, color: '#55556A', lineHeight: 1.6, margin: '0 0 8px' }}>
                {paramEmail ? <><strong>{paramEmail}</strong> will not receive</> : 'You will not receive'} further marketing emails from Rankall.
              </p>
              <p style={{ fontSize: 14, color: '#8A8AA3', lineHeight: 1.6, margin: '0 0 8px' }}>
                It may take up to 24 hours to fully process.
              </p>
              <p style={{ fontSize: 14, color: '#8A8AA3', lineHeight: 1.6, margin: '0 0 32px' }}>
                Transactional emails — scan results, receipts, and security notices — will continue.
              </p>
              <Link href="/" style={{ display: 'inline-block', padding: '12px 28px', background: '#0A0A14', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Visit rankall.io</Link>
            </>
          ) : view === 'failed' ? (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF2F2', border: '2px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>!</div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0A0A14', margin: '0 0 12px' }}>Link expired or invalid</h1>
              <p style={{ fontSize: 15, color: '#55556A', lineHeight: 1.6, margin: '0 0 32px' }}>
                We couldn&apos;t verify this unsubscribe link. Please use the most recent email, or contact us at <a href="mailto:hello@rankall.io" style={{ color: '#1B17FF' }}>hello@rankall.io</a>.
              </p>
              <Link href="/" style={{ display: 'inline-block', padding: '12px 28px', background: '#0A0A14', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Visit rankall.io</Link>
            </>
          ) : view === 'missing' ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0A0A14', margin: '0 0 12px' }}>Unsubscribe from Rankall emails</h1>
              <p style={{ fontSize: 15, color: '#55556A', lineHeight: 1.6, margin: '0 0 12px' }}>
                Use the <strong>Unsubscribe</strong> link at the bottom of any Rankall email. It opens this page with your address filled in.
              </p>
              <p style={{ fontSize: 14, color: '#55556A', lineHeight: 1.6, margin: '0 0 32px' }}>
                Nothing has been changed — this page does nothing until you confirm from a link. Signed in? You can also turn emails off in <Link href="/settings" style={{ color: '#1B17FF' }}>Settings</Link>, or write to us from the <Link href="/contact" style={{ color: '#1B17FF' }}>contact page</Link>.
              </p>
              <Link
                href="/"
                style={{ display: 'inline-block', padding: '12px 28px', background: '#0A0A14', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
              >
                Visit rankall.io</Link>
            </>
          ) : view === 'confirm' ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0A0A14', margin: '0 0 12px' }}>Unsubscribe {paramEmail}?</h1>
              <p style={{ fontSize: 15, color: '#55556A', lineHeight: 1.6, margin: '0 0 8px' }}>
                You&apos;ll stop getting marketing and outreach emails, rescan reports, alerts and tips.
              </p>
              <p style={{ fontSize: 14, color: '#55556A', lineHeight: 1.6, margin: '0 0 28px' }}>
                If you have an account, we&apos;ll still send receipts, billing notices, password resets and reports you ask for.
              </p>
              <button
                type="button"
                onClick={confirm}
                style={{ padding: '13px 28px', background: '#1B17FF', color: '#fff', border: 0, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Yes, unsubscribe me
              </button>
              <p style={{ fontSize: 13, color: '#55556A', margin: '16px 0 0' }}>
                Changed your mind? <Link href="/" style={{ color: '#1B17FF' }}>Keep my emails</Link>
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0A0A14', margin: '0 0 12px' }}>Processing…</h1>
              <p style={{ fontSize: 15, color: '#55556A', lineHeight: 1.6 }}>
                Confirming your request — one moment.
              </p>
            </>
          )}
        </div>

        <p style={{ fontSize: 12, color: '#CBD5E1', marginTop: 20 }}>
          Rankall.io · AI Recommendation Intelligence
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeContent />
    </Suspense>
  );
}
