-- =============================================================================
-- Lead pipeline: 10 stages + manual ordering inside each stage
--
-- Old stages → new:
--   new        → new
--   (added)    → attempting_contact
--   contacted  → contacted
--   nurturing  → nurturing
--   qualified  → qualified
--   (added)    → appointment_set, active_client, under_contract
--   converted  → closed_won   (RENAME: existing rows, the converted_at CHECK
--   lost       → closed_lost   constraint and indexes follow automatically)
--
-- converted_at keeps its name; it now means "date the lead was won".
-- NOTE: ALTER TYPE ... ADD VALUE can't be *used* in the same transaction, so
-- nothing below references the four new values.
-- =============================================================================

alter type public.lead_status rename value 'converted' to 'closed_won';
alter type public.lead_status rename value 'lost' to 'closed_lost';
alter type public.lead_status add value if not exists 'attempting_contact' after 'new';
alter type public.lead_status add value if not exists 'appointment_set' after 'qualified';
alter type public.lead_status add value if not exists 'active_client' after 'appointment_set';
alter type public.lead_status add value if not exists 'under_contract' after 'active_client';

-- -----------------------------------------------------------------------------
-- Order inside a stage. Fractional positions: a move only rewrites the moved
-- card (new position = midpoint of its new neighbours). Lower = higher up.
-- Newest leads land at the top: default = -(seconds since epoch).
-- -----------------------------------------------------------------------------
alter table public.leads
  add column pipeline_position double precision not null default (-extract(epoch from now()));

update public.leads set pipeline_position = -extract(epoch from created_at);

create index leads_pipeline_idx on public.leads (organization_id, status, pipeline_position)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Keep lead_list in sync (new column appended at the end, as CREATE OR REPLACE
-- VIEW requires).
-- -----------------------------------------------------------------------------
create or replace view public.lead_list
with (security_invoker = true)
as
select
  l.id,
  l.organization_id,
  l.contact_id,
  l.assigned_to,
  l.status,
  l.intent,
  l.source,
  l.source_detail,
  l.score,
  l.budget_min,
  l.budget_max,
  l.timeframe,
  l.last_contacted_at,
  l.created_at,
  l.updated_at,
  c.first_name,
  c.last_name,
  c.full_name,
  c.email,
  c.phone,
  p.full_name as assigned_name,
  l.pipeline_position
from public.leads l
join public.contacts c
  on c.organization_id = l.organization_id and c.id = l.contact_id
left join public.profiles p
  on p.id = l.assigned_to
where l.deleted_at is null;

-- -----------------------------------------------------------------------------
-- create_lead_with_contact referenced 'converted' in its body (plpgsql bodies
-- are plain text, so the rename doesn't reach them) — recreate it.
-- -----------------------------------------------------------------------------
create or replace function public.create_lead_with_contact(
  p_organization_id uuid,
  p_first_name      text,
  p_last_name       text default null,
  p_email           text default null,
  p_phone           text default null,
  p_status          public.lead_status default 'new',
  p_intent          public.lead_intent default 'buy',
  p_source          text default null,
  p_source_detail   text default null,
  p_assigned_to     uuid default null,
  p_budget_min      numeric default null,
  p_budget_max      numeric default null,
  p_timeframe       text default null,
  p_message         text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact_id    uuid;
  v_lead_id       uuid;
  v_reused        boolean := false;
  v_email         text := nullif(lower(trim(p_email)), '');
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  if v_email is not null then
    select c.id into v_contact_id
    from public.contacts c
    where c.organization_id = p_organization_id
      and lower(c.email) = v_email
      and c.deleted_at is null
    order by c.created_at
    limit 1;
    v_reused := v_contact_id is not null;
  end if;

  if v_contact_id is null then
    insert into public.contacts (organization_id, owner_id, first_name, last_name, email, phone, source)
    values (
      p_organization_id, p_assigned_to, trim(p_first_name), nullif(trim(p_last_name), ''),
      v_email, nullif(trim(p_phone), ''), p_source
    )
    returning id into v_contact_id;
  end if;

  insert into public.leads (
    organization_id, contact_id, assigned_to, status, intent, source, source_detail,
    budget_min, budget_max, timeframe, message, converted_at
  )
  values (
    p_organization_id, v_contact_id, p_assigned_to, p_status, p_intent, p_source,
    nullif(trim(p_source_detail), ''), p_budget_min, p_budget_max, p_timeframe,
    nullif(trim(p_message), ''),
    case when p_status = 'closed_won' then now() end
  )
  returning id into v_lead_id;

  return jsonb_build_object('lead_id', v_lead_id, 'contact_id', v_contact_id, 'contact_reused', v_reused);
end;
$$;
