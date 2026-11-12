-- =============================================================================
-- Core CRM schema
--   contacts      — every person (the hub; leads/buyers/sellers are roles on a contact)
--   leads         — inbound inquiries / opportunities, tied to a contact
--   buyers        — buyer profile + search criteria for a contact
--   sellers       — seller profile + listing agreement for a contact
--   properties    — listings and properties of interest
--   transactions  — deals from contract to close
--   tasks, notes, files, appointments — attach to any of the records above
--
-- "users" = auth.users (managed by Supabase Auth) + public.profiles (migration 1),
-- extended below with agent fields.
--
-- Multi-tenant integrity rules used throughout:
--   * Every table has organization_id and RLS via public.is_org_member().
--   * Every parent has UNIQUE (organization_id, id); children reference it with a
--     COMPOSITE foreign key (organization_id, <x>_id). The database itself then
--     refuses to link a record to another organization's record.
--   * User assignments (owner_id, assigned_to, agent_id...) reference
--     memberships (organization_id, user_id), so you can only assign someone who
--     belongs to the same organization. Removing a member un-assigns their records.
--   * ON DELETE SET NULL (col) (Postgres 15+) nulls only the link column, never
--     organization_id.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.contact_method     as enum ('email', 'phone', 'text');
create type public.lead_status        as enum ('new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost');
create type public.lead_intent        as enum ('buy', 'sell', 'buy_and_sell', 'rent', 'invest');
create type public.buyer_status       as enum ('active', 'under_contract', 'closed', 'inactive');
create type public.seller_status      as enum ('prospect', 'listed', 'under_contract', 'sold', 'inactive');
create type public.property_status    as enum ('off_market', 'coming_soon', 'active', 'pending', 'sold', 'withdrawn', 'expired');
create type public.property_type      as enum ('single_family', 'condo', 'townhouse', 'multi_family', 'land', 'commercial', 'manufactured', 'other');
create type public.transaction_side   as enum ('buyer', 'seller', 'dual');
create type public.transaction_status as enum ('pre_contract', 'under_contract', 'pending', 'closed', 'cancelled');
create type public.task_status        as enum ('todo', 'in_progress', 'done', 'cancelled');
create type public.task_priority      as enum ('low', 'normal', 'high', 'urgent');
create type public.appointment_type   as enum ('showing', 'listing_presentation', 'buyer_consultation', 'open_house', 'inspection', 'appraisal', 'closing', 'call', 'meeting', 'other');
create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type public.file_category      as enum ('contract', 'disclosure', 'addendum', 'inspection', 'appraisal', 'photo', 'id_document', 'other');

-- -----------------------------------------------------------------------------
-- users: extend profiles with agent fields
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column title          text,
  add column license_number text,
  add column timezone       text not null default 'America/New_York';

-- -----------------------------------------------------------------------------
-- contacts
-- -----------------------------------------------------------------------------
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  owner_id         uuid,
  first_name       text not null check (char_length(first_name) between 1 and 100),
  last_name        text check (char_length(last_name) <= 100),
  full_name        text generated always as (trim(first_name || ' ' || coalesce(last_name, ''))) stored,
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text,
  mobile_phone     text,
  company          text,
  job_title        text,
  address_line1    text,
  address_line2    text,
  city             text,
  state            text,
  postal_code      text,
  country          text not null default 'US',
  birthday         date,
  source           text,
  tags             text[] not null default '{}',
  preferred_contact_method public.contact_method,
  do_not_contact   boolean not null default false,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, owner_id)
    references public.memberships (organization_id, user_id) on delete set null (owner_id)
);

create index contacts_org_idx         on public.contacts (organization_id, created_at desc) where deleted_at is null;
create index contacts_owner_idx       on public.contacts (organization_id, owner_id) where owner_id is not null;
create index contacts_email_idx       on public.contacts (organization_id, lower(email)) where email is not null;
create index contacts_phone_idx       on public.contacts (organization_id, phone) where phone is not null;
create index contacts_tags_idx        on public.contacts using gin (tags);
create index contacts_name_trgm_idx   on public.contacts using gin (full_name extensions.gin_trgm_ops);
create index contacts_created_by_idx  on public.contacts (created_by);

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  contact_id         uuid not null,
  assigned_to        uuid,
  status             public.lead_status not null default 'new',
  intent             public.lead_intent not null default 'buy',
  source             text,               -- 'zillow', 'website', 'referral', 'open_house'...
  source_detail      text,
  score              smallint check (score between 0 and 100),
  budget_min         numeric(14, 2) check (budget_min >= 0),
  budget_max         numeric(14, 2) check (budget_max >= 0),
  timeframe          text,               -- '0-3 months', '3-6 months'...
  message            text,
  last_contacted_at  timestamptz,
  converted_at       timestamptz,
  lost_reason        text,
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (organization_id, id),
  check (budget_min is null or budget_max is null or budget_max >= budget_min),
  check ((status = 'converted') = (converted_at is not null)),
  foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, assigned_to)
    references public.memberships (organization_id, user_id) on delete set null (assigned_to)
);

