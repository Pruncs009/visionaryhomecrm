-- =============================================================================
-- Analytics: one round trip for the Reports dashboard.
--
-- analytics_report(org, from, to, agent?, timezone) → jsonb
--   kpis      leads, won, lost, win_rate (won/(won+lost)), conversion_rate (won/leads),
--             deals_closed, volume, gci
--   sources   leads + won per lead source            (leads created in range)
--   funnel    furthest stage each lead ever REACHED  (uses stage history in activities,
--             so a lead that was Qualified and then lost still counts as Qualified)
--   monthly   last 12 months in the agent's timezone: GCI, volume, closings by side,
--             won / lost decisions (for the closing-rate trend)
--   agents    per-member leads, win rate, closings, volume, GCI (in range)
--
-- One SQL statement (CTEs, no temp tables) → STABLE, no extra privileges needed.
-- SECURITY INVOKER: runs with the caller's RLS, so it only counts rows they can read.
-- GCI = commission_amount, else (sale_price or offer_price) × commission_rate.
-- =============================================================================

create or replace function public.analytics_report(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_agent_id        uuid default null,
  p_timezone        text default 'America/New_York'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_month0 timestamp; -- first month of the 12-month window, local time
  v_result jsonb;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if p_to <= p_from then
    raise exception 'p_to must be after p_from' using errcode = '22023';
  end if;

  v_month0 := date_trunc('month', (p_to - interval '1 microsecond') at time zone p_timezone) - interval '11 months';

  with
  stages(stage, ord) as (
    values ('new', 0), ('attempting_contact', 1), ('contacted', 2), ('nurturing', 3), ('qualified', 4),
           ('appointment_set', 5), ('active_client', 6), ('under_contract', 7), ('closed_won', 8)
  ),
  leads_in as (
    select
      l.id,
      l.status::text as status,
      coalesce(nullif(l.source, ''), 'unknown') as source,
      l.assigned_to,
      greatest(coalesce(cur.ord, 0), coalesce(hist.max_ord, 0)) as max_ord
    from public.leads l
    left join stages cur on cur.stage = l.status::text
    left join lateral (
      select max(s.ord) as max_ord
      from public.activities a
      join stages s on s.stage = a.metadata ->> 'to'
      where a.organization_id = l.organization_id and a.lead_id = l.id and a.type = 'lead_status_changed'
    ) hist on true
    where l.organization_id = p_organization_id
      and l.deleted_at is null
      and l.created_at >= p_from and l.created_at < p_to
      and (p_agent_id is null or l.assigned_to = p_agent_id)
  ),
  closed as (
    select
      t.side::text as side, t.agent_id, t.closed_at,
      date_trunc('month', t.closed_at at time zone p_timezone) as m,
      t.closed_at >= p_from as in_range,
      coalesce(t.sale_price, t.offer_price, 0) as volume,
      coalesce(t.commission_amount, coalesce(t.sale_price, t.offer_price, 0) * coalesce(t.commission_rate, 0) / 100) as gci
    from public.transactions t
    where t.organization_id = p_organization_id
      and t.deleted_at is null
      and t.status = 'closed'
      and t.closed_at >= least(p_from, v_month0 at time zone p_timezone) and t.closed_at < p_to
      and (p_agent_id is null or t.agent_id = p_agent_id)
  ),
  decisions as (
    select date_trunc('month', a.occurred_at at time zone p_timezone) as m, a.metadata ->> 'to' as outcome
    from public.activities a
    join public.leads l on l.organization_id = a.organization_id and l.id = a.lead_id
    where a.organization_id = p_organization_id
      and a.type = 'lead_status_changed'
      and a.metadata ->> 'to' in ('closed_won', 'closed_lost')
      and a.occurred_at >= (v_month0 at time zone p_timezone) and a.occurred_at < p_to
      and (p_agent_id is null or l.assigned_to = p_agent_id)
  ),
  months as (
    select generate_series(v_month0, v_month0 + interval '11 months', interval '1 month') as m
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'leads', (select count(*) from leads_in),
        'won',   (select count(*) from leads_in where status = 'closed_won'),
        'lost',  (select count(*) from leads_in where status = 'closed_lost'),
        'win_rate', (select case when count(*) filter (where status in ('closed_won', 'closed_lost')) = 0 then null
                      else round(count(*) filter (where status = 'closed_won')::numeric
                                 / count(*) filter (where status in ('closed_won', 'closed_lost')), 4) end from leads_in),
        'conversion_rate', (select case when count(*) = 0 then null
                      else round(count(*) filter (where status = 'closed_won')::numeric / count(*), 4) end from leads_in),
        'deals_closed', (select count(*) from closed where in_range),
        'volume', (select coalesce(sum(volume), 0) from closed where in_range),
        'gci',    (select coalesce(round(sum(gci), 2), 0) from closed where in_range)
      )
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'leads', leads, 'won', won) order by leads desc, source), '[]')
      from (select source, count(*) as leads, count(*) filter (where status = 'closed_won') as won from leads_in group by source) s
    ),
    'funnel', (
      select jsonb_build_array(
        jsonb_build_object('stage', 'Leads',           'count', count(*)),
        jsonb_build_object('stage', 'Contacted',       'count', count(*) filter (where max_ord >= 2)),
        jsonb_build_object('stage', 'Qualified',       'count', count(*) filter (where max_ord >= 4)),
        jsonb_build_object('stage', 'Appointment set', 'count', count(*) filter (where max_ord >= 5)),
        jsonb_build_object('stage', 'Under contract',  'count', count(*) filter (where max_ord >= 7)),
        jsonb_build_object('stage', 'Closed won',      'count', count(*) filter (where max_ord >= 8))
      ) from leads_in
    ),
    'monthly', (
      select jsonb_agg(jsonb_build_object(
        'month',  to_char(mo.m, 'YYYY-MM'),
        'gci',    coalesce((select round(sum(c.gci), 2) from closed c where c.m = mo.m), 0),
        'volume', coalesce((select sum(c.volume) from closed c where c.m = mo.m), 0),
        'buyer',  (select count(*) from closed c where c.m = mo.m and c.side = 'buyer'),
        'seller', (select count(*) from closed c where c.m = mo.m and c.side = 'seller'),
        'dual',   (select count(*) from closed c where c.m = mo.m and c.side = 'dual'),
        'won',    (select count(*) from decisions d where d.m = mo.m and d.outcome = 'closed_won'),
        'lost',   (select count(*) from decisions d where d.m = mo.m and d.outcome = 'closed_lost')
      ) order by mo.m)
      from months mo
    ),
    'agents', (
      select coalesce(jsonb_agg(row_to_json(a)::jsonb order by a.gci desc, a.deals_closed desc, a.name), '[]')
      from (
        select
          m.user_id as agent_id,
          coalesce(p.full_name, p.email) as name,
          (select count(*) from leads_in l where l.assigned_to = m.user_id) as leads,
          (select count(*) from leads_in l where l.assigned_to = m.user_id and l.status = 'closed_won') as won,
          (select count(*) from leads_in l where l.assigned_to = m.user_id and l.status = 'closed_lost') as lost,
          (select count(*) from closed c where c.agent_id = m.user_id and c.in_range) as deals_closed,
          (select coalesce(sum(c.volume), 0) from closed c where c.agent_id = m.user_id and c.in_range) as volume,
          (select coalesce(round(sum(c.gci), 2), 0) from closed c where c.agent_id = m.user_id and c.in_range) as gci
        from public.memberships m
        join public.profiles p on p.id = m.user_id
        where m.organization_id = p_organization_id
          and (p_agent_id is null or m.user_id = p_agent_id)
      ) a
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.analytics_report from public, anon;
grant execute on function public.analytics_report to authenticated;

-- Supports the stage-history lookups above.
create index activities_lead_status_idx on public.activities (organization_id, lead_id)
  where type = 'lead_status_changed';
