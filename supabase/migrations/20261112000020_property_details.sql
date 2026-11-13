-- =============================================================================
-- Property details shown under the address on the deal page. Free text so any
-- format works ("3/2", "0.25 ac", "~$120k", "Alameda County"…).
-- =============================================================================

alter table public.transactions
  add column prop_last_sold_prior text check (char_length(prop_last_sold_prior) <= 200),
  add column prop_seller_age      text check (char_length(prop_seller_age) <= 200),
  add column prop_equity          text check (char_length(prop_equity) <= 200),
  add column prop_stories         text check (char_length(prop_stories) <= 200),
  add column prop_beds            text check (char_length(prop_beds) <= 200),
  add column prop_baths           text check (char_length(prop_baths) <= 200),
  add column prop_bldg_sqft       text check (char_length(prop_bldg_sqft) <= 200),
  add column prop_lot_size        text check (char_length(prop_lot_size) <= 200),
  add column prop_year_built      text check (char_length(prop_year_built) <= 200),
  add column prop_county          text check (char_length(prop_county) <= 200);

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
                                   t.financing_deadline, t.emd_due_date,
                                   t.contingency_end_date, t.closing_date]) d
   where d >= current_date) as next_deadline,
  t.deal_stage,
  t.campaign_name,
  t.deal_type,
  t.purchase_price,
  t.lead_manager,
  t.acquisition_manager,
  t.emd_due_date,
  t.contingency_end_date,
  t.transaction_coordinator,
  t.emd_in,
  t.contingency_type,
  t.escrow_type,
  t.escrow_number,
  t.occupancy_strategy,
  t.lockbox_code,
  t.arv_estimate,
  t.rehab_estimate,
  t.photos_link,
  t.channel,
  t.occupancy,
  t.ownership_type,
  t.ethnicity,
  t.prop_last_sold_prior,
  t.prop_seller_age,
  t.prop_equity,
  t.prop_stories,
  t.prop_beds,
  t.prop_baths,
  t.prop_bldg_sqft,
  t.prop_lot_size,
  t.prop_year_built,
  t.prop_county
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