create index leads_org_status_idx   on public.leads (organization_id, status, created_at desc) where deleted_at is null;
create index leads_contact_idx      on public.leads (organization_id, contact_id);
create index leads_assigned_idx     on public.leads (organization_id, assigned_to) where assigned_to is not null;
create index leads_source_idx       on public.leads (organization_id, source);
create index leads_created_by_idx   on public.leads (created_by);

-- -----------------------------------------------------------------------------
-- buyers
-- -----------------------------------------------------------------------------
create table public.buyers (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  contact_id            uuid not null,
  lead_id               uuid,
  agent_id              uuid,
  status                public.buyer_status not null default 'active',
  pre_approved          boolean not null default false,
  pre_approval_amount   numeric(14, 2) check (pre_approval_amount >= 0),
  pre_approval_expires_on date,
  lender_name           text,
  min_price             numeric(14, 2) check (min_price >= 0),
  max_price             numeric(14, 2) check (max_price >= 0),
  min_bedrooms          smallint check (min_bedrooms >= 0),
  min_bathrooms         numeric(3, 1) check (min_bathrooms >= 0),
  min_square_feet       integer check (min_square_feet >= 0),
  property_types        public.property_type[] not null default '{}',
  preferred_locations   text[] not null default '{}',
  must_haves            text,
  timeframe             text,
  first_time_buyer      boolean,
  created_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (organization_id, id),
  check (min_price is null or max_price is null or max_price >= min_price),
  foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, lead_id)
    references public.leads (organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, agent_id)
    references public.memberships (organization_id, user_id) on delete set null (agent_id)
);

create index buyers_org_status_idx  on public.buyers (organization_id, status) where deleted_at is null;
create index buyers_contact_idx     on public.buyers (organization_id, contact_id);
create index buyers_lead_idx        on public.buyers (organization_id, lead_id) where lead_id is not null;
create index buyers_agent_idx       on public.buyers (organization_id, agent_id) where agent_id is not null;
create index buyers_price_idx       on public.buyers (organization_id, min_price, max_price);
create index buyers_locations_idx   on public.buyers using gin (preferred_locations);
create index buyers_created_by_idx  on public.buyers (created_by);

-- -----------------------------------------------------------------------------
-- sellers
-- -----------------------------------------------------------------------------
create table public.sellers (
  id                           uuid primary key default gen_random_uuid(),
  organization_id              uuid not null references public.organizations (id) on delete cascade,
  contact_id                   uuid not null,
  lead_id                      uuid,
  agent_id                     uuid,
  status                       public.seller_status not null default 'prospect',
  desired_price                numeric(14, 2) check (desired_price >= 0),
  motivation                   text,
  timeframe                    text,
  listing_agreement_signed_on  date,
  listing_expires_on           date,
  commission_rate              numeric(5, 3) check (commission_rate between 0 and 100),
  created_by                   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  deleted_at                   timestamptz,
  unique (organization_id, id),
  check (listing_expires_on is null or listing_agreement_signed_on is null
         or listing_expires_on >= listing_agreement_signed_on),
  foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, lead_id)
    references public.leads (organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, agent_id)
    references public.memberships (organization_id, user_id) on delete set null (agent_id)
);

create index sellers_org_status_idx   on public.sellers (organization_id, status) where deleted_at is null;
create index sellers_contact_idx      on public.sellers (organization_id, contact_id);
create index sellers_lead_idx         on public.sellers (organization_id, lead_id) where lead_id is not null;
create index sellers_agent_idx        on public.sellers (organization_id, agent_id) where agent_id is not null;
create index sellers_expires_idx      on public.sellers (organization_id, listing_expires_on) where listing_expires_on is not null;
create index sellers_created_by_idx   on public.sellers (created_by);

