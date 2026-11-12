-- =============================================================================
-- AI Follow-Up
--   leads.ai_*        — latest AI analysis (score lives in the existing leads.score)
--   ai_generations    — audit + usage log of every model call (cost tracking,
--                       per-user rate limiting, "who generated what")
-- =============================================================================

alter table public.leads
  add column ai_temperature  text check (ai_temperature in ('hot', 'warm', 'cold')),
  add column ai_summary      text check (char_length(ai_summary) <= 500),
  add column ai_reasons      jsonb not null default '[]',
  add column ai_suggestions  jsonb not null default '[]',
  add column ai_analyzed_at  timestamptz;

create index leads_score_idx on public.leads (organization_id, score desc nulls last)
  where deleted_at is null;

create table public.ai_generations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  lead_id            uuid,
  user_id            uuid default auth.uid() references public.profiles (id) on delete set null,
  kind               text not null check (kind in ('analysis', 'draft')),
  model              text not null,
  prompt_tokens      integer check (prompt_tokens >= 0),
  completion_tokens  integer check (completion_tokens >= 0),
  status             text not null default 'ok' check (status in ('ok', 'error')),
  error_code         text,
  created_at         timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade
);

-- Rate limiting reads "my calls in the last hour".
create index ai_generations_user_recent_idx on public.ai_generations (user_id, created_at desc);
create index ai_generations_org_recent_idx  on public.ai_generations (organization_id, created_at desc);
create index ai_generations_lead_idx        on public.ai_generations (organization_id, lead_id) where lead_id is not null;

alter table public.ai_generations enable row level security;

create policy "Members can view AI usage"
  on public.ai_generations for select to authenticated
  using (public.is_org_member(organization_id));

-- Users can only log their own calls. No update/delete: it's an audit trail.
create policy "Members log their own AI calls"
  on public.ai_generations for insert to authenticated
  with check (public.is_org_member(organization_id) and user_id = (select auth.uid()));

-- lead_list: expose the AI temperature for badges (appended column).
create or replace view public.lead_list
with (security_invoker = true)
as
select
  l.id, l.organization_id, l.contact_id, l.assigned_to, l.status, l.intent, l.source, l.source_detail,
  l.score, l.budget_min, l.budget_max, l.timeframe, l.last_contacted_at, l.created_at, l.updated_at,
  c.first_name, c.last_name, c.full_name, c.email, c.phone,
  p.full_name as assigned_name,
  l.pipeline_position,
  l.ai_temperature
from public.leads l
join public.contacts c on c.organization_id = l.organization_id and c.id = l.contact_id
left join public.profiles p on p.id = l.assigned_to
where l.deleted_at is null;
