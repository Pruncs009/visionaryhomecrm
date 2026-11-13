-- =============================================================================
-- Deal setup checklist: every new deal gets 4 setup tasks (verify price & EMD,
-- managers, deal type & channel, seller profile). They're assigned to the deal's
-- Lead Manager and Acquisition Manager, who are plain names on the deal
-- (transactions.lead_manager / acquisition_manager), not CRM users. So instead
-- of tasks.assigned_to the task records which deal role it belongs to.
--
--   kind           'deal_setup' for the checklist tasks (null for normal tasks)
--   assignee_role  'lead_acquisition' = the deal's Lead + Acquisition Manager
-- =============================================================================

alter table public.tasks
  add column kind          text check (kind in ('deal_setup')),
  add column assignee_role text check (assignee_role in ('lead_acquisition'));

create index tasks_transaction_kind_idx on public.tasks (organization_id, transaction_id, kind)
  where kind is not null;
