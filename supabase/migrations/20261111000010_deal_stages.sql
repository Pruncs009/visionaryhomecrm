-- =============================================================================
-- Deal stages (investor / wholesale pipeline)
--
--   under_contract → under_dispo → under_rehab → A-B / B-C / A-C closing → closed
--   plus off_market and dead
--
-- A-B = we buy from the seller (A → B), B-C = we resell to the end buyer (B → C),
-- A-C = assignment / double close straight from seller to end buyer.
--
-- deal_stage lives next to the existing status column and the two stay in sync
-- (trigger below), so the dashboard, reports and GCI keep working:
--   stage closed   ⇔ status closed     (closed_at stamped)
--   stage dead     ⇔ status cancelled
--   any other stage → status stays active (under_contract if it was closed/cancelled)
-- =============================================================================

create type public.deal_stage as enum (
  'under_contract', 'under_dispo', 'under_rehab',
  'ab_closing', 'bc_closing', 'ac_closing',
  'closed', 'off_market', 'dead'
);

alter table public.transactions
  add column deal_stage public.deal_stage not null default 'under_contract';

-- Existing deals: map from status.
update public.transactions
set deal_stage = case status
  when 'closed' then 'closed'::public.deal_stage
  when 'cancelled' then 'dead'::public.deal_stage
  else 'under_contract'::public.deal_stage
end;

create index transactions_deal_stage_idx on public.transactions (organization_id, deal_stage)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Keep status ⇄ deal_stage consistent. Whichever one the UPDATE changed wins.
-- -----------------------------------------------------------------------------
create or replace function public._sync_deal_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.deal_stage is distinct from old.deal_stage then
    -- Stage drives status.
    if new.deal_stage = 'closed' then
      new.status := 'closed';
      new.closed_at := coalesce(new.closed_at, now());
    elsif new.deal_stage = 'dead' then
      new.status := 'cancelled';
      new.closed_at := null;
    elsif new.status in ('closed', 'cancelled') then
      new.status := 'under_contract';
      new.closed_at := null;
    end if;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    -- Status drives stage (existing transaction form, status dropdown, imports).
    if new.status = 'closed' then
      new.deal_stage := 'closed';
    elsif new.status = 'cancelled' then
      new.deal_stage := 'dead';
    elsif new.deal_stage in ('closed', 'dead') then
      new.deal_stage := 'under_contract';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_sync_deal_stage
  before insert or update of status, deal_stage on public.transactions
  for each row execute function public._sync_deal_stage();

-- -----------------------------------------------------------------------------
-- transaction_list: same columns as before + deal_stage at the end
-- -----------------------------------------------------------------------------
create or replace view public.transaction_list
with (security_invoker = true)
as
select
  t.id,
  t.organization_id,
  t.name,
  t.side,
  t.status,
  t.property_id,
  t.buyer_id,
  t.seller_id,
  t.agent_id,
  t.offer_price,
  t.sale_price,
  t.earnest_money,
  t.commission_rate,
  t.commission_amount,
  t.contract_date,
  t.inspection_deadline,
  t.appraisal_deadline,
  t.financing_deadline,
  t.closing_date,
  t.closed_at,
  t.created_at,
  t.updated_at,
  p.address_line1 as property_address,
  p.city          as property_city,
  p.state         as property_state,
  b.contact_id    as buyer_contact_id,
  bc.full_name    as buyer_name,
  s.contact_id    as seller_contact_id,
  sc.full_name    as seller_name,
  ap.full_name    as agent_name,
  (select min(d) from unnest(array[t.inspection_deadline, t.appraisal_deadline,
                                   t.financing_deadline, t.closing_date]) d
   where d >= current_date) as next_deadline,
  t.deal_stage
from public.transactions t
join public.properties p
  on p.organization_id = t.organization_id and p.id = t.property_id
left join public.buyers b
  on b.organization_id = t.organization_id and b.id = t.buyer_id
left join public.contacts bc
  on bc.organization_id = b.organization_id and bc.id = b.contact_id
left join public.sellers s
  on s.organization_id = t.organization_id and s.id = t.seller_id
left join public.contacts sc
  on sc.organization_id = s.organization_id and sc.id = s.contact_id
left join public.profiles ap
  on ap.id = t.agent_id
where t.deleted_at is null;

-- -----------------------------------------------------------------------------
-- Sidebar counts: one cheap query for all stages.
-- -----------------------------------------------------------------------------
create or replace function public.deal_stage_counts(p_organization_id uuid)
returns table (deal_stage public.deal_stage, deals bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.deal_stage, count(*)
  from public.transactions t
  where t.organization_id = p_organization_id and t.deleted_at is null
  group by t.deal_stage;
$$;

revoke execute on function public.deal_stage_counts from public, anon;
grant execute on function public.deal_stage_counts to authenticated;
