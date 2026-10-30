'use client';

import React from 'react';

const PURPLE = '#7c3aed';
const NAVY = '#0f172a';
const GRAY = '#64748b';
const LGRAY = '#94a3b8';
const TRACK = '#e5e7eb';
const W = '#ffffff';

export interface LimitReachedData {
  message?: string;
  current?: number;
  limit?: number;
  remaining?: number;
  resetDate?: string;
  feature?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: LimitReachedData;
}

export default function LimitReachedModal({ open, onClose, data }: Props) {
  if (!open) return null;

  const { message, current, limit, resetDate, feature } = data;
  const current_ = typeof current === 'number' ? current : 0;
  const limit_ = typeof limit === 'number' && limit > 0 ? limit : 0;
  const pct = limit_ > 0 ? Math.min(100, Math.round((current_ / limit_) * 100)) : 100;
  const friendlyFeature = feature || 'requests';

  const title =
    limit_ > 0
      ? `You've used all ${limit_} ${friendlyFeature} this month`
      : message || `You've reached your ${friendlyFeature} limit`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.85)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: W,
          borderRadius: 20,
          padding: 36,
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
          position: 'relative',
          fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            color: LGRAY,
            lineHeight: 1,
          }}
        >
          <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
        </button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#f5f3ff',
              fontSize: 28,
              marginBottom: 14,
            }}
          >
            <svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: NAVY, margin: '0 0 8px', lineHeight: 1.2 }}>
            {title}
          </h2>
          {resetDate ? (
            <p style={{ fontSize: 14, color: GRAY, margin: 0, lineHeight: 1.5 }}>
              Your limit resets on {resetDate}.
            </p>
          ) : message ? (
            <p style={{ fontSize: 14, color: GRAY, margin: 0, lineHeight: 1.5 }}>{message}</p>
          ) : null}
        </div>

        {limit_ > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                width: '100%',
                height: 12,
                background: TRACK,
                borderRadius: 100,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: PURPLE,
                  borderRadius: 100,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <p
              style={{
                fontSize: 13,
                color: GRAY,
                margin: '8px 0 0',
                textAlign: 'right',
                fontWeight: 600,
              }}
            >
              {current_}/{limit_} used
            </p>
          </div>
        )}

        <a
          href="/pricing"
          style={{
            display: 'block',
            width: '100%',
            background: PURPLE,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'none',
            boxSizing: 'border-box',
            marginBottom: 10,
          }}
        >
          Upgrade to Business — $39/mo
        </a>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            background: '#fff',
            color: GRAY,
            border: `1.5px solid ${TRACK}`,
            borderRadius: 10,
            padding: '13px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {resetDate ? `Wait until ${resetDate}` : 'Close'}
        </button>
      </div>
    </div>
  );
}
