import type { FileCategory, TransactionSide, TransactionStatus } from '@/types/database.types';

export const TX_STATUS_VALUES = ['pre_contract', 'under_contract', 'pending', 'closed', 'cancelled'] as const;
export const TX_SIDE_VALUES = ['buyer', 'seller', 'dual'] as const;
export const ACTIVE_STATUSES: TransactionStatus[] = ['pre_contract', 'under_contract', 'pending'];

export const TX_STATUS: Record<TransactionStatus, { label: string; className: string }> = {
  pre_contract: { label: 'Pre-contract', className: 'bg-muted text-muted-foreground' },
  under_contract: { label: 'Under contract', className: 'bg-primary/10 text-primary' },
  pending: { label: 'Pending', className: 'bg-chart-1/15 text-foreground' },
  closed: { label: 'Closed', className: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground line-through decoration-1' },
};

export const TX_SIDE: Record<TransactionSide, string> = {
  buyer: 'Buyer side',
  seller: 'Listing side',
  dual: 'Dual agency',
};

/** Key dates shown on the timeline, in deal order. */
export const KEY_DATES = [
  { key: 'contract_date', label: 'Ratified date' },
  { key: 'emd_due_date', label: 'EMD due date' },
  { key: 'contingency_end_date', label: 'Contingency end date' },
  { key: 'closing_date', label: 'Closing date' },
] as const;
export type KeyDateKey = (typeof KEY_DATES)[number]['key'];

/**
 * A-C (double close) deals track both legs: A-B (buy from the seller) in the
 * usual columns and B-C (sell to the end buyer) in the bc_* columns.
 */
export const SPLIT_KEY_DATES = [
  { key: 'contract_date', label: 'A-B Ratified date' },
  { key: 'bc_contract_date', label: 'B-C Ratified date' },
  { key: 'emd_due_date', label: 'A-B EMD due date' },
  { key: 'bc_emd_due_date', label: 'B-C EMD due date' },
  { key: 'contingency_end_date', label: 'Contingency end date' },
  { key: 'closing_date', label: 'A-B Closing date' },
  { key: 'bc_closing_date', label: 'B-C Closing date' },
] as const;
export type DateKey = KeyDateKey | (typeof SPLIT_KEY_DATES)[number]['key'];
export const keyDatesFor = (split: boolean): readonly { key: DateKey; label: string }[] => (split ? SPLIT_KEY_DATES : KEY_DATES);

/** Show the A-B / B-C split: A-C Closing deals, or any deal that already has B-C values. */
export const isSplitDeal = (tx: {
  deal_stage: string;
  bc_contract_date: string | null;
  bc_emd_due_date: string | null;
  bc_closing_date: string | null;
  bc_purchase_price: number | null;
  bc_earnest_money: number | null;
}) =>
  tx.deal_stage === 'ac_closing' ||
  [tx.bc_contract_date, tx.bc_emd_due_date, tx.bc_closing_date, tx.bc_purchase_price, tx.bc_earnest_money].some((v) => v !== null);

export const FILE_CATEGORY_VALUES = [
  'contract', 'addendum', 'disclosure', 'inspection', 'appraisal', 'id_document', 'photo', 'other',
] as const;
export const FILE_CATEGORY: Record<FileCategory, string> = {
  contract: 'Purchase contract',
  addendum: 'Addendum',
  disclosure: 'Disclosure',
  inspection: 'Inspection report',
  appraisal: 'Appraisal',
  id_document: 'ID document',
  photo: 'Photo',
  other: 'Other',
};

export const STORAGE_BUCKET = 'crm-files';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

/** Storage path for a transaction document. First segment = org → storage RLS. */
export function transactionFilePath(orgId: string, transactionId: string, fileName: string) {
  const safe = fileName.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120);
  return `${orgId}/transactions/${transactionId}/${crypto.randomUUID()}-${safe}`;
}

export const TX_PAGE_SIZE = 25;

/** Checklist added to every new deal (tasks.kind = 'deal_setup'), in order. */
export const DEAL_SETUP_TASKS = [
  'Verify purchase price and EMD',
  'Enter names for Lead and Acquisition Manager',
  'Enter deal type and channel',
  'Enter occupancy, owner (if known) and ethnicity (if known)',
] as const;

/** Checklist added to the B-C copy made when an A-B deal moves to B-C Closing. */
export const BC_SETUP_TASKS = [
  'Enter new purchase price and EMD',
  'Verify new ratified date and closing date',
  "Enter buyer's and seller's names",
  'Enter escrow type',
] as const;
