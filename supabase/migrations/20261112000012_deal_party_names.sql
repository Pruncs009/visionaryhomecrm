-- =============================================================================
-- Free-text buyer / seller names on a deal
--
-- The deal form now takes typed names instead of picking contacts. The typed
-- name wins; deals that only have a linked contact keep showing its name.
-- =============================================================================

alter table public.transactions
  add column buyer_name  text check (char_length(buyer_name) <= 200),
  add column seller_name text check (char_length(seller_name) <= 200);

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
  coalesce(nullif(t.buyer_name, ''), bc.full_name)  as buyer_name,
  s.contact_id    as seller_contact_id,
  coalesce(nullif(t.seller_name, ''), sc.full_name) as seller_name,
  ap.full_name    as agent_name,
  (select min(d) from unnest(array[t.inspection_deadline, t.appraisal_deadline,
                                   t.financing_deadline, t.closing_date]) d
   where d >= current_date) as next_deadline,
  t.deal_stage,
  t.campaign_name,
  t.deal_type,
  t.purchase_price,
  t.lead_manager,
  t.acquisition_manager
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
