-- =============================================================================
-- Team chat: one-to-one messages between people in the same organization,
-- with pictures and file attachments (stored in the private "chat-files" bucket).
-- =============================================================================

-- True if the given user belongs to the org (SECURITY DEFINER: reads memberships
-- without memberships' own RLS).
create or replace function public.is_user_in_org(org_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id and m.user_id = uid
  );
$$;

create table public.direct_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  recipient_id     uuid not null references public.profiles (id) on delete cascade,
  body             text not null default '' check (char_length(body) <= 5000),
  -- [{ "path": "<org>/chat/<sender>/<uuid>/<file>", "name": "...", "type": "image/png", "size": 1234 }]
  attachments      jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  created_at       timestamptz not null default now(),
  read_at          timestamptz,
  check (sender_id <> recipient_id),
  check (char_length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0)
);

create index direct_messages_pair_idx on public.direct_messages (organization_id, sender_id, recipient_id, created_at desc);
create index direct_messages_unread_idx on public.direct_messages (recipient_id, read_at) where read_at is null;

alter table public.direct_messages enable row level security;

-- Only the two people in a conversation can see it.
create policy "Participants can read their messages"
  on public.direct_messages for select to authenticated
  using (
    (select auth.uid()) in (sender_id, recipient_id)
    and public.is_org_member(organization_id)
  );

-- You can only send as yourself, to someone in your organization.
create policy "Members can send messages to teammates"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_org_member(organization_id)
    and public.is_user_in_org(organization_id, recipient_id)
  );

-- The recipient can mark a message as read (and nothing else: see the column grant below).
create policy "Recipients can mark messages read"
  on public.direct_messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

revoke update on public.direct_messages from authenticated;
grant update (read_at) on public.direct_messages to authenticated;

-- Live updates (new messages appear without refreshing).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attachments: private bucket. Path: <organization_id>/chat/<sender_id>/<uuid>/<filename>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400) -- 25 MB per file
on conflict (id) do nothing;

-- Upload only into your own folder of your own org.
create policy "Members can upload chat files to their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and split_part(name, '/', 2) = 'chat'
    and split_part(name, '/', 3) = (select auth.uid())::text
    and public.can_access_org_object(name)
  );

-- Read your own uploads, and files attached to messages you sent or received.
create policy "Participants can read chat files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-files'
    and public.can_access_org_object(name)
    and (
      split_part(name, '/', 3) = (select auth.uid())::text
      or exists (
        select 1 from public.direct_messages m
        where m.attachments @> jsonb_build_array(jsonb_build_object('path', name))
          and (select auth.uid()) in (m.sender_id, m.recipient_id)
      )
    )
  );
