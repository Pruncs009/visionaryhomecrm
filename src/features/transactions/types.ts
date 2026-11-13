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
  emd_due_date: string | null;
  contingency_end_date: string | null;
  transaction_coordinator: string | null;
  emd_in: boolean | null;
  contingency_type: string | null;
  escrow_type: string | null;
  escrow_number: string | null;
  occupancy_strategy: string | null;
  lockbox_code: string | null;
  arv_estimate: number | null;
  rehab_estimate: number | null;
  photos_link: string | null;
  channel: string | null;
  occupancy: string | null;
  ownership_type: string | null;
  ethnicity: string | null;
  prop_last_sold_prior: string | null;
  prop_seller_age: string | null;
  prop_equity: string | null;
  prop_stories: string | null;
  prop_beds: string | null;
  prop_baths: string | null;
  prop_bldg_sqft: string | null;
  prop_lot_size: string | null;
  prop_year_built: string | null;
  prop_county: string | null;
  bc_contract_date: string | null;
  bc_emd_due_date: string | null;
  bc_closing_date: string | null;
  bc_purchase_price: number | null;
  bc_earnest_money: number | null;
  bc_emd_in: boolean | null;
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
  /** 'deal_setup' for the new-deal checklist */
  kind: string | null;
  /** 'lead_acquisition': assigned to the deal's Lead + Acquisition Manager (names on the deal) */
  assigneeRole: string | null;
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
