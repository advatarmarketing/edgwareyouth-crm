-- Edgware Youth CRM — the message attachments bucket (Prompt 8).
--
-- Private, like receipts. A public bucket would put every photo shared
-- in a team channel on a guessable URL with no sign-in, which for an
-- organisation working with under-18s is not a trade worth making for
-- slightly simpler code.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 26214400,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: attachments/<uploader id>/<uuid>.<ext>, same convention
-- as receipts, so the first segment is the owner and the policies stay
-- readable.

drop policy if exists "attachments: upload own" on storage.objects;
create policy "attachments: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/**
 * Reading is granted to any active member.
 *
 * Narrower would be better — ideally you could only fetch a file
 * attached to a message you can see — but the object path carries no
 * channel, so that test cannot be written here without denormalising
 * the channel into the path and trusting it. Since every signed-in
 * person is staff, an unguessable UUID path plus a sign-in wall is the
 * honest boundary, and it is stated rather than implied.
 */
drop policy if exists "attachments: read" on storage.objects;
create policy "attachments: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and is_active_member());

drop policy if exists "attachments: replace own" on storage.objects;
create policy "attachments: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