-- -----------------------------------------------------------------------------
-- properties
-- -----------------------------------------------------------------------------
create table public.properties (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  seller_id            uuid,              -- null for buyer-side properties of interest
  listing_agent_id     uuid,
  mls_number           text,
  status               public.property_status not null default 'off_market',
  property_type        public.property_type not null default 'single_family',
  address_line1        text not null,
  address_line2        text,
  city                 text not null,
  state                text not null,
  postal_code          text not null,
  country              text not null default 'US',
  latitude             numeric(9, 6) check (latitude between -90 and 90),
  longitude            numeric(9, 6) check (longitude between -180 and 180),
  list_price           numeric(14, 2) check (list_price >= 0),
  original_list_price  numeric(14, 2) check (original_list_price >= 0),
  sold_price           numeric(14, 2) check (sold_price >= 0),
  bedrooms             smallint check (bedrooms >= 0),
  bathrooms            numeric(3, 1) check (bathrooms >= 0),
  square_feet          integer check (square_feet >= 0),
  lot_size_sqft        integer check (lot_size_sqft >= 0),
  year_built           smallint check (year_built between 1600 and 2100),
  hoa_fee_monthly      numeric(10, 2) check (hoa_fee_monthly >= 0),
  description          text,
  features             text[] not null default '{}',
  listed_on            date,
  sold_on              date,
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, seller_id)
    references public.sellers (organization_id, id) on delete set null (seller_id),
  foreign key (organization_id, listing_agent_id)
    references public.memberships (organization_id, user_id) on delete set null (listing_agent_id)
);

create unique index properties_mls_unique_idx on public.properties (organization_id, mls_number)
  where mls_number is not null and deleted_at is null;
create index properties_org_status_idx  on public.properties (organization_id, status) where deleted_at is null;
create index properties_seller_idx      on public.properties (organization_id, seller_id) where seller_id is not null;
create index properties_agent_idx       on public.properties (organization_id, listing_agent_id) where listing_agent_id is not null;
create index properties_location_idx    on public.properties (organization_id, city, postal_code);
create index properties_price_idx       on public.properties (organization_id, list_price) where deleted_at is null;
create index properties_address_trgm_idx on public.properties using gin (address_line1 extensions.gin_trgm_ops);
create index properties_created_by_idx  on public.properties (created_by);

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 200),
  property_id          uuid not null,
  buyer_id             uuid,
  seller_id            uuid,
  agent_id             uuid,
  side                 public.transaction_side not null,
  status               public.transaction_status not null default 'pre_contract',
  offer_price          numeric(14, 2) check (offer_price >= 0),
  sale_price           numeric(14, 2) check (sale_price >= 0),
  earnest_money        numeric(14, 2) check (earnest_money >= 0),
  commission_rate      numeric(5, 3) check (commission_rate between 0 and 100),
  commission_amount    numeric(14, 2) check (commission_amount >= 0),
  contract_date        date,
  inspection_deadline  date,
  appraisal_deadline   date,
  financing_deadline   date,
  closing_date         date,
  closed_at            timestamptz,
  cancelled_reason     text,
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (organization_id, id),
  check ((status = 'closed') = (closed_at is not null)),
  -- NO ACTION (default): a property with a deal on it can't be hard-deleted.
  foreign key (organization_id, property_id)
    references public.properties (organization_id, id),
  foreign key (organization_id, buyer_id)
    references public.buyers (organization_id, id) on delete set null (buyer_id),
  foreign key (organization_id, seller_id)
    references public.sellers (organization_id, id) on delete set null (seller_id),
  foreign key (organization_id, agent_id)
    references public.memberships (organization_id, user_id) on delete set null (agent_id)
);

create index transactions_org_status_idx  on public.transactions (organization_id, status) where deleted_at is null;
create index transactions_property_idx    on public.transactions (organization_id, property_id);
create index transactions_buyer_idx       on public.transactions (organization_id, buyer_id) where buyer_id is not null;
create index transactions_seller_idx      on public.transactions (organization_id, seller_id) where seller_id is not null;
create index transactions_agent_idx       on public.transactions (organization_id, agent_id) where agent_id is not null;
create index transactions_closing_idx     on public.transactions (organization_id, closing_date) where closing_date is not null;
create index transactions_created_by_idx  on public.transactions (created_by);

