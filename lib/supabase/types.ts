/**
 * Hand-written to mirror supabase/migrations/.
 *
 * NOT the output of `supabase gen types typescript`. Replace this file
 * with the generated version as soon as the Supabase project exists:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/types.ts
 *
 * Hand-maintained types drift the moment the schema changes and won't
 * tell you they have.
 *
 * Everything below is a `type`, never an `interface`. supabase-js
 * requires each Row to satisfy `Record<string, unknown>`; an interface
 * has no implicit index signature, fails that constraint, and every
 * table silently resolves to `never` — reported at the call site as
 * "property does not exist on type never", which points nowhere near
 * here. Don't convert these back.
 */

/**
 * A person's tier. See spec section 2.
 *
 * Null is not missing data — it means "Ansar only": someone carrying
 * the Ansar badge without sitting at any tier. Every narrowing on tier
 * has to handle null as a real case.
 */
export type Tier = "shura" | "sabiqun" | "muhsinun";

/** What tier defaults are keyed by. `ansar` is the badge, not a tier. */
export type TierKey = Tier | "ansar";

export type Position =
  | "lead"
  | "vice_lead"
  | "head_of_finance"
  | "head_of_media"
  | "event_lead";

export type TeamKey = "media" | "finance" | "events" | "dawah" | "tarbiyah";

export type DbsStatus = "none" | "applied" | "valid";

/**
 * Every permission key in the system. Kept as a union so a typo in a
 * has_permission("finance.aprove") call fails to compile rather than
 * silently returning false — which would read as "correctly denied".
 */
export type PermissionKey =
  | "members.view_directory"
  | "members.view_contact"
  | "members.manage"
  | "members.view_notes"
  | "permissions.manage"
  | "audit.view"
  | "tasks.assign"
  | "sops.manage"
  | "calendar.view_all"
  | "meetings.manage"
  | "meetings.view_shura"
  | "events.propose"
  | "events.approve"
  | "events.view_all"
  | "risk.manage"
  | "finance.view_totals"
  | "finance.view_individual"
  | "finance.log"
  | "finance.approve"
  | "strategy.edit"
  | "yearplan.view"
  | "okr.manage"
  | "okr.update_own"
  | "kpi.view"
  | "announcements.post"
  | "media.manage"
  | "media.edit"
  | "development.view_all"
  | "resources.upload"
  | "tasks.view_all"
  | "calendar.view_org";

export type ChecklistSource = "sop" | "meeting" | "event" | "okr" | "manual";
export type TaskStatus = "todo" | "doing" | "done" | "blocked";
export type TaskPriority = "low" | "normal" | "high";

export type NotificationKind =
  | "task_new"
  | "task_due_soon"
  | "task_overdue"
  | "task_blocked"
  | "meeting_pack"
  | "mention"
  | "event_decision"
  | "expense_decision"
  | "announcement"
  | "sop_to_read";

export type Checklist = {
  id: string;
  title: string | null;
  source: ChecklistSource;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  checklist_id: string;
  text: string;
  depth: number;
  position: number;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  created_by: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  blocked_reason: string | null;
  checklist_id: string | null;
  source: ChecklistSource;
  source_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  emailed_at: string | null;
  created_at: string;
};

export type NotificationPreference = {
  user_id: string;
  kind: NotificationKind;
  email_enabled: boolean;
};

export type SopStatus = "draft" | "published";

