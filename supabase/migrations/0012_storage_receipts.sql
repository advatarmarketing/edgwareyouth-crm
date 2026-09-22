-- Edgware Youth CRM — the receipts bucket (Prompt 6).
--
-- Its own migration because storage lives in a different schema and a
-- project where this fails should not take the finance tables with it.
--
-- PRIVATE bucket. A public one would mean every receipt — which shows
-- what was bought, where, and often by whom — sat on a guessable URL
-- with no sign-in. Files are served through signed URLs instead.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live at receipts/<user id>/<claim id>.<ext>. The first path
-- segment being the owner's id is what makes the policies below simple
-- and is why uploads must use that layout.

drop policy if exists "receipts: upload own" on storage.objects;
create policy "receipts: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts: read own or approver" on storage.objects;
create policy "receipts: read own or approver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_permission('finance.approve')
      or has_permission('finance.view_totals')
    )
  );

-- Replacing your own receipt is allowed while nobody has decided yet;
-- deleting one is not, because a claim's evidence should not be able
-- to disappear after it has been approved.
drop policy if exists "receipts: replace own" on storage.objects;
create policy "receipts: replace own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
