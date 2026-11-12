-- =============================================================================
-- Transactions module
--   transaction_list  — flat view: deal + property + buyer/seller names + agent
--   save_transaction  — create/update a deal in ONE transaction, creating the
--                       property and the buyer/seller profiles when needed
-- Documents use the existing public.files table + 'crm-files' storage bucket.
-- =============================================================================

-- Dates must make sense: you can't close before you go under contract.
alter table public.transactions
  add constraint transactions_closing_after_contract
  check (closing_date is null or contract_date is null or closing_date >= contract_date);

create index transactions_contract_idx on public.transactions (organization_id, contract_date)
  where contract_date is not null;

-- -----------------------------------------------------------------------------
-- transaction_list (security_invoker → RLS of every joined table applies)
-- -----------------------------------------------------------------------------
create view public.transaction_list
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
  -- next upcoming deadline (for "what's due" sorting)
  (select min(d) from unnest(array[t.inspection_deadline, t.appraisal_deadline,
                                   t.financing_deadline, t.closing_date]) d
   where d >= current_date) as next_deadline
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

grant select on public.transaction_list to authenticated;

-- -----------------------------------------------------------------------------
-- save_transaction
-- p_transaction_id NULL → create; otherwise update that deal.
-- Property: pass p_property_id, OR p_new_property {address_line1, city, state,
--   postal_code, list_price} to create one.
-- Buyer/seller: pass a CONTACT id; the matching buyers/sellers profile is
--   reused or created (one contact can be a buyer in many deals).
-- -----------------------------------------------------------------------------
create or replace function public.save_transaction(
  p_organization_id     uuid,
  p_transaction_id      uuid,
  p_name                text,
  p_side                public.transaction_side,
  p_status              public.transaction_status,
  p_property_id         uuid,
  p_new_property        jsonb,
  p_buyer_contact_id    uuid,
  p_seller_contact_id   uuid,
  p_agent_id            uuid,
  p_offer_price         numeric,
  p_sale_price          numeric,
  p_earnest_money       numeric,
  p_commission_rate     numeric,
  p_commission_amount   numeric,
  p_contract_date       date,
  p_inspection_deadline date,
  p_appraisal_deadline  date,
  p_financing_deadline  date,
  p_closing_date        date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_property uuid := p_property_id;
  v_buyer    uuid;
  v_seller   uuid;
  v_id       uuid := p_transaction_id;
  v_closed   timestamptz;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  -- Property: existing or new
  if v_property is null then
    if p_new_property is null or nullif(trim(p_new_property ->> 'address_line1'), '') is null then
      raise exception 'a property is required' using errcode = '23502';
    end if;
    insert into public.properties (organization_id, listing_agent_id, status, address_line1, city, state, postal_code, list_price)
    values (
      p_organization_id, p_agent_id, 'pending',
      trim(p_new_property ->> 'address_line1'),
      coalesce(nullif(trim(p_new_property ->> 'city'), ''), 'Unknown'),
      coalesce(nullif(trim(p_new_property ->> 'state'), ''), '--'),
      coalesce(nullif(trim(p_new_property ->> 'postal_code'), ''), '00000'),
      nullif(p_new_property ->> 'list_price', '')::numeric
    )
    returning id into v_property;
  end if;

  -- Buyer / seller profiles for the chosen contacts (composite FKs reject
  -- contacts from another organization).
  if p_buyer_contact_id is not null then
    select b.id into v_buyer from public.buyers b
    where b.organization_id = p_organization_id and b.contact_id = p_buyer_contact_id and b.deleted_at is null
    order by b.created_at limit 1;
    if v_buyer is null then
      insert into public.buyers (organization_id, contact_id, agent_id, status)
      values (p_organization_id, p_buyer_contact_id, p_agent_id, 'under_contract')
      returning id into v_buyer;
    end if;
  end if;

  if p_seller_contact_id is not null then
    select s.id into v_seller from public.sellers s
    where s.organization_id = p_organization_id and s.contact_id = p_seller_contact_id and s.deleted_at is null
    order by s.created_at limit 1;
    if v_seller is null then
      insert into public.sellers (organization_id, contact_id, agent_id, status)
      values (p_organization_id, p_seller_contact_id, p_agent_id, 'under_contract')
      returning id into v_seller;
    end if;
  end if;

  if v_id is null then
    insert into public.transactions (
      organization_id, name, side, status, property_id, buyer_id, seller_id, agent_id,
      offer_price, sale_price, earnest_money, commission_rate, commission_amount,
      contract_date, inspection_deadline, appraisal_deadline, financing_deadline, closing_date, closed_at
    ) values (
      p_organization_id, trim(p_name), p_side, p_status, v_property, v_buyer, v_seller, p_agent_id,
      p_offer_price, p_sale_price, p_earnest_money, p_commission_rate, p_commission_amount,
      p_contract_date, p_inspection_deadline, p_appraisal_deadline, p_financing_deadline, p_closing_date,
      case when p_status = 'closed' then now() end
    )
    returning id into v_id;
  else
    select t.closed_at into v_closed from public.transactions t
    where t.id = v_id and t.organization_id = p_organization_id and t.deleted_at is null;
    if not found then
      raise exception 'transaction not found' using errcode = 'P0002';
    end if;
    update public.transactions t set
      name = trim(p_name), side = p_side, status = p_status, property_id = v_property,
      buyer_id = v_buyer, seller_id = v_seller, agent_id = p_agent_id,
      offer_price = p_offer_price, sale_price = p_sale_price, earnest_money = p_earnest_money,
      commission_rate = p_commission_rate, commission_amount = p_commission_amount,
      contract_date = p_contract_date, inspection_deadline = p_inspection_deadline,
      appraisal_deadline = p_appraisal_deadline, financing_deadline = p_financing_deadline,
      closing_date = p_closing_date,
      closed_at = case when p_status = 'closed' then coalesce(v_closed, now()) end
    where t.id = v_id and t.organization_id = p_organization_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_transaction from public, anon;
grant execute on function public.save_transaction to authenticated;
