/**
 * Deal stages for the investor / wholesale pipeline (migration 0010).
 * Order = sidebar order. `slug` is the URL segment under /deals/.
 */
export const DEAL_STAGE_VALUES = [
  'under_contract', 'under_dispo', 'under_rehab',
  'ab_closing', 'bc_closing', 'ac_closing',
  'closed', 'off_market', 'dead',
] as const;
export type DealStage = (typeof DEAL_STAGE_VALUES)[number];

type StageInfo = { slug: string; label: string; description: string; className: string };

export const DEAL_STAGE: Record<DealStage, StageInfo> = {
  under_contract: { slug: 'under-contract', label: 'Under Contract', description: 'Signed with the seller; working toward the next step.', className: 'bg-primary/10 text-primary' },
  under_dispo: { slug: 'under-dispo', label: 'Under Dispo', description: 'Marketing the contract to end buyers.', className: 'bg-chart-2/15 text-foreground' },
  under_rehab: { slug: 'under-rehab', label: 'Under Rehab', description: 'Purchased and being renovated.', className: 'bg-chart-2/15 text-foreground' },
  ab_closing: { slug: 'ab-closing', label: 'A-B Closing', description: 'Closing the purchase from the seller (A → B).', className: 'bg-chart-1/15 text-foreground' },
  bc_closing: { slug: 'bc-closing', label: 'B-C Closing', description: 'Closing the resale to the end buyer (B → C).', className: 'bg-chart-1/15 text-foreground' },
  ac_closing: { slug: 'ac-closing', label: 'A-C Closing', description: 'Assignment or double close, seller straight to end buyer (A → C).', className: 'bg-chart-1/15 text-foreground' },
  closed: { slug: 'closed', label: 'Closed Deals', description: 'Funded and done.', className: 'bg-success/10 text-success' },
  off_market: { slug: 'off-market', label: 'Off Market', description: 'Paused or pulled from the market for now.', className: 'bg-muted text-muted-foreground' },
  dead: { slug: 'dead', label: 'Dead Deals', description: 'Cancelled or fell through.', className: 'bg-muted text-muted-foreground line-through decoration-1' },
};

/** Short label for badges ("Closed" rather than "Closed Deals"). */
export const DEAL_STAGE_SHORT: Partial<Record<DealStage, string>> = { closed: 'Closed', dead: 'Dead' };

export function stageFromSlug(slug: string): DealStage | null {
  return DEAL_STAGE_VALUES.find((s) => DEAL_STAGE[s].slug === slug) ?? null;
}

export function stageHref(stage: DealStage) {
  return `/deals/${DEAL_STAGE[stage].slug}`;
}
