-- =============================================================================
-- Storage bucket for CRM documents (contracts, disclosures, photos...)
-- Object path convention:  <organization_id>/<record-type>/<record-id>/<filename>
-- The first path segment decides who can access the object.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-files', 'crm-files', false, 52428800) -- private, 50 MB per file
on conflict (id) do nothing;

-- True if the caller belongs to the org named by the object's first path segment.
-- Returns false (instead of erroring) for paths that don't start with a UUID.
create or replace function public.can_access_org_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  begin
    v_org_id := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.is_org_member(v_org_id);
end;
$$;

create policy "Members can read their org's CRM files"
  on storage.objects for select to authenticated
  using (bucket_id = 'crm-files' and public.can_access_org_object(name));

create policy "Members can upload to their org's CRM folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-files' and public.can_access_org_object(name));

create policy "Members can update their org's CRM files"
  on storage.objects for update to authenticated
  using (bucket_id = 'crm-files' and public.can_access_org_object(name))
  with check (bucket_id = 'crm-files' and public.can_access_org_object(name));

create policy "Members can delete their org's CRM files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'crm-files' and public.can_access_org_object(name));
