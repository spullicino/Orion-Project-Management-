/**
 * Database types for the Supabase client.
 *
 * Hand-maintained for the tables used so far. Once your Supabase project exists
 * you can regenerate the full file with:
 *   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "manager" | "technician" | "basic";
export type UserStatus = "pending" | "active" | "deactivated";

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole;
  status: UserStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Invite = {
  id: string;
  email: string;
  role: AppRole;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type AppSettings = {
  id: boolean;
  company_name: string;
  basic_can_post_chat: boolean;
  daily_update_weekdays: number[];
  timezone: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  client_id: string | null;
  status: "active" | "on_hold" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  color: string;
  is_template: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Partial<Profile> & { id: string; email: string }>;
      invites: Table<Invite, Partial<Invite> & { email: string }>;
      app_settings: Table<AppSettings>;
      projects: Table<ProjectRow, Partial<ProjectRow> & { name: string }>;
      project_members: Table<{ project_id: string; user_id: string; added_by: string | null; added_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: AppRole;
      user_status: UserStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
