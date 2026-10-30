import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { agencyPlanGate } from '@/lib/agencyPlanGate';

type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'won' | 'lost';
const VALID_STATUSES: ProposalStatus[] = ['draft', 'sent', 'viewed', 'won', 'lost'];

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // b89c: proposal writes are an Agency-plan surface.
  const gate = await agencyPlanGate(user.id);
  if (gate) return gate;

  const body = await req.json();
  const { proposal_id, status } = body;

  if (!proposal_id || !status) {
    return NextResponse.json({ error: 'proposal_id and status are required' }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(status as ProposalStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('agency_proposals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', proposal_id)
    .eq('agency_user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('update-proposal-status error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Proposal not found or not owned by you' }, { status: 404 });
  }

  return NextResponse.json({ success: true, proposal: data });
}
