-- =============================================================================
-- Module 1: Authentication & multi-tenant foundation
--   organizations  — a brokerage / team (the tenant)
--   profiles       — 1:1 with auth.users, public user info
--   memberships    — which users belong to which org, with what role
-- Every future table gets organization_id + RLS via is_org_member().
-- =============================================================================

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'agent', 'assistant');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  slug        text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             public.member_role not null default 'agent',
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS helper functions
-- SECURITY DEFINER lets them read memberships without triggering memberships'
-- own RLS policies (which would otherwise recurse infinitely).
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(org_id uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

create or replace function public.shares_org_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Signup trigger: every new auth user gets a profile, their own organization,
-- and an 'owner' membership. Reads full_name / organization_name passed in
-- supabase.auth.signUp({ options: { data: {...} } }).
-- (The Team module will add an invite path that joins an existing org instead.)
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

  insert into public.organizations (name)
  values (coalesce(v_org_name, v_full_name || '''s Team', 'My Team'))
  returning id into v_org_id;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.memberships   enable row level security;

-- organizations: members read; owners/admins update; owners delete.
-- No insert policy: orgs are created only by the signup trigger.
create policy "Members can view their organizations"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

create policy "Owners and admins can update their organization"
  on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.member_role[]));

create policy "Owners can delete their organization"
  on public.organizations for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.member_role[]));

-- profiles: see yourself and teammates; edit only yourself.
create policy "Users can view own and teammates' profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships: members see the roster; owners/admins manage it.
-- (Team module will add guards, e.g. admins cannot demote the owner.)
create policy "Members can view memberships in their orgs"
  on public.memberships for select to authenticated
  using (public.is_org_member(organization_id));

create policy "Owners and admins can add members"
  on public.memberships for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy "Owners and admins can change roles"
  on public.memberships for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy "Owners and admins can remove members; users can leave"
  on public.memberships for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])
  );