-- -----------------------------------------------------------------------------
-- tasks — links are SET NULL: deleting a contact keeps its tasks
-- -----------------------------------------------------------------------------
create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  description      text,
  status           public.task_status not null default 'todo',
  priority         public.task_priority not null default 'normal',
  due_at           timestamptz,
  completed_at     timestamptz,
  assigned_to      uuid,
  contact_id       uuid,
  lead_id          uuid,
  buyer_id         uuid,
  seller_id        uuid,
  property_id      uuid,
  transaction_id   uuid,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, assigned_to)    references public.memberships  (organization_id, user_id) on delete set null (assigned_to),
  foreign key (organization_id, contact_id)     references public.contacts     (organization_id, id) on delete set null (contact_id),
  foreign key (organization_id, lead_id)        references public.leads        (organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, buyer_id)       references public.buyers       (organization_id, id) on delete set null (buyer_id),
  foreign key (organization_id, seller_id)      references public.sellers      (organization_id, id) on delete set null (seller_id),
  foreign key (organization_id, property_id)    references public.properties   (organization_id, id) on delete set null (property_id),
  foreign key (organization_id, transaction_id) references public.transactions (organization_id, id) on delete set null (transaction_id)
);

-- "My open tasks" and "overdue" are the hot queries.
create index tasks_assignee_open_idx on public.tasks (organization_id, assigned_to, due_at)
  where status in ('todo', 'in_progress');
create index tasks_org_due_idx       on public.tasks (organization_id, due_at) where status in ('todo', 'in_progress');
create index tasks_contact_idx       on public.tasks (organization_id, contact_id)     where contact_id is not null;
create index tasks_lead_idx          on public.tasks (organization_id, lead_id)        where lead_id is not null;
create index tasks_buyer_idx         on public.tasks (organization_id, buyer_id)       where buyer_id is not null;
create index tasks_seller_idx        on public.tasks (organization_id, seller_id)      where seller_id is not null;
create index tasks_property_idx      on public.tasks (organization_id, property_id)    where property_id is not null;
create index tasks_transaction_idx   on public.tasks (organization_id, transaction_id) where transaction_id is not null;
create index tasks_created_by_idx    on public.tasks (created_by);

-- Keep completed_at in sync with status.
create or replace function public.set_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at before insert or update of status on public.tasks
  for each row execute function public.set_task_completed_at();

-- -----------------------------------------------------------------------------
-- notes — CASCADE: notes die with their record. Must be attached to something.
-- -----------------------------------------------------------------------------
create table public.notes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 20000),
  is_pinned        boolean not null default false,
  contact_id       uuid,
  lead_id          uuid,
  buyer_id         uuid,
  seller_id        uuid,
  property_id      uuid,
  transaction_id   uuid,
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(contact_id, lead_id, buyer_id, seller_id, property_id, transaction_id) >= 1),
  foreign key (organization_id, contact_id)     references public.contacts     (organization_id, id) on delete cascade,
  foreign key (organization_id, lead_id)        references public.leads        (organization_id, id) on delete cascade,
  foreign key (organization_id, buyer_id)       references public.buyers       (organization_id, id) on delete cascade,
  foreign key (organization_id, seller_id)      references public.sellers      (organization_id, id) on delete cascade,
  foreign key (organization_id, property_id)    references public.properties   (organization_id, id) on delete cascade,
  foreign key (organization_id, transaction_id) references public.transactions (organization_id, id) on delete cascade
);

create index notes_contact_idx      on public.notes (organization_id, contact_id, created_at desc)     where contact_id is not null;
create index notes_lead_idx         on public.notes (organization_id, lead_id, created_at desc)        where lead_id is not null;
create index notes_buyer_idx        on public.notes (organization_id, buyer_id, created_at desc)       where buyer_id is not null;
create index notes_seller_idx       on public.notes (organization_id, seller_id, created_at desc)      where seller_id is not null;
create index notes_property_idx     on public.notes (organization_id, property_id, created_at desc)    where property_id is not null;
create index notes_transaction_idx  on public.notes (organization_id, transaction_id, created_at desc) where transaction_id is not null;
create index notes_created_by_idx   on public.notes (created_by);

-- -----------------------------------------------------------------------------
-- files — metadata for objects in Supabase Storage (bucket 'crm-files').
-- storage_path must start with '<organization_id>/' so storage RLS can scope it.
-- -----------------------------------------------------------------------------
create table public.files (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  bucket_id        text not null default 'crm-files',
  storage_path     text not null,
  file_name        text not null check (char_length(file_name) between 1 and 255),
  mime_type        text,
  size_bytes       bigint check (size_bytes >= 0),
  category         public.file_category not null default 'other',
  contact_id       uuid,
  lead_id          uuid,
  buyer_id         uuid,
  seller_id        uuid,
  property_id      uuid,
  transaction_id   uuid,
  uploaded_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (bucket_id, storage_path),
  check (storage_path like organization_id::text || '/%'),
  foreign key (organization_id, contact_id)     references public.contacts     (organization_id, id) on delete cascade,
  foreign key (organization_id, lead_id)        references public.leads        (organization_id, id) on delete cascade,
  foreign key (organization_id, buyer_id)       references public.buyers       (organization_id, id) on delete cascade,
  foreign key (organization_id, seller_id)      references public.sellers      (organization_id, id) on delete cascade,
  foreign key (organization_id, property_id)    references public.properties   (organization_id, id) on delete cascade,
  foreign key (organization_id, transaction_id) references public.transactions (organization_id, id) on delete cascade
);

