import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Reads the product tour server-side with the service-role key so RLS / anon
// visibility on the product_tour table can never block the /demo player.
// Falls back to the anon key if no service-role key is configured.
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ steps: [], error: 'supabase env not configured' });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('product_tour')
      .select('steps, generated_at')
      .eq('id', 'main')
      .maybeSingle();

    if (error) {
      console.log('[/api/tour] query error:', error.message);
      return NextResponse.json({ steps: [], error: error.message });
    }

    const steps = Array.isArray((data as any)?.steps) ? (data as any).steps : [];
    const withScreens = steps.filter((s: any) => s?.screenshot_url).length;
    console.log(`[/api/tour] steps: ${steps.length}, with screenshots: ${withScreens}`);

    return NextResponse.json({
      steps,
      generated_at: (data as any)?.generated_at ?? null,
    });
  } catch (e) {
    console.log('[/api/tour] fatal:', String(e));
    return NextResponse.json({ steps: [], error: String(e) });
  }
}
