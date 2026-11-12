-- =============================================================================
-- Contacts module
--   activities            — timeline for contacts/leads. Written by TRIGGERS, so
--                           history is complete no matter which code path changed
--                           the data (UI, import, API, SQL editor).
--   contact_tag_counts()  — tags in use + how many contacts have each
--   import_contacts()     — bulk CSV import with de-duplication by email
-- =============================================================================

create type public.activity_type as enum (
  -- automatic (triggers)
  'contact_created', 'contact_imported', 'contact_updated',
  'tag_added', 'tag_removed', 'note_added',
  'lead_created', 'lead_status_changed', 'lead_assigned',
  'task_created', 'task_completed', 'appointment_scheduled',
  -- manual (logged by agents)
  'call', 'email', 'text', 'meeting'
);

create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  contact_id       uuid,
  lead_id          uuid,
  actor_id         uuid references public.profiles (id) on delete set null,
  type             public.activity_type not null,
  summary          text not null check (char_length(summary) between 1 and 2000),
  metadata         jsonb not null default '{}',
  occurred_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, lead_id)    references public.leads    (organization_id, id) on delete cascade
);

create index activities_contact_idx on public.activities (organization_id, contact_id, occurred_at desc) where contact_id is not null;
create index activities_lead_idx    on public.activities (organization_id, lead_id, occurred_at desc)    where lead_id is not null;
create index activities_actor_idx   on public.activities (actor_id);

alter table public.activities enable row level security;

create policy "Members can view activities"
  on public.activities for select to authenticated
  using (public.is_org_member(organization_id));

-- Agents can log calls/emails/texts/meetings themselves. Automatic types are
-- trigger-only, so the timeline can't be forged from the client.
create policy "Members can log manual activities"
  on public.activities for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and actor_id = (select auth.uid())
    and type in ('call', 'email', 'text', 'meeting')
  );

create policy "Authors can delete their manual activities"
  on public.activities for delete to authenticated
  using (actor_id = (select auth.uid()) and type in ('call', 'email', 'text', 'meeting'));

-- -----------------------------------------------------------------------------
-- Internal writer used by the triggers. Not callable by app users.
-- -----------------------------------------------------------------------------
create or replace function public._log_activity(
  p_organization_id uuid, p_contact_id uuid, p_lead_id uuid,
  p_type public.activity_type, p_summary text, p_metadata jsonb default '{}'
)
returns void
language sql
security definer
set search_path = ''
as $$
  -- The EXISTS guards matter during cascading deletes: e.g. deleting an org
  -- nulls contacts.owner_id (an UPDATE that fires the contacts trigger) after
  -- the org row is already gone — logging then would violate the foreign keys.
  insert into public.activities (organization_id, contact_id, lead_id, actor_id, type, summary, metadata)
  select p_organization_id, p_contact_id, p_lead_id, (select auth.uid()), p_type, left(p_summary, 2000), p_metadata
  where exists (select 1 from public.organizations o where o.id = p_organization_id)
    and (p_contact_id is null or exists (select 1 from public.contacts c where c.id = p_contact_id))
    and (p_lead_id is null or exists (select 1 from public.leads l where l.id = p_lead_id));
$$;

revoke execute on function public._log_activity from public, anon, authenticated;

create or replace function public._label(p text)
returns text language sql immutable set search_path = '' as $$
  select initcap(replace(p, '_', ' '));
$$;

-- -----------------------------------------------------------------------------
-- contacts → created / imported / updated / tagged
-- -----------------------------------------------------------------------------
create or replace function public.tg_contacts_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import  boolean := coalesce(current_setting('app.activity_source', true), '') = 'import';
  v_changed text[] := '{}';
  v_tag     text;
