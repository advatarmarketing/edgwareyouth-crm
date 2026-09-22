-- Edgware Youth CRM — the seven starter templates (Prompt 5).
--
-- Re-runnable: everything keys off the template name and deletes its
-- own children first, so editing this file and running it again
-- updates the templates rather than duplicating them. It never touches
-- an initiative that has already been created from one.

-- ---------------------------------------------------------------
-- 1. The templates
-- ---------------------------------------------------------------

-- The unique index comes first: "on conflict do nothing" needs a
-- constraint to conflict on, and without it a second run of this file
-- would quietly give you fourteen templates.
create unique index if not exists initiative_templates_name_key
  on initiative_templates (name);

insert into initiative_templates (name, kind, initiative_type, weight, description, safeguarding_purge_weeks, position) values
  ('Weekly dars',        'programme', 'dars',        'light',    'The regular talk. Runs every week, so the plan has to be light enough that nobody dreads it.', 4,  1),
  ('Halaqah',            'programme', 'halaqah',     'light',    'Small circle. Discussion rather than a talk from the front.', 4,  2),
  ('Seerah night',       'event',     'seerah_night','standard', 'A one-off evening built around a story. The template most worth getting right — it is the one guests come to.', 8,  3),
  ('Sports / activity day','event',   'sports_day',  'standard', 'Physical activity, higher injury risk, usually younger attendees.', 12, 4),
  ('Fundraiser',         'event',     'fundraiser',  'standard', 'Money is the point, so the ask has to be designed as carefully as the programme.', 8,  5),
  ('Internal retreat',   'event',     'retreat',     'standard', 'Team only. Overnight or a full day away.', 8,  6),
  ('Residential camp',   'event',     'camp',        'heavy',    'Multi-day, under-18s, away from home. Every section of the file applies.', 12, 7)
on conflict (name) do update set
  kind = excluded.kind, initiative_type = excluded.initiative_type,
  weight = excluded.weight, description = excluded.description,
  safeguarding_purge_weeks = excluded.safeguarding_purge_weeks,
  position = excluded.position;

-- Clear this file's children before re-seeding them.
delete from template_roles         where template_id in (select id from initiative_templates);
delete from template_milestones    where template_id in (select id from initiative_templates);
delete from template_runsheet      where template_id in (select id from initiative_templates);
delete from template_ihsan_prompts where template_id in (select id from initiative_templates);
delete from template_risks         where template_id in (select id from initiative_templates);
delete from template_equipment     where template_id in (select id from initiative_templates);

-- ---------------------------------------------------------------
-- 2. Roles, scaled by weight
-- ---------------------------------------------------------------

insert into template_roles (template_id, role_key, label, duties, position)
select t.id, r.role_key, r.label, r.duties, r.position
  from initiative_templates t
  join (values
    ('lead',         'Project Lead',           'Owns the whole thing. Chases everyone else.',            1, array['light','standard','heavy']),
    ('programme',    'Programme & Speakers',   'Content, speakers, the run sheet, timings.',             2, array['light','standard','heavy']),
    ('welcome',      'Welcome / Hospitality',  'The door, the greeting, dates and water, first-timers.', 3, array['light','standard','heavy']),
    ('logistics',    'Logistics',              'Venue, set-up, layout, equipment, pack-down.',           4, array['standard','heavy']),
    ('finance',      'Finance & Admin',        'Budget, receipts, anything that costs money.',           5, array['standard','heavy']),
    ('media',        'Media',                  'Photos, video, the posts before and after.',             6, array['standard','heavy']),
    ('safeguarding', 'Safeguarding Lead',      'Consent, ratios, the missing person procedure.',         7, array['standard','heavy']),
    ('firstaid',     'First Aider',            'Named, qualified, present, and known to the team.',      8, array['standard','heavy']),
    ('activities',   'Activities',             'Games, workshops, anything hands-on.',                   9, array['heavy']),
    ('volunteers',   'Volunteer Lead',         'Rota, briefing, making sure nobody is left standing around.', 10, array['heavy'])
  ) as r(role_key, label, duties, position, weights)
    on t.weight = any(r.weights);

-- ---------------------------------------------------------------
-- 3. THE IHSAN PROMPTS
-- ---------------------------------------------------------------
--
-- Not a checklist and not a section. Each one is attached to the part
-- of the file where that decision is actually taken, so it is read at
-- the moment it can still change something.
--
-- They are questions rather than instructions on purpose. "Bukhoor
-- lit" can be ticked without a thought; "is the room aired before the
-- first person arrives, or after?" cannot.