create index files_contact_idx      on public.files (organization_id, contact_id)     where contact_id is not null;
create index files_lead_idx         on public.files (organization_id, lead_id)        where lead_id is not null;
create index files_buyer_idx        on public.files (organization_id, buyer_id)       where buyer_id is not null;
create index files_seller_idx       on public.files (organization_id, seller_id)      where seller_id is not null;
create index files_property_idx     on public.files (organization_id, property_id)    where property_id is not null;
create index files_transaction_idx  on public.files (organization_id, transaction_id, category) where transaction_id is not null;
create index files_uploaded_by_idx  on public.files (uploaded_by);

-- -----------------------------------------------------------------------------
-- appointments — showings, listing presentations, closings...
-- -----------------------------------------------------------------------------
create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 200),
  appointment_type  public.appointment_type not null default 'meeting',
  status            public.appointment_status not null default 'scheduled',
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  all_day           boolean not null default false,
  location          text,
  description       text,
  reminder_minutes  smallint check (reminder_minutes between 0 and 10080),
  organizer_id      uuid,
  contact_id        uuid,
  lead_id           uuid,
  buyer_id          uuid,
  seller_id         uuid,
  property_id       uuid,
  transaction_id    uuid,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at >= starts_at),
  foreign key (organization_id, organizer_id)   references public.memberships  (organization_id, user_id) on delete set null (organizer_id),
  foreign key (organization_id, contact_id)     references public.contacts     (organization_id, id) on delete set null (contact_id),
  foreign key (organization_id, lead_id)        references public.leads        (organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, buyer_id)       references public.buyers       (organization_id, id) on delete set null (buyer_id),
  foreign key (organization_id, seller_id)      references public.sellers      (organization_id, id) on delete set null (seller_id),
  foreign key (organization_id, property_id)    references public.properties   (organization_id, id) on delete set null (property_id),
  foreign key (organization_id, transaction_id) references public.transactions (organization_id, id) on delete set null (transaction_id)
);

-- Calendar range queries: WHERE organization_id = $1 AND starts_at < $end AND ends_at > $start
create index appointments_org_range_idx   on public.appointments (organization_id, starts_at, ends_at);
create index appointments_organizer_idx   on public.appointments (organization_id, organizer_id, starts_at) where organizer_id is not null;
create index appointments_contact_idx     on public.appointments (organization_id, contact_id)     where contact_id is not null;
create index appointments_lead_idx        on public.appointments (organization_id, lead_id)        where lead_id is not null;
create index appointments_buyer_idx       on public.appointments (organization_id, buyer_id)       where buyer_id is not null;
create index appointments_seller_idx      on public.appointments (organization_id, seller_id)      where seller_id is not null;
create index appointments_property_idx    on public.appointments (organization_id, property_id)    where property_id is not null;
create index appointments_transaction_idx on public.appointments (organization_id, transaction_id) where transaction_id is not null;
create index appointments_created_by_idx  on public.appointments (created_by);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'leads', 'buyers', 'sellers', 'properties',
                           'transactions', 'tasks', 'notes', 'appointments']
  loop
    execute format(
      'create trigger %1$s_updated_at before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security — same policy set on every CRM table:
--   read / create / edit: any member of the record's organization
--   delete:               owners, admins and agents (not assistants)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'leads', 'buyers', 'sellers', 'properties',
                           'transactions', 'tasks', 'notes', 'files', 'appointments']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "Members can view %1$s" on public.%1$I
         for select to authenticated
         using (public.is_org_member(organization_id))', t);

    execute format(
      'create policy "Members can create %1$s" on public.%1$I
         for insert to authenticated
         with check (public.is_org_member(organization_id))', t);

    execute format(
      'create policy "Members can update %1$s" on public.%1$I
         for update to authenticated
         using (public.is_org_member(organization_id))
         with check (public.is_org_member(organization_id))', t);

    execute format(
      'create policy "Agents and above can delete %1$s" on public.%1$I
         for delete to authenticated
         using (public.has_org_role(organization_id,
                array[''owner'', ''admin'', ''agent'']::public.member_role[]))', t);
  end loop;
end;
$$;
