// Which screen /unsubscribe opens on (b8be). A bare /unsubscribe must never
// claim the visitor was unsubscribed, and a link with a token waits for a
// click so email link scanners cannot unsubscribe anyone.
export type UnsubscribeView = 'missing' | 'confirm' | 'loading' | 'failed' | 'done';

export function initialUnsubscribeView(email: string, token: string, success: boolean): UnsubscribeView {
  if (success) return 'done';
  if (!email || !token) return 'missing';
  return 'confirm';
}
