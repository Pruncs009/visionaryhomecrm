import type { DealStage } from '@/features/deals/constants';
import type { FileCategory, TransactionSide, TransactionStatus } from '@/types/database.types';

/** Row of public.transaction_list */
export type TransactionRow = {
  id: string;
  organization_id: string;
  name: string;
  side: TransactionSide;
  status: TransactionStatus;
  deal_stage: DealStage;
  property_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  agent_id: string | null;
  offer_price: number | null;
  sale_price: number | null;
  earnest_money: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  contract_date: string | null;
  inspection_deadline: string | null;
  appraisal_deadline: string | null;
  financing_deadline: string | null;
  closing_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  property_address: string;
  property_city: string;
  property_state: string;
  buyer_contact_id: string | null;
  buyer_name: string | null;
  seller_contact_id: string | null;
  seller_name: string | null;
  agent_name: string | null;
  next_deadline: string | null;
  campaign_name: string | null;
  deal_type: string | null;
  purchase_price: number | null;
  lead_manager: string | null;
  acquisition_manager: string | null;
};

export type TransactionListResult = {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageCount: number;
};

export type TransactionFile = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  category: FileCategory;
  createdAt: string;
  uploaderName: string | null;
};

export type DealTask = {
  id: string;
  title: string;
  done: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** Due date as YYYY-MM-DD in the viewer's timezone */
  dueDate: string | null;
  completedAt: string | null;
  assignedTo: string | null;
};

export type DealNote = {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  authorName: string | null;
};

export type DealWorkspace = {
  property: {
    postalCode: string | null;
    mlsNumber: string | null;
    propertyType: string | null;
    listPrice: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    squareFeet: number | null;
    yearBuilt: number | null;
  } | null;
  contacts: Record<string, { email: string | null; phone: string | null }>;
  tasks: DealTask[];
  notes: DealNote[];
};

export type Option ={ id: string; label: string; detail?: string };
