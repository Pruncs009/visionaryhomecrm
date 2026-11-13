-- Deleting a task from a deal now keeps it (status 'cancelled') and stamps
-- deleted_at, so the deal Timeline can show when it was deleted. Every task list
-- in the app already skips cancelled tasks.
alter table public.tasks
  add column deleted_at timestamptz;