insert into template_ihsan_prompts (template_id, section, dimension, prompt, role_key, position)
select t.id, p.section, p.dimension, p.prompt, p.role_key, p.position
  from initiative_templates t
  join (values
    -- Overview: the emotional journey, sitting with the aims.
    ('overview','emotional','Say the aim in one sentence a fifteen-year-old would repeat to a friend.','programme',1, array['light','standard','heavy']),
    ('overview','emotional','Who is the one person you most want to come back? Plan the night for them.','lead',2, array['standard','heavy']),
    ('overview','personal','Who is likely to walk in knowing nobody? What happens to them in the first two minutes?','welcome',3, array['light','standard','heavy']),

    -- Run sheet: the peak moment, and sound.
    ('runsheet','emotional','Put the peak moment in as a slot with a time and an owner. If it is not on the run sheet it will not happen.','programme',1, array['light','standard','heavy']),
    ('runsheet','sound','Who opens with recitation, and which passage? Ask them in advance, not on the night.','programme',2, array['light','standard','heavy']),
    ('runsheet','sound','Where is the planned silence? A room that never stops talking never lands.','programme',3, array['standard','heavy']),
    ('runsheet','sound','Sound check — in the actual room, with the actual mic, before anyone arrives.','logistics',4, array['standard','heavy']),
    ('runsheet','taste','When does food land relative to the talk? Hungry people do not listen and full people do not move.','logistics',5, array['standard','heavy']),

    -- Venue: sight, smell, touch.
    ('venue','sight','Walk in as a stranger. What is the first thing they see — and is the room finished before the first person arrives?','logistics',1, array['light','standard','heavy']),
    ('venue','sight','Circle or rows? Pick the one that matches what you want them to feel, not the one the chairs are already in.','logistics',2, array['light','standard','heavy']),
    ('venue','sight','Lighting. Overhead strip lights say classroom. Decide what this room should say.','logistics',3, array['standard','heavy']),
    ('venue','smell','Toilets and the wudu area: clean, stocked, and checked by a named person, not by everyone in general.','logistics',4, array['light','standard','heavy']),
    ('venue','smell','Is the room aired and the bukhoor lit before people arrive, or after they have already smelled the old carpet?','logistics',5, array['standard','heavy']),
    ('venue','touch','Temperature. Cold rooms end evenings early.','logistics',6, array['light','standard','heavy']),
    ('venue','touch','Sit in the actual seats for five minutes. Would you sit there for an hour?','logistics',7, array['standard','heavy']),

    -- Equipment: taste, touch, sight.
    ('equipment','taste','Dates and water at the door. Who is physically carrying them in?','welcome',1, array['light','standard','heavy']),
    ('equipment','taste','One memorable thing to eat. Not expensive — memorable.','welcome',2, array['standard','heavy']),
    ('equipment','touch','Is there something physical they take home? A card, a book, a note with the du''a on it.','media',3, array['standard','heavy']),
    ('equipment','sight','Signage from the street to the room. Could someone who has never been here find it without asking?','media',4, array['standard','heavy']),

    -- Rota: personal touches.
    ('rota','personal','Who is on the door to greet people by name? Greeting is a job, not something everyone does a bit of.','welcome',1, array['light','standard','heavy']),
    ('rota','sight','Can a newcomer tell who is on the team at a glance?','volunteers',2, array['standard','heavy']),
    ('rota','personal','Who sits with the people who came alone?','welcome',3, array['standard','heavy']),

    -- Content and follow-up.
    ('content','emotional','What is the one thing you want them still thinking about tomorrow morning?','programme',1, array['light','standard','heavy']),
    ('followup','personal','Who sends the thank you within 24 hours — to speakers, to volunteers, to the venue?','lead',1, array['light','standard','heavy']),
    ('followup','personal','First-timers: who personally invites each of them to the next one?','welcome',2, array['standard','heavy']),

    -- Camp only.
    ('safeguarding','personal','Every young person should have one adult who knows their name by the end of day one. Who checks that?','safeguarding',1, array['heavy']),
    ('venue','touch','Sleeping arrangements: warm, private enough, and somewhere to put their things.','logistics',8, array['heavy'])
  ) as p(section, dimension, prompt, role_key, position, weights)
    on t.weight = any(p.weights);

-- ---------------------------------------------------------------
-- 4. Milestones, dated backwards from the start date
-- ---------------------------------------------------------------
-- offset_days is negative for "before". -42 is six weeks out.

