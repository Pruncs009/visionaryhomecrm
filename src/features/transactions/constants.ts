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
  { key: 'contract_date', label: 'Contract signed' },
  { key: 'inspection_deadline', label: 'Inspection deadline' },
  { key: 'appraisal_deadline', label: 'Appraisal deadline' },
  { key: 'financing_deadline', label: 'Financing deadline' },
  { key: 'closing_date', label: 'Closing' },
] as const;
export type KeyDateKey = (typeof KEY_DATES)[number]['key'];

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
