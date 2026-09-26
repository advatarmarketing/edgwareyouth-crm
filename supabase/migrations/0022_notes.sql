-- Edgware Youth CRM — Notes.
--
-- A personal notebook: folders, notes, and the ability to turn any run
-- of lines in a note into a to-do list that is ALSO a task in the Tasks
-- tab — one list, not a copy of one. Ticking an item in either place
-- ticks the same row.
--
-- PRIVATE BY DEFAULT, and that is the decision this file turns on.
-- Notes are where people write things down before they are ready to
-- say them. Every note, folder and block is readable by its owner and
-- nobody else — including the shura.
--
-- That forced a change to TASKS, which is the part to read carefully.
-- Before this migration anyone holding tasks.view_all (every shura
-- member) could read every task and its checklist. A to-do list made
-- from a private note would therefore have published the note's lines
-- to the shura the moment it was created. So a task whose source is
-- 'note' is now private to its owner, in the policies themselves.

-- ---------------------------------------------------------------
-- 1. Let tasks and checklists come from a note
-- ---------------------------------------------------------------

alter table tasks      drop constraint if exists tasks_source_check;
alter table tasks      add  constraint tasks_source_check
  check (source in ('sop', 'meeting', 'event', 'okr', 'manual', 'note'));

alter table checklists drop constraint if exists checklists_source_check;
alter table checklists add  constraint checklists_source_check
  check (source in ('sop', 'meeting', 'event', 'okr', 'manual', 'note'));

-- ---------------------------------------------------------------
-- 2. Folders, notes, blocks
-- ---------------------------------------------------------------

create table if not exists note_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references profiles (id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists note_folders_owner_idx on note_folders (owner_id);

create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references profiles (id) on delete cascade,
  -- Deleting a folder leaves its notes unfiled rather than deleting
  -- them. Losing twenty notes because you tidied up a folder name is
  -- not a trade anybody would choose.
  folder_id  uuid references note_folders (id) on delete set null,
  title      text not null default '',
  created_at timestamptz not null default now(),
  -- What the list is sorted by. Moved by triggers below whenever any
  -- part of the note changes, including a to-do ticked from the Tasks
  -- tab, so "most recently updated" means the note, not just its title.
  updated_at timestamptz not null default now()
);

create index if not exists notes_owner_updated_idx on notes (owner_id, updated_at desc);
create index if not exists notes_folder_idx on notes (folder_id, updated_at desc);

/**
 * A note is a run of blocks: prose, and to-do lists.
 *
 * Blocks rather than one text column with markers in it, because a
 * to-do list here is not text that LOOKS like a checklist — it is a
 * real checklist, with its own rows, attached to a real task. A marker
 * in a text field would be one careless edit away from orphaning it.
 */