insert into template_milestones (template_id, title, offset_days, role_key, sop_title, position)
select t.id, m.title, m.offset_days, m.role_key, m.sop_title, m.position
  from initiative_templates t
  join (values
    -- Light: a weekly thing has to stay light or it stops happening.
    ('Confirm the speaker and the topic',                -7,  'programme', null::text, 1, array['light']),
    ('Post the reminder',                                -3,  'programme', null, 2, array['light']),
    ('Buy dates and water',                              -1,  'welcome',   null, 3, array['light']),
    ('Set the room up before anyone arrives',             0,  'welcome',   null, 4, array['light']),
    ('Message anyone who came for the first time',        1,  'welcome',   null, 5, array['light']),

    -- Standard.
    ('Agree the date, the aim and the budget',          -42,  'lead',      null, 1, array['standard','heavy']),
    ('Book the venue',                                  -35,  'logistics', null, 2, array['standard','heavy']),
    ('Invite the speaker and get a yes in writing',     -28,  'programme', null, 3, array['standard','heavy']),
    ('Send the speaker a written brief',                -21,  'programme', null, 4, array['standard','heavy']),
    ('Agree the media plan and schedule the first post',-21,  'media',     null, 5, array['standard','heavy']),
    ('Build the rota and ask the volunteers',           -14,  'lead',      null, 6, array['standard','heavy']),
    ('Complete the risk assessment',                    -10,  'safeguarding', 'Running a risk assessment', 7, array['standard','heavy']),
    ('Check the equipment list and buy what is missing', -7,  'logistics', null, 8, array['standard','heavy']),
    ('Finalise the run sheet — with the peak moment in it', -7,'programme', null, 9, array['standard','heavy']),
    ('Send the volunteer briefing',                      -3,  'lead',      null, 10, array['standard','heavy']),
    ('Walk the actual room and rehearse the set-up',     -1,  'logistics', 'Setting up a venue', 11, array['standard','heavy']),
    ('Dates, water and signage in place before doors',    0,  'welcome',   null, 12, array['standard','heavy']),
    ('Thank speakers, volunteers and the venue',          1,  'lead',      null, 13, array['standard','heavy']),
    ('Personally invite every first-timer to the next one',3, 'welcome',   null, 14, array['standard','heavy']),
    ('Hold the retrospective and score the senses',       7,  'lead',      null, 15, array['standard','heavy']),

    -- Heavy: a residential with under-18s.
    ('Agree the dates and secure the site',             -84,  'lead',      null, 20, array['heavy']),
    ('Open registration and issue consent forms',       -70,  'safeguarding', null, 21, array['heavy']),
    ('Confirm DBS for every adult attending',           -56,  'safeguarding', 'Checking DBS before an event', 22, array['heavy']),
    ('Book transport',                                  -42,  'logistics', null, 23, array['heavy']),
    ('Collect dietary requirements and agree the menu',  -28, 'logistics', null, 24, array['heavy']),
    ('Collect medical and allergy information',         -21,  'safeguarding', null, 25, array['heavy']),
    ('Confirm adult-to-youth ratio against final numbers',-14, 'safeguarding', null, 26, array['heavy']),
    ('Brief every adult on the missing person procedure', -7, 'safeguarding', 'Missing person procedure', 27, array['heavy']),
    ('Confirm the safeguarding data has been purged',    15,  'safeguarding', null, 28, array['heavy'])
  ) as m(title, offset_days, role_key, sop_title, position, weights)
    on t.weight = any(m.weights);

-- ---------------------------------------------------------------
-- 5. Run sheets
-- ---------------------------------------------------------------
-- Every one of these has exactly one is_peak_moment slot. That is the
-- whole ihsan integration in one column: the peak moment is a time on
-- a schedule with a person's name against it, not a box in a section.

