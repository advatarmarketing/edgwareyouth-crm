-- Edgware Youth CRM — the resources bucket (Prompt 9).
--
-- Private, like receipts and attachments. It holds consent forms and
-- safeguarding policies; a public bucket would put both on a guessable
-- URL with no sign-in.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources', 'resources', false, 52428800,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp',
    'text/plain', 'font/ttf', 'font/otf', 'font/woff2',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: resources/<folder id>/<uuid>.<ext>.
--
-- Different from the other two buckets, and deliberately: here the
-- first segment is the FOLDER, not the uploader, because visibility is
-- a property of the folder. That makes can_see_folder() usable
-- directly in the policy, so a person can only fetch a file from a
-- folder they are actually allowed to open — which is the guarantee
-- the attachments bucket could not make.

drop policy if exists "resources: upload" on storage.objects;
create policy "resources: upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources'
    and has_permission('resources.upload')
    and can_see_folder(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "resources: read" on storage.objects;
create policy "resources: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and can_see_folder(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "resources: manage" on storage.objects;
create policy "resources: manage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resources' and has_permission('members.manage'));
