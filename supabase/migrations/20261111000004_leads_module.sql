-- =============================================================================
-- Leads module
--   lead_list                 — flat, searchable view: lead + contact + assignee
--   create_lead_with_contact  — atomic "new lead" (reuses a contact by email)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- lead_list view
-- security_invoker = true (PG15+): the view runs with the CALLER's permissions,
-- so RLS on leads/contacts/profiles still applies. Without it, a view runs as
-- its owner and would bypass RLS — a classic multi-tenant data leak.
-- -----------------------------------------------------------------------------
create view public.lead_list
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
  p.full_name as assigned_name
from public.leads l
join public.contacts c
  on c.organization_id = l.organization_id and c.id = l.contact_id
left join public.profiles p
  on p.id = l.assigned_to
where l.deleted_at is null;

grant select on public.lead_list to authenticated;

-- Search: case-insensitive "contains" on email (name already has a trigram index).
create index contacts_email_trgm_idx on public.contacts using gin (email extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- create_lead_with_contact
-- One transaction: find-or-create the contact, then insert the lead. If the lead
-- insert fails (bad assignee, check constraint...) the contact is rolled back too.
-- SECURITY INVOKER: runs as the caller, so RLS insert policies still apply.
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

  -- Reuse an existing (non-deleted) contact with the same email in this org.
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
      p_organization_id,
      p_assigned_to,
      trim(p_first_name),
      nullif(trim(p_last_name), ''),
      v_email,
      nullif(trim(p_phone), ''),
      p_source
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
    case when p_status = 'converted' then now() end
  )
  returning id into v_lead_id;

  return jsonb_build_object('lead_id', v_lead_id, 'contact_id', v_contact_id, 'contact_reused', v_reused);
end;
$$;

revoke execute on function public.create_lead_with_contact from public, anon;
grant execute on function public.create_lead_with_contact to authenticated;
