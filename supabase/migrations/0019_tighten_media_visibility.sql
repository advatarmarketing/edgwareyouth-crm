-- Edgware Youth CRM — fix-up after 0017.
--
-- 0017 gave every active member read on the whole media module. The
-- access matrix in spec section 3 does not:
--
--   Media planning | Head of Media full, other shura view
--                  | Media team edit; others view event media plans they're on
--                  | ... same ... | ... same ...
--
-- So the ORG-WIDE plan — goals, the content calendar, the monthly
-- review numbers — belongs to people with a media permission. Event
-- media plans are unaffected: they live in initiative_media_plan and
-- already follow the event's own rules, which is exactly what the
-- matrix describes.
--
-- DELIBERATE DEVIATION, stated rather than smuggled: platforms,
-- content pillars and the brand guidelines stay readable by all staff.
-- They are tone-of-voice and logo rules that anybody making a poster
-- for their own event needs, the Brand files resource folder is
-- visible_to_all for the same reason, and withholding them produces
-- worse posters rather than better confidentiality. If that is not
-- wanted, add media.edit to the three policies below.

drop policy if exists "media_goals: read" on media_goals;
create policy "media_goals: read" on media_goals
  for select using (
    has_permission('media.manage') or has_permission('media.edit')
  );

drop policy if exists "content_calendar: read" on content_calendar;
create policy "content_calendar: read" on content_calendar
  for select using (
    has_permission('media.manage')
    or has_permission('media.edit')
    -- A post tied to an event is visible to the people running that
    -- event, so the event lead can see what is going out about it.
    or (initiative_id is not null and can_see_initiative(initiative_id))
  );

drop policy if exists "media_reviews: read" on media_reviews;
create policy "media_reviews: read" on media_reviews
  for select using (
    has_permission('media.manage')
    or has_permission('media.edit')
    -- Whoever reports on KPIs needs the numbers behind the follower
    -- count they are being shown.
    or has_permission('kpi.view')
  );

notify pgrst, 'reload schema';
