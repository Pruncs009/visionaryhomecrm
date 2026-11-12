-- =============================================================================
-- People on a deal, added from the deal page's People panel
--
--   clients:        buyer, buyer_2 … buyer_5, seller, seller_2 … seller_5
--   collaborators:  buyer_agent, seller_agent
--
-- Every person is a row in public.contacts (so they can be found again and
-- reused on other deals); deal_parties links a contact to a deal in a role.
-- Each client slot holds one person per deal; agent roles can repeat.
-- The primary buyer / seller also stay in transactions.buyer_name /
-- seller_name (written by the app) so lists and the header keep showing them.
-- =============================================================================

create type public.deal_party_role as enum (
  'buyer', 'buyer_2', 'buyer_3', 'buyer_4', 'buyer_5',
  'seller', 'seller_2', 'seller_3', 'seller_4', 'seller_5',
  'buyer_agent', 'seller_agent'
);

create table public.deal_parties (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_id  uuid not null,
  contact_id      uuid not null,
  role            public.deal_party_role not null,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, transaction_id)
    references public.transactions (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade
);

create unique index deal_parties_client_slot_idx
  on public.deal_parties (transaction_id, role)
  where role not in ('buyer_agent', 'seller_agent');
create unique index deal_parties_agent_once_idx
  on public.deal_parties (transaction_id, role, contact_id)
  where role in ('buyer_agent', 'seller_agent');
create index deal_parties_tx_idx on public.deal_parties (organization_id, transaction_id);
create index deal_parties_contact_idx on public.deal_parties (organization_id, contact_id);
create index deal_parties_created_by_idx on public.deal_parties (created_by);

-- Same policy set as the other CRM tables.
alter table public.deal_parties enable row level security;

create policy "Members can view deal_parties" on public.deal_parties
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "Members can create deal_parties" on public.deal_parties
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy "Members can update deal_parties" on public.deal_parties
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "Agents and above can delete deal_parties" on public.deal_parties
  for delete to authenticated
  using (public.has_org_role(organization_id,
         array['owner', 'admin', 'agent']::public.member_role[]));