begin
  if tg_op = 'INSERT' then
    perform public._log_activity(new.organization_id, new.id, null,
      case when v_import then 'contact_imported' else 'contact_created' end::public.activity_type,
      case when v_import then 'Imported from CSV' else 'Contact created' end);
    return new;
  end if;

  if new.deleted_at is not null then
    return new; -- soft-deleted contacts disappear from the UI; nothing to show
  end if;

  for v_tag in select unnest(new.tags) except select unnest(old.tags) loop
    perform public._log_activity(new.organization_id, new.id, null, 'tag_added',
      format('Tagged "%s"', v_tag), jsonb_build_object('tag', v_tag));
  end loop;
  for v_tag in select unnest(old.tags) except select unnest(new.tags) loop
    perform public._log_activity(new.organization_id, new.id, null, 'tag_removed',
      format('Removed tag "%s"', v_tag), jsonb_build_object('tag', v_tag));
  end loop;

  if (new.first_name, new.last_name) is distinct from (old.first_name, old.last_name) then v_changed := array_append(v_changed, 'name'); end if;
  if new.email        is distinct from old.email        then v_changed := array_append(v_changed, 'email'); end if;
  if (new.phone, new.mobile_phone) is distinct from (old.phone, old.mobile_phone) then v_changed := array_append(v_changed, 'phone'); end if;
  if (new.company, new.job_title) is distinct from (old.company, old.job_title) then v_changed := array_append(v_changed, 'company'); end if;
  if (new.address_line1, new.address_line2, new.city, new.state, new.postal_code)
     is distinct from (old.address_line1, old.address_line2, old.city, old.state, old.postal_code)
     then v_changed := array_append(v_changed, 'address'); end if;
  if new.owner_id     is distinct from old.owner_id     then v_changed := array_append(v_changed, 'owner'); end if;
  if new.do_not_contact is distinct from old.do_not_contact then v_changed := array_append(v_changed, 'do-not-contact'); end if;

  if cardinality(v_changed) > 0 then
    perform public._log_activity(new.organization_id, new.id, null, 'contact_updated',
      case when v_import then 'Updated from CSV import: ' else 'Updated ' end || array_to_string(v_changed, ', '),
      jsonb_build_object('fields', to_jsonb(v_changed)));
  end if;
  return new;
end;
$$;

create trigger contacts_activity after insert or update on public.contacts
  for each row execute function public.tg_contacts_activity();

-- -----------------------------------------------------------------------------
-- notes → note_added (on the contact, also when the note is on one of its leads)
-- -----------------------------------------------------------------------------
create or replace function public.tg_notes_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid := new.contact_id;
begin
  if v_contact is null and new.lead_id is not null then
    select l.contact_id into v_contact from public.leads l where l.id = new.lead_id;
  end if;
  if v_contact is not null or new.lead_id is not null then
    perform public._log_activity(new.organization_id, v_contact, new.lead_id, 'note_added',
      left(regexp_replace(new.body, '\s+', ' ', 'g'), 200), jsonb_build_object('note_id', new.id));
  end if;
  return new;
end;
$$;

create trigger notes_activity after insert on public.notes
  for each row execute function public.tg_notes_activity();

