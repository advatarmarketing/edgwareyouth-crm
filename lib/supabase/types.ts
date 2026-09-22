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
    };

    // `{}`, not `Record<string, never>`. supabase-js resolves a table
    // name against `Tables & Views`, and a Record's index signature
    // covers every key — so the intersection turns each table into
    // `profiles & never`, i.e. `never`.
    Views: {
      member_directory: { Row: MemberDirectoryRow; Relationships: [] };
    };
    Functions: {
      has_permission: { Args: { p_key: string }; Returns: boolean };
      is_shura: { Args: Record<string, never>; Returns: boolean };
      current_tier: { Args: Record<string, never>; Returns: string | null };
      is_active_member: { Args: Record<string, never>; Returns: boolean };
      my_permissions: { Args: Record<string, never>; Returns: string[] };
      can_see_task: { Args: { p_task_id: string }; Returns: boolean };
      can_see_sop: { Args: { p_sop_id: string }; Returns: boolean };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
