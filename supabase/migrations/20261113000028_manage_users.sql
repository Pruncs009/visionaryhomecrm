-- =============================================================================
-- Manage Users
--   * Admins add teammates (email + default password) straight into their org.
--   * "User" access (role 'agent') sees the deal stages only, plus any of the
--     extra areas an admin ticks: Pipeline Review, KPI Dashboard, Reports, Settings.
--   * New users must choose their own password on first sign-in.
--   * Notifications: @mentions in notes and new chat messages.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Membership access
-- -----------------------------------------------------------------------------
alter table public.memberships
  add column if not exists permissions text[] not null default '{}',
  add column if not exists must_change_password boolean not null default false;

alter table public.memberships drop constraint if exists memberships_permissions_check;
alter table public.memberships add constraint memberships_permissions_check
  check (permissions <@ array['pipeline_review', 'kpi', 'reports', 'settings']::text[]);

-- -----------------------------------------------------------------------------
-- Signup trigger: users created by an admin (app metadata "vho_org") join that
-- org — admin_create_user() adds the membership — instead of getting their own.
-- Only the database / service role can set raw_app_meta_data, so a normal sign-up
-- can't use this to join someone else's org.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  v_org_name  text := nullif(trim(new.raw_user_meta_data ->> 'organization_name'), '');
  v_org_id    uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_full_name);

  if new.raw_app_meta_data ? 'vho_org' then
    return new;
  end if;

  insert into public.organizations (name)
  values (coalesce(v_org_name, v_full_name || '''s Team', 'My Team'))
  returning id into v_org_id;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: create a user with a default password, already confirmed.
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_org         uuid,
  p_email       text,
  p_password    text,
  p_full_name   text,
  p_role        public.member_role,
  p_permissions text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_name  text := nullif(trim(p_full_name), '');
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only admins can add users.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'agent') then
    raise exception 'Choose Admin or User access.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) > 100 then
    raise exception 'Enter the person''s name.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_password, '')) < 6 or char_length(p_password) > 72 then
    raise exception 'The default password must be 6 to 72 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'A user with that email already exists.' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'vho_org', p_org),
    jsonb_build_object('full_name', v_name), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', null, now(), now()
  );

  insert into public.memberships (organization_id, user_id, role, permissions, must_change_password)
  values (
    p_org, v_id, p_role,
    case when p_role = 'agent' then coalesce(p_permissions, '{}') else '{}' end,
    true
  );

  return v_id;
end;
$$;

revoke all on function public.admin_create_user(uuid, text, text, text, public.member_role, text[]) from public, anon;
grant execute on function public.admin_create_user(uuid, text, text, text, public.member_role, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Admin: everyone in the org with sign-in status (reads auth.users).
-- -----------------------------------------------------------------------------
create or replace function public.org_users(p_org uuid)
returns table (
  user_id              uuid,
  full_name            text,
  email                text,
  role                 public.member_role,
  permissions          text[],
  must_change_password boolean,
  last_sign_in_at      timestamptz,
  created_at           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.full_name, p.email, m.role, m.permissions, m.must_change_password,
         u.last_sign_in_at, m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
    and public.has_org_role(p_org, array['owner', 'admin']::public.member_role[])
  order by m.created_at;
$$;

revoke all on function public.org_users(uuid) from public, anon;
grant execute on function public.org_users(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Choosing a new password clears "must change password".
-- -----------------------------------------------------------------------------
create or replace function public.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.memberships set must_change_password = false
    where user_id = new.id and must_change_password;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_password_changed on auth.users;
create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row execute function public.clear_must_change_password();

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  actor_id         uuid references public.profiles (id) on delete set null,
  kind             text not null check (kind in ('note_mention', 'message')),
  title            text not null check (char_length(title) between 1 and 200),
  body             text not null default '' check (char_length(body) <= 300),
  link             text check (link is null or link like '/%'),
  created_at       timestamptz not null default now(),
  read_at          timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "Users see their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- Teammates can notify each other (e.g. an @mention), never themselves.
create policy "Members can notify teammates"
  on public.notifications for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and user_id <> (select auth.uid())
    and public.is_org_member(organization_id)
    and public.is_user_in_org(organization_id, user_id)
  );

create policy "Users mark their own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users clear their own notifications"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- A new chat message notifies the recipient.
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_name
  from public.profiles p where p.id = new.sender_id;

  insert into public.notifications (organization_id, user_id, actor_id, kind, title, body)
  values (
    new.organization_id, new.recipient_id, new.sender_id, 'message',
    left('New message from ' || coalesce(v_name, 'a teammate'), 200),
    left(case when nullif(trim(new.body), '') is not null then new.body
              else 'Sent an attachment' end, 300)
  );
  return new;
end;
$$;

drop trigger if exists direct_messages_notify on public.direct_messages;
create trigger direct_messages_notify
  after insert on public.direct_messages
  for each row execute function public.notify_direct_message();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