-- -----------------------------------------------------------------------------
-- leads → created / status changed / assigned
-- -----------------------------------------------------------------------------
create or replace function public.tg_leads_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    perform public._log_activity(new.organization_id, new.contact_id, new.id, 'lead_created',
      'New lead' || coalesce(' from ' || public._label(new.source), ''));
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public._log_activity(new.organization_id, new.contact_id, new.id, 'lead_status_changed',
      format('Lead status: %s → %s', public._label(old.status::text), public._label(new.status::text)),
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    select coalesce(p.full_name, p.email) into v_name from public.profiles p where p.id = new.assigned_to;
    perform public._log_activity(new.organization_id, new.contact_id, new.id, 'lead_assigned',
      case when new.assigned_to is null then 'Lead unassigned' else 'Lead assigned to ' || coalesce(v_name, 'a teammate') end,
      jsonb_build_object('assigned_to', new.assigned_to));
  end if;
  return new;
end;
$$;

create trigger leads_activity after insert or update on public.leads
  for each row execute function public.tg_leads_activity();

-- -----------------------------------------------------------------------------
-- tasks / appointments linked to a contact
-- -----------------------------------------------------------------------------
create or replace function public.tg_tasks_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is null and new.lead_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public._log_activity(new.organization_id, new.contact_id, new.lead_id, 'task_created',
      'Task created: ' || new.title, jsonb_build_object('task_id', new.id));
  elsif new.status = 'done' and old.status is distinct from 'done' then
    perform public._log_activity(new.organization_id, new.contact_id, new.lead_id, 'task_completed',
      'Task completed: ' || new.title, jsonb_build_object('task_id', new.id));
  end if;
  return new;
end;
$$;

create trigger tasks_activity after insert or update of status on public.tasks
  for each row execute function public.tg_tasks_activity();

create or replace function public.tg_appointments_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is not null or new.lead_id is not null then
    perform public._log_activity(new.organization_id, new.contact_id, new.lead_id, 'appointment_scheduled',
      public._label(new.appointment_type::text) || ': ' || new.title,
      jsonb_build_object('appointment_id', new.id, 'starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

create trigger appointments_activity after insert on public.appointments
  for each row execute function public.tg_appointments_activity();

-- -----------------------------------------------------------------------------
-- Tags in use
-- -----------------------------------------------------------------------------
create or replace function public.contact_tag_counts(p_organization_id uuid)
returns table (tag text, contacts bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.tag, count(*) as contacts
  from public.contacts c
  cross join lateral unnest(c.tags) as t(tag)
  where c.organization_id = p_organization_id
    and c.deleted_at is null
  group by t.tag
  order by count(*) desc, t.tag;
$$;

grant execute on function public.contact_tag_counts to authenticated;

-- Contact search: phone + company "contains" (name and email already indexed).
create index contacts_phone_trgm_idx   on public.contacts using gin (phone extensions.gin_trgm_ops);
create index contacts_company_trgm_idx on public.contacts using gin (company extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- import_contacts — one batch (≤ 1000 rows) per call; the UI sends batches.
-- Each row runs in its own sub-transaction: a bad row is reported, not fatal.
-- Rows: [{ "_line": 2, "first_name": "...", "last_name": "...", "email": "...",
--          "phone": "...", "company": "...", "address_line1": "...", "city": "...",
--          "state": "...", "postal_code": "...", "source": "...", "tags": ["..."] }]
-- -----------------------------------------------------------------------------
create or replace function public.import_contacts(
  p_organization_id uuid,
  p_rows            jsonb,
  p_on_duplicate    text default 'skip',
  p_tags            text[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row       jsonb;
  v_index     int := 0;
  v_line      int;
  v_inserted  int := 0;
  v_updated   int := 0;
  v_skipped   int := 0;
  v_errors    jsonb := '[]';
  v_first     text;
  v_email     text;
  v_tags      text[];
  v_existing  uuid;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'at most 1000 rows per batch' using errcode = '22023';
  end if;
  if p_on_duplicate not in ('skip', 'update') then
    raise exception 'p_on_duplicate must be skip or update' using errcode = '22023';
  end if;

  -- Tells the contacts trigger to log "Imported from CSV" (transaction-local).
  perform set_config('app.activity_source', 'import', true);

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_line  := coalesce((v_row ->> '_line')::int, v_index);
    begin
      v_first := nullif(trim(v_row ->> 'first_name'), '');
      v_email := nullif(lower(trim(v_row ->> 'email')), '');
      v_tags  := array(
        select distinct t from (
          select trim(x) as t from jsonb_array_elements_text(coalesce(v_row -> 'tags', '[]')) x
          union all
          select trim(x) from unnest(p_tags) x
        ) s where t <> '' and char_length(t) <= 50
      );

      if v_first is null then
        v_errors := v_errors || jsonb_build_object('line', v_line, 'message', 'Missing first name');
        continue;
      end if;

      v_existing := null;
      if v_email is not null then
        select c.id into v_existing
        from public.contacts c
        where c.organization_id = p_organization_id and lower(c.email) = v_email and c.deleted_at is null
        order by c.created_at
        limit 1;
      end if;

      if v_existing is not null then
        if p_on_duplicate = 'skip' then
          v_skipped := v_skipped + 1;
          continue;
        end if;
        -- Fill in blanks / overwrite with non-empty CSV values; never erase data.
        update public.contacts c set
          last_name     = coalesce(nullif(trim(v_row ->> 'last_name'), ''), c.last_name),
          phone         = coalesce(nullif(trim(v_row ->> 'phone'), ''), c.phone),
          company       = coalesce(nullif(trim(v_row ->> 'company'), ''), c.company),
          address_line1 = coalesce(nullif(trim(v_row ->> 'address_line1'), ''), c.address_line1),
          city          = coalesce(nullif(trim(v_row ->> 'city'), ''), c.city),
          state         = coalesce(nullif(trim(v_row ->> 'state'), ''), c.state),
          postal_code   = coalesce(nullif(trim(v_row ->> 'postal_code'), ''), c.postal_code),
          source        = coalesce(c.source, nullif(trim(v_row ->> 'source'), '')),
          tags          = array(select distinct t from unnest(c.tags || v_tags) t)
        where c.id = v_existing;
        v_updated := v_updated + 1;
      else
        insert into public.contacts (
          organization_id, first_name, last_name, email, phone, company,
          address_line1, city, state, postal_code, source, tags
        ) values (
          p_organization_id, v_first,
          nullif(trim(v_row ->> 'last_name'), ''), v_email,
          nullif(trim(v_row ->> 'phone'), ''), nullif(trim(v_row ->> 'company'), ''),
          nullif(trim(v_row ->> 'address_line1'), ''), nullif(trim(v_row ->> 'city'), ''),
          nullif(trim(v_row ->> 'state'), ''), nullif(trim(v_row ->> 'postal_code'), ''),
          nullif(trim(v_row ->> 'source'), ''), v_tags
        );
        v_inserted := v_inserted + 1;
      end if;
    exception
      when check_violation then
        v_errors := v_errors || jsonb_build_object('line', v_line, 'message',
          case when sqlerrm like '%email%' then 'Invalid email address'
               when sqlerrm like '%first_name%' then 'First name is too long'
               else 'Invalid value' end);
      when others then
        v_errors := v_errors || jsonb_build_object('line', v_line, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped, 'errors', v_errors
  );
end;
$$;

revoke execute on function public.import_contacts from public, anon;
grant execute on function public.import_contacts to authenticated;
