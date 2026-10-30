'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { isAdminUser } from '@/lib/planConfig';

export function useAdminGuard(): { checking: boolean; isAdmin: boolean } {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      // ax86: canonical check (normalizes) — no local allowlist copy.
      if (isAdminUser(user?.email)) {
        setIsAdmin(true);
      } else {
        router.replace('/dashboard?restricted=1');
      }
      setChecking(false);
    });
  }, [router]);

  return { checking, isAdmin };
}