create table if not exists note_blocks (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references notes (id) on delete cascade,
  position     int  not null default 0,
  kind         text not null check (kind in ('text', 'todo')),
  body         text not null default '',
  -- Both set for a to-do block, both null for text.
  task_id      uuid references tasks (id) on delete set null,
  checklist_id uuid references checklists (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint todo_blocks_have_a_checklist
    check (kind <> 'todo' or checklist_id is not null)
);

create index if not exists note_blocks_note_idx on note_blocks (note_id, position);
create index if not exists note_blocks_checklist_idx on note_blocks (checklist_id)
  where checklist_id is not null;

-- ---------------------------------------------------------------
-- 3. Keeping updated_at honest
-- ---------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_touch on notes;
create trigger notes_touch
  before update on notes
  for each row execute function public.touch_updated_at();

drop trigger if exists note_folders_touch on note_folders;
create trigger note_folders_touch
  before update on note_folders
  for each row execute function public.touch_updated_at();

create or replace function public.touch_note_from_block()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- A block deleted because its NOTE is being deleted arrives here
  -- from inside the cascade, at trigger depth > 1. Touching a note that
  -- is halfway through being deleted is pointless at best, so skip it
  -- rather than depend on Postgres quietly updating zero rows.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  update notes set updated_at = now()
   where id = coalesce(new.note_id, old.note_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists note_blocks_touch_note on note_blocks;
create trigger note_blocks_touch_note
  after insert or update or delete on note_blocks
  for each row execute function public.touch_note_from_block();

/**
 * A tick in the Tasks tab moves the note too.
 *
 * security definer because the person ticking may not be the note's
 * owner — somebody with tasks.assign editing a checklist, say — and a
 * trigger that fails on their permissions would make their tick fail
 * with an error about a table they have never heard of.
 */
create or replace function public.touch_note_from_checklist_item()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update notes n set updated_at = now()
    from note_blocks b
   where b.note_id = n.id
     and b.checklist_id = coalesce(new.checklist_id, old.checklist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists checklist_items_touch_note on checklist_items;
create trigger checklist_items_touch_note
  after insert or update or delete on checklist_items
  for each row execute function public.touch_note_from_checklist_item();

-- ---------------------------------------------------------------
-- 4. Row level security — owner only
-- ---------------------------------------------------------------

alter table note_folders enable row level security;
alter table notes        enable row level security;
alter table note_blocks  enable row level security;

drop policy if exists "note_folders: owner" on note_folders;
create policy "note_folders: owner" on note_folders
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- The folder check in WITH CHECK stops a note being filed into somebody
-- else's folder by id, which would leak its title into their list.
drop policy if exists "notes: owner" on notes;
create policy "notes: owner" on notes
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      folder_id is null
      or exists (select 1 from note_folders f
                  where f.id = notes.folder_id and f.owner_id = auth.uid())
    )
  );

drop policy if exists "note_blocks: owner" on note_blocks;
create policy "note_blocks: owner" on note_blocks
  for all using (
    exists (select 1 from notes n where n.id = note_blocks.note_id and n.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from notes n where n.id = note_blocks.note_id and n.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------
-- 5. Tasks made from a note are private to their owner
-- ---------------------------------------------------------------
--
-- Rewritten in full rather than patched, so each policy reads as one
-- rule. `source <> 'note'` is the whole of the change: every existing
-- path through these policies is untouched for every other kind of task.
--
-- Own columns only, per 0007 — none of these call a function that
-- selects from tasks.

drop policy if exists "tasks: read" on tasks;
create policy "tasks: read" on tasks
  for select using (
    owner_id = auth.uid()
    or (source <> 'note'
        and (created_by = auth.uid() or has_permission('tasks.view_all')))
  );

drop policy if exists "tasks: insert" on tasks;
create policy "tasks: insert" on tasks
  for insert with check (
    is_active_member()
    and (owner_id = auth.uid() or has_permission('tasks.assign'))
    -- Nobody writes a task into another person's private notebook.
    and (source <> 'note' or owner_id = auth.uid())
  );

drop policy if exists "tasks: update" on tasks;
create policy "tasks: update" on tasks
  for update using (
    owner_id = auth.uid()
    or (source <> 'note'
        and (created_by = auth.uid() or has_permission('tasks.assign')))
  );

drop policy if exists "tasks: delete" on tasks;
create policy "tasks: delete" on tasks
  for delete using (
    (source = 'note' and owner_id = auth.uid())
    or (source <> 'note' and (created_by = auth.uid() or has_permission('tasks.assign')))
  );

-- can_see_task() is what the checklist and comment policies ask, so it
-- has to give the same answer as the read policy above or a note's
-- checklist would leak through the side door.
create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tasks t
     where t.id = p_task_id
       and (
         t.owner_id = auth.uid()
         or (t.source <> 'note'
             and (t.created_by = auth.uid() or has_permission('tasks.view_all')))
       )
  )
$$;

-- tasks.assign could previously edit any checklist. Not a note's.
drop policy if exists "checklists: write own" on checklists;
create policy "checklists: write own" on checklists
  for all using (
    created_by = auth.uid()
    or (source <> 'note' and has_permission('tasks.assign'))
  )
  with check (is_active_member());

-- ---------------------------------------------------------------
-- 6. Turning lines into a to-do list, atomically
-- ---------------------------------------------------------------

/**
 * Split a text block around the chosen lines and turn those lines into
 * a to-do list that is also a task.
 *
 * One function so it cannot half-happen: a task with no block pointing
 * at it, or a block whose checklist never got its items, would both be
 * worse than the conversion failing outright.
 *
 * SECURITY INVOKER, deliberately — the opposite of most helpers here.
 * It runs as the person calling it, so every insert is checked by the
 * policies above. It cannot convert a block in somebody else's note
 * because it cannot see one.
 *
 * p_items is [{ "text": "...", "depth": 0, "done": false }, ...], parsed
 * in TypeScript by the same code that parses SOP and meeting checklists.
 */
create or replace function public.make_note_todo(
  p_block_id uuid,
  p_before   text,
  p_items    jsonb,
  p_after    text,
  p_title    text
)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_block     note_blocks%rowtype;
  v_note      notes%rowtype;
  v_checklist uuid;
  v_task      uuid;
  v_todo      uuid;
begin
  select * into v_block from note_blocks where id = p_block_id and kind = 'text';
  if not found then
    raise exception 'That section could not be found.' using errcode = 'P0002';
  end if;
  select * into v_note from notes where id = v_block.note_id;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one line to turn into a to-do.' using errcode = '22023';
  end if;

  -- Room for two new blocks directly after this one.
  update note_blocks set position = position + 2
   where note_id = v_block.note_id and position > v_block.position;

  insert into checklists (title, source, source_id, created_by)
  values (coalesce(nullif(btrim(p_title), ''), nullif(btrim(v_note.title), ''), 'To do'),
          'note', v_note.id, auth.uid())
  returning id into v_checklist;

  insert into checklist_items (checklist_id, text, depth, position, done, done_by, done_at)
  select v_checklist,
         item ->> 'text',
         coalesce((item ->> 'depth')::int, 0),
         (ord - 1)::int,
         coalesce((item ->> 'done')::boolean, false),
         case when coalesce((item ->> 'done')::boolean, false) then auth.uid() end,
         case when coalesce((item ->> 'done')::boolean, false) then now() end
    from jsonb_array_elements(p_items) with ordinality as t(item, ord);

  insert into tasks (title, owner_id, created_by, checklist_id, source, source_id)
  values (coalesce(nullif(btrim(p_title), ''), nullif(btrim(v_note.title), ''), 'To do'),
          auth.uid(), auth.uid(), v_checklist, 'note', v_note.id)
  returning id into v_task;

  update note_blocks set body = coalesce(p_before, '') where id = v_block.id;

  insert into note_blocks (note_id, position, kind, task_id, checklist_id)
  values (v_block.note_id, v_block.position + 1, 'todo', v_task, v_checklist)
  returning id into v_todo;

  if btrim(coalesce(p_after, '')) <> '' then
    insert into note_blocks (note_id, position, kind, body)
    values (v_block.note_id, v_block.position + 2, 'text', p_after);
  end if;

  -- A split at the very top leaves an empty text block above the list.
  -- Drop it, unless it is the only thing keeping a place to type.
  if btrim(coalesce(p_before, '')) = '' then
    delete from note_blocks where id = v_block.id;
  end if;

  return v_todo;
end;
$$;

/**
 * The reverse: put a to-do list back into the note as lines.
 *
 * Ticked items come back as "[x]" so nothing about their state is lost,
 * and the task is removed from the Tasks tab — a list that has been
 * turned back into prose should not keep nagging somebody from there.
 */
create or replace function public.note_todo_to_text(p_block_id uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_block note_blocks%rowtype;
  v_text  text;
begin
  select * into v_block from note_blocks where id = p_block_id and kind = 'todo';
  if not found then
    raise exception 'That list could not be found.' using errcode = 'P0002';
  end if;

  select string_agg(
           repeat('  ', i.depth) || '- ' || case when i.done then '[x] ' else '' end || i.text,
           E'\n' order by i.position)
    into v_text
    from checklist_items i
   where i.checklist_id = v_block.checklist_id;

  update note_blocks
     set kind = 'text', body = coalesce(v_text, ''), task_id = null, checklist_id = null
   where id = v_block.id;

  if v_block.task_id is not null then
    delete from tasks where id = v_block.task_id;
  end if;
  delete from checklists where id = v_block.checklist_id;
end;
$$;

-- ---------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------

grant select, insert, update, delete on note_folders, notes, note_blocks to authenticated;
grant execute on function public.make_note_todo(uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.note_todo_to_text(uuid) to authenticated;

notify pgrst, 'reload schema';
