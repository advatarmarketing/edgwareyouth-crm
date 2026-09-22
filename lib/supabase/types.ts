/**
 * Hand-written to mirror supabase/migrations/.
 *
 * This is NOT the output of `supabase gen types typescript`. Once the
 * migrations have been run against the real Edgware Supabase project,
 * replace this file with the generated version:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/types.ts
 *
 * Do that as soon as Prompt 1 lands. Hand-maintained types drift the
 * moment the schema changes and won't tell you they have.
 */

/**
 * A person's tier. See spec section 2.
 *
 * Null is not an absence of data — it means "Ansar only": someone who
 * carries the Ansar badge without sitting at any tier. Every piece of
 * code that narrows on tier has to handle null as a real case, which
 * is why this is modelled as `Tier | null` everywhere rather than a
 * string with an "none" member that would quietly pass a truthiness
 * check.
 */
export type Tier = "shura" | "sabiqun" | "muhsinun";

/** Named posts. Prompt 1 makes this a table; this union is the seed. */
export type Position =
  | "lead"
  | "vice_lead"
  | "head_of_finance"
  | "head_of_media"
  | "event_lead";

/** Teams. Dawah/Outreach and Tarbiyah exist but ship switched off. */
export type Team = "media" | "finance" | "events" | "dawah" | "tarbiyah";

// A type alias, deliberately, not an `interface`.
//
// supabase-js requires every Row to satisfy `Record<string, unknown>`.
// An interface does not get an implicit index signature, so it fails
// that constraint, the schema stops matching GenericSchema, and every
// table resolves to `never` — reported as "property does not exist on
// type never" at the call site, which points nowhere near here.
export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  tier: Tier | null;
  is_ansar: boolean;
  is_active: boolean;
  created_at: string;
}

export type Database = {
  // supabase-js 2.116 reads its PostgREST feature level from here and
  // strips this key before resolving schemas. Generated types include
  // it; hand-written ones need it too.
  __InternalSupabase: { PostgrestVersion: "12" };

  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        // supabase-js checks for this key when it matches a table
        // against its GenericTable shape. Without it the whole table
        // resolves to `never` and every query on it fails to compile
        // with a message that does not mention relationships at all.
        Relationships: [];
      };
    };
    // These are `{}` and NOT `Record<string, never>`.
    //
    // supabase-js resolves a table name against `Tables & Views`. A
    // `Record<string, never>` carries an index signature over every
    // string key, so that intersection turns every table into
    // `profiles & never` — i.e. `never` — and every query on it fails
    // to compile with an error that points at the column, never at
    // this line. `{}` has no keys, so the intersection is a no-op.
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