export type Sop = {
  id: string;
  title: string;
  category: string;
  body: string;
  checklist_id: string | null;
  status: SopStatus;
  version: number;
  visible_to_all: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SopVisibleTier = { sop_id: string; tier_key: TierKey };
export type SopVisibleTeam = { sop_id: string; team_key: TeamKey };
export type SopVisiblePerson = { sop_id: string; profile_id: string };

export type SopRead = {
  sop_id: string;
  profile_id: string;
  version_read: number;
  read_at: string;
};

export type SopVersion = {
  id: string;
  sop_id: string;
  version: number;
  title: string;
  body: string;
  changed_by: string | null;
  changed_at: string;
};

export type MinutesVisibility = "shura" | "attendees" | "all_staff";
export type MeetingStatus = "draft" | "review" | "published";
export type Attendance = "expected" | "present" | "apologies" | "absent";
export type AgendaOrigin = "template" | "matters_arising" | "suggested" | "manual";

export type MeetingTemplate = {
  id: string;
  name: string;
  meeting_type: string;
  agenda_sections: string[];
  minutes_visibility: MinutesVisibility;
  default_chair_id: string | null;
  default_minute_taker_id: string | null;
  is_active: boolean;
  position: number;
};

export type Meeting = {
  id: string;
  template_id: string | null;
  title: string;
  meeting_type: string;
  meeting_date: string;
  starts_at: string | null;
  chair_id: string | null;
  minute_taker_id: string | null;
  minutes_visibility: MinutesVisibility;
  status: MeetingStatus;
  recording_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
};

export type MeetingAttendee = {
  meeting_id: string;
  profile_id: string;
  attendance: Attendance;
};

export type MeetingAgendaItem = {
  id: string;
  meeting_id: string;
  title: string;
  notes: string | null;
  position: number;
  origin: AgendaOrigin;
  suggested_by: string | null;
  created_at: string;
};

export type MeetingAction = {
  id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  owner_id: string | null;
  text: string;
  due_date: string | null;
  steps: string[];
  task_id: string | null;
  source_line: string | null;
  created_at: string;
};

export type MeetingDecision = {
  id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  text: string;
  created_at: string;
};

export type MeetingUnresolved = {
  id: string;
  meeting_id: string;
  line: string;
  reason: string;
  candidates: { id: string; name: string }[] | null;
  steps: string[];
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  tier: Tier | null;
  is_ansar: boolean;
  position: Position | null;
  skills: string[];
  availability: string | null;
  dbs_status: DbsStatus | null;
  dbs_expiry: string | null;
  first_aid_trained: boolean;
  first_aid_expiry: string | null;
  date_joined: string | null;
  last_engaged_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type Team = {
  key: TeamKey;
  name: string;
  is_active: boolean;
  position: number;
};

export type TeamMember = { profile_id: string; team_key: TeamKey };

export type Permission = {
  key: PermissionKey;
  label: string;
  category: string;
  description: string | null;
};

export type TierPermission = { tier_key: TierKey; permission_key: PermissionKey };

export type ProfilePermission = {
  profile_id: string;
  permission_key: PermissionKey;
  granted: boolean;
  set_by: string | null;
  set_at: string;
};

export type MemberNote = {
  id: string;
  profile_id: string;
  body: string;
  author_id: string | null;
  created_at: string;
};

/**
 * The directory, with contact and safeguarding columns masked to null
 * for anyone without the permission to see them. See the view's own
 * comment in 0002 for why the masking is there and not in a policy.
 */
export type MemberDirectoryRow = Omit<Profile, "created_at">;

// ---------------------------------------------------------------
// Initiatives — events, programmes and campaigns (0008)
// ---------------------------------------------------------------

/**
 * One planning object, not three.
 *
 * A weekly dars, a residential camp and a fundraising campaign share
 * roles, milestones, a run sheet, risks, a budget and a retrospective.
 * Only recurrence really differs, so `kind` distinguishes them rather
 * than three parallel tables that would drift apart.
 */
export type InitiativeKind = "event" | "programme" | "campaign";

export type InitiativeStage =
  | "idea"
  | "proposal"
  | "approved"
  | "planning"
  | "live"
  | "wrap_up"
  | "closed";

export type TemplateWeight = "light" | "standard" | "heavy";

export type SlotKind =
  | "arrival"
  | "programme"
  | "salah"
  | "food"
  | "break"
  | "silence"
  | "close";

export type RiskStrategy = "avoid" | "reduce" | "transfer" | "accept";

/**
 * The seven dimensions of ihsan.
 *
 * Note what is NOT here: a table of ihsan checklist items. The
 * dimensions exist so that a retrospective rating can be traced back
 * to the prompts that fed it, and so scores can be compared across
 * events. The prompts themselves live on the section where that
 * decision is taken — see IhsanSection.
 */
export type IhsanDimension =
  | "emotional"
  | "sight"
  | "sound"
  | "smell"
  | "taste"
  | "touch"
  | "personal";

/** Where in the file a prompt appears, i.e. where the decision is made. */
export type IhsanSection =
  | "overview"
  | "roles"
  | "milestones"
  | "runsheet"
  | "content"
  | "speakers"
  | "venue"
  | "equipment"
  | "rota"
  | "safeguarding"
  | "risks"
  | "budget"
  | "media"
  | "attendance"
  | "stakeholders"
  | "followup";

export type InitiativeTemplate = {
  id: string;
  name: string;
  kind: InitiativeKind;
  initiative_type: string;
  weight: TemplateWeight;
  description: string | null;
  safeguarding_purge_weeks: number;
  is_active: boolean;
  position: number;
};

export type TemplateRole = {
  id: string;
  template_id: string;
  role_key: string;
  label: string;
  duties: string | null;
  position: number;
};

export type TemplateMilestone = {
  id: string;
  template_id: string;
  title: string;
  /** Negative is before the start date. -14 is a fortnight out. */
  offset_days: number;
  role_key: string | null;
  sop_title: string | null;
  position: number;
};

export type TemplateRunsheetSlot = {
  id: string;
  template_id: string;
  title: string;
  offset_minutes: number;
  duration_minutes: number;
  role_key: string | null;
  slot_kind: SlotKind;
  is_peak_moment: boolean;
  position: number;
};

export type TemplateIhsanPrompt = {
  id: string;
  template_id: string;
  section: IhsanSection;
  dimension: IhsanDimension;
  prompt: string;
  role_key: string | null;
  position: number;
};

export type TemplateRisk = {
  id: string;
  template_id: string;
  title: string;
  likelihood: number;
  severity: number;
  mitigation: string | null;
  strategy: RiskStrategy | null;
  position: number;
};

export type TemplateEquipment = {
  id: string;
  template_id: string;
  item: string;
  quantity: number;
  position: number;
};

export type Initiative = {
  id: string;
  template_id: string | null;
  kind: InitiativeKind;
  initiative_type: string;
  title: string;
  stage: InitiativeStage;

  starts_on: string | null;
  ends_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence: string | null;

  lead_id: string | null;

  background: string | null;
  aims: string | null;
  audience: string | null;
  age_range: string | null;
  outputs: string | null;
  outcomes: string | null;
  serves_okr: string | null;

  // The emotional journey. It sits in the overview beside the aims
  // because it is an aim, not a garnish applied afterwards.
  feels_arriving: string | null;
  feels_peak: string | null;
  feels_leaving: string | null;
  one_thing: string | null;

  theme: string | null;
  theme_why: string | null;
  content_outline: string | null;

  venue_name: string | null;
  venue_address: string | null;
  venue_contact: string | null;
  venue_booked: boolean;
  access_from: string | null;
  access_until: string | null;
  layout: string | null;
  transport: string | null;
  parking: string | null;

  briefing: string | null;

  expected_attendance: number | null;
  actual_attendance: number | null;
  first_timers: number | null;
  returning_attendees: number | null;

  safeguarding_purge_weeks: number;

  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;

  created_by: string | null;
  created_at: string;
  closed_at: string | null;
};

/** What a volunteer sees: basics, their own rota line, the briefing. */
export type InitiativeBasics = Pick<
  Initiative,
  | "id"
  | "kind"
  | "initiative_type"
  | "title"
  | "stage"
  | "starts_on"
  | "ends_on"
  | "starts_at"
  | "ends_at"
  | "recurrence"
  | "venue_name"
  | "venue_address"
  | "lead_id"
  | "briefing"
>;

export type InitiativeRole = {
  id: string;
  initiative_id: string;
  role_key: string;
  label: string;
  duties: string | null;
  profile_id: string | null;
  position: number;
};

export type InitiativeMilestone = {
  id: string;
  initiative_id: string;
  title: string;
  due_date: string | null;
  owner_id: string | null;
  done: boolean;
  done_at: string | null;
  task_id: string | null;
  position: number;
};

export type InitiativeRunsheetSlot = {
  id: string;
  initiative_id: string;
  title: string;
  starts_at: string | null;
  duration_minutes: number;
  owner_id: string | null;
  slot_kind: SlotKind;
  /** The designed peak moment, as a real time with a real owner. */
  is_peak_moment: boolean;
  notes: string | null;
  position: number;
};

export type InitiativeSpeaker = {
  id: string;
  initiative_id: string;
  name: string;
  contact: string | null;
  topic: string | null;
  brief_sent: boolean;
  confirmed: boolean;
  travel: string | null;
  backup: string | null;
  position: number;
};

export type InitiativeEquipment = {
  id: string;
  initiative_id: string;
  item: string;
  quantity: number;
  who_brings: string | null;
  packed: boolean;
  returned: boolean;
  position: number;
};

export type InitiativeVolunteer = {
  id: string;
  initiative_id: string;
  profile_id: string | null;
  name: string | null;
  role: string | null;
  from_time: string | null;
  to_time: string | null;
  report_to: string | null;
  briefing_done: boolean;
  position: number;
};

export type InitiativeRisk = {
  id: string;
  initiative_id: string;
  title: string;
  likelihood: number;
  severity: number;
  /** Generated in the database, so it can never disagree with its factors. */
  score: number;
  owner_id: string | null;
  mitigation: string | null;
  strategy: RiskStrategy | null;
  position: number;
};

export type InitiativeBudgetLine = {
  id: string;
  initiative_id: string;
  description: string;
  planned: number;
  actual: number | null;
  direction: "cost" | "income";
  fund_key: string | null;
  position: number;
};

export type InitiativeMediaPlanItem = {
  id: string;
  initiative_id: string;
  goal: string | null;
  channel: string;
  asset: string;
  owner_id: string | null;
  due_date: string | null;
  status: "idea" | "briefed" | "in_progress" | "ready" | "published";
  position: number;
};

export type InitiativeStakeholder = {
  id: string;
  initiative_id: string;
  name: string;
  relationship: string | null;
  what_we_do: string | null;
  owner_id: string | null;
  position: number;
};

/**
 * An ihsan prompt as copied onto this initiative.
 *
 * Editable, and `response` is what was actually decided. If the venue
 * has no power for a diffuser you rewrite the prompt — you do not tick
 * it and move on.
 */
export type InitiativeIhsanPrompt = {
  id: string;
  initiative_id: string;
  section: IhsanSection;
  dimension: IhsanDimension;
  prompt: string;
  response: string | null;
  owner_id: string | null;
  position: number;
};

export type InitiativeApproval = {
  id: string;
  initiative_id: string;
  action: "submitted" | "approved" | "returned";
  actor_id: string | null;
  comment: string | null;
  at: string;
};

export type InitiativeSafeguarding = {
  initiative_id: string;
  safeguarding_lead_id: string | null;
  first_aider_id: string | null;
  adult_to_youth_ratio: string | null;
  dbs_checked: boolean;
  missing_person_procedure: string | null;
  nearest_ae: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
};

/** Special-category data. Deleted on a schedule; see 0009. */
export type InitiativeParticipant = {
  id: string;
  initiative_id: string;
  full_name: string;
  date_of_birth: string | null;
  parent_name: string | null;
  emergency_contact: string | null;
  medical_notes: string | null;
  allergies: string | null;
  photo_consent: boolean;
  parental_consent: boolean;
  consent_received_at: string | null;
  purge_after: string | null;
  created_at: string;
};

export type InitiativeRetrospective = {
  initiative_id: string;
  went_well: string | null;
  challenges: string | null;
  improve: string | null;
  change_next: string | null;
  summary: string | null;
  people_engaged: number | null;
  media_uploaded: boolean;
  feedback: string | null;
  is_final: boolean;
  finalised_by: string | null;
  finalised_at: string | null;
};

export type InitiativeIhsanRating = {
  initiative_id: string;
  rater_id: string;
  dimension: IhsanDimension;
  score: number;
  comment: string | null;
  rated_at: string;
};

export type IhsanScoreRow = {
  initiative_id: string;
  title: string;
  kind: InitiativeKind;
  initiative_type: string;
  starts_on: string | null;
  dimension: IhsanDimension;
  avg_score: number;
  low_score: number;
  high_score: number;
  raters: number;
};

export type AuditLogEntry = {
  id: number;
  at: string;
  /** Null means the system did it — the scheduled purge. A real value. */
  actor_id: string | null;
  action: string;
  subject_table: string | null;
  subject_id: string | null;
  detail: Record<string, unknown>;
};

/** What initiative_readiness() returns: empty array means ready. */
export type ReadinessIssue = { section: string; issue: string };

type Table<Row, Ins = Partial<Row>, Upd = Partial<Row>> = {
  Row: Row;
  Insert: Ins;
  Update: Upd;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };

  public: {
    Tables: {
      profiles: Table<Profile, Partial<Profile> & { id: string }>;
      teams: Table<Team>;
      team_members: Table<TeamMember, TeamMember>;
      permissions: Table<Permission>;
      tier_permissions: Table<TierPermission, TierPermission>;
      profile_permissions: Table<
        ProfilePermission,
        Pick<ProfilePermission, "profile_id" | "permission_key" | "granted"> &
          Partial<ProfilePermission>
      >;
      member_notes: Table<MemberNote, Pick<MemberNote, "profile_id" | "body"> & Partial<MemberNote>>;
      checklists: Table<Checklist>;
      checklist_items: Table<ChecklistItem, Pick<ChecklistItem, "checklist_id" | "text"> & Partial<ChecklistItem>>;
      tasks: Table<Task, Pick<Task, "title"> & Partial<Task>>;
      task_comments: Table<TaskComment, Pick<TaskComment, "task_id" | "body"> & Partial<TaskComment>>;
      notifications: Table<AppNotification, Pick<AppNotification, "user_id" | "kind" | "title"> & Partial<AppNotification>>;
      notification_preferences: Table<NotificationPreference, NotificationPreference>;
      sops: Table<Sop, Pick<Sop, "title"> & Partial<Sop>>;
      sop_visible_tiers: Table<SopVisibleTier, SopVisibleTier>;
      sop_visible_teams: Table<SopVisibleTeam, SopVisibleTeam>;
      sop_visible_people: Table<SopVisiblePerson, SopVisiblePerson>;
      sop_reads: Table<SopRead, SopRead>;
      sop_versions: Table<SopVersion, Omit<SopVersion, "id" | "changed_at"> & Partial<SopVersion>>;
      meeting_templates: Table<MeetingTemplate, Pick<MeetingTemplate, "name" | "meeting_type"> & Partial<MeetingTemplate>>;
      meetings: Table<Meeting, Pick<Meeting, "title" | "meeting_type" | "meeting_date"> & Partial<Meeting>>;
      // `attendance` has a database default, so an insert that only
      // names the person is valid — the type has to allow that or
      // adding somebody to a meeting fails to compile.
      meeting_attendees: Table<MeetingAttendee, Pick<MeetingAttendee, "meeting_id" | "profile_id"> & Partial<MeetingAttendee>>;
      meeting_agenda_items: Table<MeetingAgendaItem, Pick<MeetingAgendaItem, "meeting_id" | "title"> & Partial<MeetingAgendaItem>>;
      meeting_actions: Table<MeetingAction, Pick<MeetingAction, "meeting_id" | "text"> & Partial<MeetingAction>>;
      meeting_decisions: Table<MeetingDecision, Pick<MeetingDecision, "meeting_id" | "text"> & Partial<MeetingDecision>>;
      meeting_unresolved: Table<MeetingUnresolved, Pick<MeetingUnresolved, "meeting_id" | "line" | "reason"> & Partial<MeetingUnresolved>>;

      initiative_templates: Table<InitiativeTemplate, Pick<InitiativeTemplate, "name" | "initiative_type"> & Partial<InitiativeTemplate>>;
      template_roles: Table<TemplateRole, Pick<TemplateRole, "template_id" | "role_key" | "label"> & Partial<TemplateRole>>;
      template_milestones: Table<TemplateMilestone, Pick<TemplateMilestone, "template_id" | "title"> & Partial<TemplateMilestone>>;
      template_runsheet: Table<TemplateRunsheetSlot, Pick<TemplateRunsheetSlot, "template_id" | "title"> & Partial<TemplateRunsheetSlot>>;
      template_ihsan_prompts: Table<TemplateIhsanPrompt, Pick<TemplateIhsanPrompt, "template_id" | "section" | "dimension" | "prompt"> & Partial<TemplateIhsanPrompt>>;
      template_risks: Table<TemplateRisk, Pick<TemplateRisk, "template_id" | "title"> & Partial<TemplateRisk>>;
      template_equipment: Table<TemplateEquipment, Pick<TemplateEquipment, "template_id" | "item"> & Partial<TemplateEquipment>>;

      initiatives: Table<Initiative, Pick<Initiative, "title" | "initiative_type"> & Partial<Initiative>>;
      initiative_roles: Table<InitiativeRole, Pick<InitiativeRole, "initiative_id" | "role_key" | "label"> & Partial<InitiativeRole>>;
      initiative_milestones: Table<InitiativeMilestone, Pick<InitiativeMilestone, "initiative_id" | "title"> & Partial<InitiativeMilestone>>;
      initiative_runsheet: Table<InitiativeRunsheetSlot, Pick<InitiativeRunsheetSlot, "initiative_id" | "title"> & Partial<InitiativeRunsheetSlot>>;
      initiative_speakers: Table<InitiativeSpeaker, Pick<InitiativeSpeaker, "initiative_id" | "name"> & Partial<InitiativeSpeaker>>;
      initiative_equipment: Table<InitiativeEquipment, Pick<InitiativeEquipment, "initiative_id" | "item"> & Partial<InitiativeEquipment>>;
      initiative_volunteers: Table<InitiativeVolunteer, Pick<InitiativeVolunteer, "initiative_id"> & Partial<InitiativeVolunteer>>;
      initiative_risks: Table<InitiativeRisk, Pick<InitiativeRisk, "initiative_id" | "title"> & Partial<InitiativeRisk>, Partial<Omit<InitiativeRisk, "score">>>;
      initiative_budget_lines: Table<InitiativeBudgetLine, Pick<InitiativeBudgetLine, "initiative_id" | "description"> & Partial<InitiativeBudgetLine>>;
      initiative_media_plan: Table<InitiativeMediaPlanItem, Pick<InitiativeMediaPlanItem, "initiative_id" | "channel" | "asset"> & Partial<InitiativeMediaPlanItem>>;
      initiative_stakeholders: Table<InitiativeStakeholder, Pick<InitiativeStakeholder, "initiative_id" | "name"> & Partial<InitiativeStakeholder>>;
      initiative_ihsan_prompts: Table<InitiativeIhsanPrompt, Pick<InitiativeIhsanPrompt, "initiative_id" | "section" | "dimension" | "prompt"> & Partial<InitiativeIhsanPrompt>>;
      initiative_approvals: Table<InitiativeApproval, Pick<InitiativeApproval, "initiative_id" | "action"> & Partial<InitiativeApproval>>;
      initiative_safeguarding: Table<InitiativeSafeguarding, Pick<InitiativeSafeguarding, "initiative_id"> & Partial<InitiativeSafeguarding>>;
      initiative_participants: Table<InitiativeParticipant, Pick<InitiativeParticipant, "initiative_id" | "full_name"> & Partial<InitiativeParticipant>>;
      initiative_retrospectives: Table<InitiativeRetrospective, Pick<InitiativeRetrospective, "initiative_id"> & Partial<InitiativeRetrospective>>;
      initiative_ihsan_ratings: Table<InitiativeIhsanRating, Pick<InitiativeIhsanRating, "initiative_id" | "rater_id" | "dimension" | "score"> & Partial<InitiativeIhsanRating>>;
      audit_log: Table<AuditLogEntry, Pick<AuditLogEntry, "action"> & Partial<AuditLogEntry>>;
    };

    // `{}`, not `Record<string, never>`. supabase-js resolves a table
    // name against `Tables & Views`, and a Record's index signature
    // covers every key — so the intersection turns each table into
    // `profiles & never`, i.e. `never`.
    Views: {
      member_directory: { Row: MemberDirectoryRow; Relationships: [] };
      initiative_basics: { Row: InitiativeBasics; Relationships: [] };
      ihsan_scores_by_dimension: { Row: IhsanScoreRow; Relationships: [] };
    };
    Functions: {
      has_permission: { Args: { p_key: string }; Returns: boolean };
      is_shura: { Args: Record<string, never>; Returns: boolean };
      current_tier: { Args: Record<string, never>; Returns: string | null };
      is_active_member: { Args: Record<string, never>; Returns: boolean };
      my_permissions: { Args: Record<string, never>; Returns: string[] };
      can_see_task: { Args: { p_task_id: string }; Returns: boolean };
      can_see_sop: { Args: { p_sop_id: string }; Returns: boolean };
      can_see_meeting: { Args: { p_meeting_id: string }; Returns: boolean };
      can_run_meeting: { Args: { p_meeting_id: string }; Returns: boolean };
      can_see_initiative: { Args: { p_id: string }; Returns: boolean };
      can_edit_initiative: { Args: { p_id: string }; Returns: boolean };
      can_see_safeguarding: { Args: { p_id: string }; Returns: boolean };
      initiative_readiness: { Args: { p_id: string }; Returns: ReadinessIssue[] };
      apply_template_to_initiative: { Args: { p_id: string }; Returns: number };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
