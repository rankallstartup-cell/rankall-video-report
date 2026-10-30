import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import QAChecklist from './QAChecklist';
import { isAdminUser } from '@/lib/planConfig';

export default async function QAChecklistPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!isAdminUser(user?.email)) {
    return (
      <div style={{ minHeight: '100vh', background: '#F6F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#55556A', fontSize: 18 }}>Access denied — admin only.</p>
      </div>
    );
  }

  return <QAChecklist />;
}
