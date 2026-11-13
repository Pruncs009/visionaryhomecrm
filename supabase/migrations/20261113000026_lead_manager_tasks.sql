-- Lead Manager follow-up tasks: every new deal also gets 4 tasks for the deal's
-- Lead Manager (campaign name, ARV, rehab estimate, photos link), due a week out.
--   kind           'lm_followup' for these tasks
--   assignee_role  'lead_manager' = the deal's Lead Manager (a name on the deal)
alter table public.tasks
  drop constraint if exists tasks_kind_check,
  drop constraint if exists tasks_assignee_role_check;

alter table public.tasks
  add constraint tasks_kind_check check (kind in ('deal_setup', 'lm_followup')),
  add constraint tasks_assignee_role_check check (assignee_role in ('lead_acquisition', 'lead_manager'));
