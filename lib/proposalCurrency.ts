// lib/proposalCurrency.ts
// Item 10: one currency symbol per proposal document. The agency enters its
// fee in USD (the proposal form's "$" field; Rankall bills in USD), while the
// scan's revenue gap is in the prospect market's local currency (£, €, ₹ …).
// A document must never mix the two, so the fee symbol is THE document
// symbol and the quantified gap is quoted only when it is in that same
// currency; otherwise the proposal describes the gap without a number.

export const PROPOSAL_FEE_SYMBOL = '$';

export function formatProposalFee(n: number): string {
  return `${PROPOSAL_FEE_SYMBOL}${Number(n).toLocaleString()}/mo`;
}

/** The revenue gap to quote in the document, or null when its currency differs from the fee's. */
export function proposalRevenueGap(gap: number | null, revenueSymbol: string): number | null {
  if (gap == null) return null;
  return revenueSymbol.trim() === PROPOSAL_FEE_SYMBOL ? gap : null;
}