insert into template_runsheet (template_id, title, offset_minutes, duration_minutes, role_key, slot_kind, is_peak_moment, position)
select t.id, s.title, s.offset_minutes, s.duration_minutes, s.role_key, s.slot_kind, s.is_peak, s.position
  from initiative_templates t
  join (values
    ('Doors — dates, water, greeting at the door',   0,  15, 'welcome',   'arrival',   false, 1, array['light']),
    ('Opening recitation',                          15,   5, 'programme', 'programme', false, 2, array['light']),
    ('The talk',                                    20,  35, 'programme', 'programme', false, 3, array['light']),
    ('A minute of quiet, then du''a together',      55,   5, 'programme', 'silence',   true,  4, array['light']),
    ('Close, and who to speak to on the way out',   60,  10, 'welcome',   'close',     false, 5, array['light']),

    ('Doors — dates, water, greeted by name',        0,  20, 'welcome',   'arrival',   false, 1, array['standard']),
    ('Opening recitation',                          20,   5, 'programme', 'programme', false, 2, array['standard']),
    ('Welcome and why we are here tonight',         25,  10, 'lead',      'programme', false, 3, array['standard']),
    ('Main talk',                                   35,  40, 'programme', 'programme', false, 4, array['standard']),
    ('Salah',                                       75,  20, 'programme', 'salah',     false, 5, array['standard']),
    ('Food',                                        95,  25, 'logistics', 'food',      false, 6, array['standard']),
    ('The moment — the story, the silence, the du''a', 120, 10, 'programme','silence', true,  7, array['standard']),
    ('Close, and the invitation to the next one',  130,  10, 'lead',      'close',     false, 8, array['standard']),

    ('Fajr and morning athkar',                      0,  45, 'programme', 'salah',     false, 1, array['heavy']),
    ('Breakfast',                                   60,  45, 'logistics', 'food',      false, 2, array['heavy']),
    ('Morning session',                            150,  75, 'programme', 'programme', false, 3, array['heavy']),
    ('Activity block',                             270,  90, 'activities','programme', false, 4, array['heavy']),
    ('Dhuhr and lunch',                            390,  75, 'programme', 'salah',     false, 5, array['heavy']),
    ('Afternoon session',                          510,  75, 'programme', 'programme', false, 6, array['heavy']),
    ('Free time',                                  600,  90, 'volunteers','break',     false, 7, array['heavy']),
    ('Maghrib and dinner',                         720,  90, 'logistics', 'food',      false, 8, array['heavy']),
    ('The night session — fire, story, silence, du''a', 840, 60, 'programme','silence', true, 9, array['heavy']),
    ('Isha and lights out',                        930,  60, 'safeguarding','close',   false, 10, array['heavy'])
  ) as s(title, offset_minutes, duration_minutes, role_key, slot_kind, is_peak, position, weights)
    on t.weight = any(s.weights);

-- ---------------------------------------------------------------
-- 6. Common risks, pre-loaded
-- ---------------------------------------------------------------

insert into template_risks (template_id, title, likelihood, severity, mitigation, strategy, position)
select t.id, r.title, r.likelihood, r.severity, r.mitigation, r.strategy, r.position
  from initiative_templates t
  join (values
    ('Speaker cancels late',        3, 4, 'A named backup who has already agreed, not a name on a list.', 'reduce', 1, array['light','standard','heavy']),
    ('Low turnout',                 3, 3, 'Personal invitations, not just a post. Count the yeses.',      'reduce', 2, array['light','standard','heavy']),
    ('Equipment fails on the night',3, 2, 'Test in the room beforehand. Bring a spare cable.',            'reduce', 3, array['light','standard','heavy']),
    ('Venue becomes unavailable',   2, 5, 'Booking confirmed in writing. Know the fallback room.',        'reduce', 4, array['standard','heavy']),
    ('Overspend',                   3, 3, 'Budget agreed before booking anything. Receipts as you go.',   'reduce', 5, array['standard','heavy']),
    ('Injury during the activity',  2, 4, 'Named first aider present. Kit checked and in date.',          'reduce', 6, array['standard','heavy']),
    ('A young person goes missing', 1, 5, 'Missing person procedure briefed to every adult beforehand.',  'reduce', 7, array['heavy']),
    ('Medical emergency',           2, 5, 'Medical forms collected. Nearest A&E known. Ratios kept.',     'reduce', 8, array['heavy']),
    ('A safeguarding disclosure',   2, 5, 'Safeguarding lead named and reachable. Reporting route known to all.', 'reduce', 9, array['heavy']),
    ('Transport fails',             2, 4, 'Confirmed in writing. Driver contacts held by two people.',    'reduce', 10, array['heavy']),
    ('Weather',                     3, 3, 'An indoor version of every outdoor slot.',                     'reduce', 11, array['heavy'])
  ) as r(title, likelihood, severity, mitigation, strategy, position, weights)
    on t.weight = any(r.weights);

-- ---------------------------------------------------------------
-- 7. Equipment
-- ---------------------------------------------------------------

insert into template_equipment (template_id, item, quantity, position)
select t.id, e.item, e.quantity, e.position
  from initiative_templates t
  join (values
    ('Dates',                     2, 1, array['light','standard','heavy']),
    ('Water',                    24, 2, array['light','standard','heavy']),
    ('Prayer mats',              10, 3, array['light','standard','heavy']),
    ('Microphone and speaker',    1, 4, array['standard','heavy']),
    ('Extension lead',            2, 5, array['standard','heavy']),
    ('Bukhoor and burner',        1, 6, array['standard','heavy']),
    ('Signage from the street',   3, 7, array['standard','heavy']),
    ('First aid kit',             1, 8, array['standard','heavy']),
    ('Projector and laptop',      1, 9, array['standard','heavy']),
    ('Takeaway cards',          100,10, array['standard','heavy']),
    ('Registration and consent folder', 1, 11, array['heavy']),
    ('Head torches',             10, 12, array['heavy'])
  ) as e(item, quantity, position, weights)
    on t.weight = any(e.weights);

notify pgrst, 'reload schema';
