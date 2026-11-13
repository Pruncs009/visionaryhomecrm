import { isSplitDeal } from './constants';
import type { TransactionRow } from './types';

/**
 * Checklist tasks (deal setup, B-C setup, Lead Manager follow-ups) can only be
 * completed once the work is actually in the CRM: e.g. "Verify purchase price
 * and EMD" needs both amounts on the deal. Used by the Tasks tab (to block the
 * checkbox and explain why) and by the server action (so it can't be bypassed).
 */

export type TaskFacts = {
  tx: Pick<
    TransactionRow,
    | 'purchase_price' | 'earnest_money' | 'bc_purchase_price' | 'bc_earnest_money'
    | 'lead_manager' | 'acquisition_manager' | 'deal_type' | 'channel' | 'occupancy'
    | 'contract_date' | 'closing_date' | 'buyer_name' | 'seller_name' | 'escrow_type'
    | 'campaign_name' | 'arv_estimate' | 'rehab_estimate' | 'photos_link' | 'deal_stage'
  > & Parameters<typeof isSplitDeal>[0];
  /** Roles of people added in the People panel (e.g. 'buyer', 'seller'). */
  partyRoles: string[];
};

const has = (v: unknown) => (typeof v === 'number' ? v > 0 : typeof v === 'string' ? v.trim() !== '' : v != null);

type Rule = { need: [label: string, ok: (f: TaskFacts) => boolean][] };

const purchaseAndEmd = (f: TaskFacts): Rule['need'] => {
  const split = isSplitDeal(f.tx);
  return [
    [split ? 'A-B purchase price' : 'purchase price', (x) => has(x.tx.purchase_price)],
    [split ? 'A-B EMD' : 'EMD', (x) => has(x.tx.earnest_money)],
    ...(split
      ? ([
          ['B-C purchase price', (x) => has(x.tx.bc_purchase_price)],
          ['B-C EMD', (x) => has(x.tx.bc_earnest_money)],
        ] as Rule['need'])
      : []),
  ];
};

const RULES: Record<string, (f: TaskFacts) => Rule['need']> = {
  // New deal (A-B / A-C)
  'Verify purchase price and EMD': purchaseAndEmd,
  'Enter names for Lead and Acquisition Manager': () => [
    ['Lead Manager', (x) => has(x.tx.lead_manager)],
    ['Acquisition Manager', (x) => has(x.tx.acquisition_manager)],
  ],
  'Enter deal type and channel': () => [
    ['deal type', (x) => has(x.tx.deal_type)],
    ['channel', (x) => has(x.tx.channel)],
  ],
  // Owner and ethnicity are "if known", so only occupancy is required.
  'Enter occupancy, owner (if known) and ethnicity (if known)': () => [['occupancy', (x) => has(x.tx.occupancy)]],
  // B-C copy
  'Enter new purchase price and EMD': () => [
    ['purchase price', (x) => has(x.tx.purchase_price)],
    ['EMD', (x) => has(x.tx.earnest_money)],
  ],
  'Verify new ratified date and closing date': () => [
    ['ratified date', (x) => has(x.tx.contract_date)],
    ['closing date', (x) => has(x.tx.closing_date)],
  ],
  "Enter buyer's and seller's names": () => [
    ["buyer's name", (x) => has(x.tx.buyer_name) || x.partyRoles.includes('buyer')],
    ["seller's name", (x) => has(x.tx.seller_name) || x.partyRoles.includes('seller')],
  ],
  'Enter escrow type': () => [['escrow type', (x) => has(x.tx.escrow_type)]],
  // Lead Manager follow-ups
  'Enter campaign name': () => [['campaign name', (x) => has(x.tx.campaign_name)]],
  'Enter ARV estimate': () => [['ARV estimate', (x) => has(x.tx.arv_estimate)]],
  'Enter rehab estimate': () => [['rehab estimate', (x) => has(x.tx.rehab_estimate)]],
  'Enter photos link': () => [['photos link', (x) => has(x.tx.photos_link)]],
};

const CHECKLIST_KINDS = new Set(['deal_setup', 'lm_followup']);

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * Why this task can't be completed yet ("Enter the purchase price and EMD first."),
 * or null when it can. Only checklist tasks have requirements.
 */
export function taskBlocker(task: { title: string; kind: string | null }, facts: TaskFacts): string | null {
  if (!task.kind || !CHECKLIST_KINDS.has(task.kind)) return null;
  const rule = RULES[task.title];
  if (!rule) return null;
  const missing = rule(facts).filter(([, ok]) => !ok(facts)).map(([label]) => label);
  return missing.length ? `Enter the ${list(missing)} first, then complete this task.` : null;
}

/** Setup checklists are due the day the deal is created, so they count as overdue right away. */
export function isOverdue(task: { done: boolean; dueDate: string | null; kind: string | null }, today: string): boolean {
  if (task.done || !task.dueDate) return false;
  return task.kind === 'deal_setup' ? task.dueDate <= today : task.dueDate < today;
}
