// DEPRECATED alias — the canonical pause route is /api/user/pause-subscription.
//
// The old body of this file took `userId` from the request body with no
// session and paused that user's Stripe billing (behavior=void) — anyone
// could void any customer's invoices. It now delegates to the canonical,
// session-derived route: the caller can only pause their OWN subscription,
// any body userId is ignored, and the pause has a fixed 30-day resumes_at.
export { POST } from '../user/pause-subscription/route';

export const dynamic = 'force-dynamic';
