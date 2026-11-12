// Hand-written to mirror supabase/migrations. Once the database is connected,
// replace with generated types (they also give typed Supabase queries):
//   npm run db:types        (local Supabase)
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts

type UUID = string;
type Timestamp = string; // ISO 8601
type DateString = string; // YYYY-MM-DD

// ---- Enums -------------------------------------------------------------------
export type MemberRole = 'owner' | 'admin' | 'agent' | 'assistant';
export type ContactMethod = 'email' | 'phone' | 'text';
export type LeadStatus =
  | 'new' | 'attempting_contact' | 'contacted' | 'nurturing' | 'qualified'
  | 'appointment_set' | 'active_client' | 'under_contract' | 'closed_won' | 'closed_lost';
export type LeadIntent = 'buy' | 'sell' | 'buy_and_sell' | 'rent' | 'invest';
export type BuyerStatus = 'active' | 'under_contract' | 'closed' | 'inactive';
export type SellerStatus = 'prospect' | 'listed' | 'under_contract' | 'sold' | 'inactive';
export type PropertyStatus = 'off_market' | 'coming_soon' | 'active' | 'pending' | 'sold' | 'withdrawn' | 'expired';
export type PropertyType = 'single_family' | 'condo' | 'townhouse' | 'multi_family' | 'land' | 'commercial' | 'manufactured' | 'other';
export type TransactionSide = 'buyer' | 'seller' | 'dual';
export type TransactionStatus = 'pre_contract' | 'under_contract' | 'pending' | 'closed' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type AppointmentType = 'showing' | 'listing_presentation' | 'buyer_consultation' | 'open_house' | 'inspection' | 'appraisal' | 'closing' | 'call' | 'meeting' | 'other';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type FileCategory = 'contract' | 'disclosure' | 'addendum' | 'inspection' | 'appraisal' | 'photo' | 'id_document' | 'other';

// numeric columns come back from PostgREST as numbers (or strings for very large values)
type Money = number;

// ---- Shared column groups ----------------------------------------------------
type Tenant = { id: UUID; organization_id: UUID };
type Audit = { created_by: UUID | null; created_at: Timestamp; updated_at: Timestamp };
type SoftDelete = { deleted_at: Timestamp | null };
/** Optional links used by tasks, notes, files and appointments. */
export type RecordLinks = {
  contact_id: UUID | null;
  lead_id: UUID | null;
  buyer_id: UUID | null;
  seller_id: UUID | null;
  property_id: UUID | null;
  transaction_id: UUID | null;
};

// ---- Auth / tenancy ----------------------------------------------------------
export type Organization = {
  id: UUID;
  name: string;
  slug: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** The app's "users" table (1:1 with auth.users). */
export type Profile = {
  id: UUID;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  title: string | null;
  license_number: string | null;
  timezone: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Membership = {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: MemberRole;
  created_at: Timestamp;
};

// ---- CRM -----------------------------------------------------------------------
export type Contact = Tenant & Audit & SoftDelete & {
  owner_id: UUID | null;
  first_name: string;
  last_name: string | null;
  full_name: string; // generated
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  company: string | null;
  job_title: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  birthday: DateString | null;
  source: string | null;
  tags: string[];
  preferred_contact_method: ContactMethod | null;
  do_not_contact: boolean;
};

export type Lead = Tenant & Audit & SoftDelete & {
  contact_id: UUID;
  assigned_to: UUID | null;
  status: LeadStatus;
  intent: LeadIntent;
  source: string | null;
  source_detail: string | null;
  score: number | null;
  budget_min: Money | null;
  budget_max: Money | null;
  timeframe: string | null;
  message: string | null;
  last_contacted_at: Timestamp | null;
  converted_at: Timestamp | null;
  lost_reason: string | null;
  pipeline_position: number;
  ai_temperature: 'hot' | 'warm' | 'cold' | null;
  ai_summary: string | null;
  ai_reasons: string[];
  ai_suggestions: unknown; // validated with features/ai/schemas before use
  ai_analyzed_at: Timestamp | null;
};

export type Buyer = Tenant & Audit & SoftDelete & {
  contact_id: UUID;
  lead_id: UUID | null;
  agent_id: UUID | null;
  status: BuyerStatus;
  pre_approved: boolean;
  pre_approval_amount: Money | null;
  pre_approval_expires_on: DateString | null;
  lender_name: string | null;
  min_price: Money | null;
  max_price: Money | null;
  min_bedrooms: number | null;
  min_bathrooms: number | null;
  min_square_feet: number | null;
  property_types: PropertyType[];
  preferred_locations: string[];
  must_haves: string | null;
  timeframe: string | null;
  first_time_buyer: boolean | null;
};

export type Seller = Tenant & Audit & SoftDelete & {
  contact_id: UUID;
  lead_id: UUID | null;
  agent_id: UUID | null;
  status: SellerStatus;
  desired_price: Money | null;
  motivation: string | null;
  timeframe: string | null;
  listing_agreement_signed_on: DateString | null;
  listing_expires_on: DateString | null;
  commission_rate: number | null;
};

export type Property = Tenant & Audit & SoftDelete & {
  seller_id: UUID | null;
  listing_agent_id: UUID | null;
  mls_number: string | null;
  status: PropertyStatus;
  property_type: PropertyType;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  list_price: Money | null;
  original_list_price: Money | null;
  sold_price: Money | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  lot_size_sqft: number | null;
  year_built: number | null;
  hoa_fee_monthly: Money | null;
  description: string | null;
  features: string[];
  listed_on: DateString | null;
  sold_on: DateString | null;
};

export type Transaction = Tenant & Audit & SoftDelete & {
  name: string;
  property_id: UUID;
  buyer_id: UUID | null;
  seller_id: UUID | null;
  agent_id: UUID | null;
  side: TransactionSide;
  status: TransactionStatus;
  offer_price: Money | null;
  sale_price: Money | null;
  earnest_money: Money | null;
  commission_rate: number | null;
  commission_amount: Money | null;
  contract_date: DateString | null;
  inspection_deadline: DateString | null;
  appraisal_deadline: DateString | null;
  financing_deadline: DateString | null;
  closing_date: DateString | null;
  closed_at: Timestamp | null;
  cancelled_reason: string | null;
};

export type Task = Tenant & Audit & RecordLinks & {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: Timestamp | null;
  completed_at: Timestamp | null;
  assigned_to: UUID | null;
};

export type Note = Tenant & Audit & RecordLinks & {
  body: string;
  is_pinned: boolean;
};

export type FileRecord = Tenant & RecordLinks & {
  bucket_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: FileCategory;
  uploaded_by: UUID | null;
  created_at: Timestamp;
};

export type Appointment = Tenant & Audit & RecordLinks & {
  title: string;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  starts_at: Timestamp;
  ends_at: Timestamp;
  all_day: boolean;
  location: string | null;
  description: string | null;
  reminder_minutes: number | null;
  organizer_id: UUID | null;
};
