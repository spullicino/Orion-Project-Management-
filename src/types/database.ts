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

import type { Client, ColumnKind, CustomColumn, Priority, StatusLabel } from "./board";

export type GroupRow = { id: string; project_id: string; name: string; color: string; position: number; collapsed: boolean; created_at: string };
export type TaskRow = {
  id: string;
  project_id: string;
  group_id: string;
  title: string;
  description: string | null;
  status_id: string | null;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  position: number;
  custom_values: Json;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type ChecklistRow = { id: string; task_id: string; title: string; is_done: boolean; position: number; created_at: string };
export type CommentRow = { id: string; task_id: string; author_id: string; body: string; created_at: string; edited_at: string | null };
export type AttachmentRow = {
  id: string;
  task_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
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
  hidden_columns: string[];
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
      clients: Table<Client & { created_by: string | null }, Partial<Client & { created_by: string | null }> & { name: string }>;
      groups: Table<GroupRow, Partial<GroupRow> & { project_id: string; name: string }>;
      tasks: Table<TaskRow, Partial<TaskRow> & { project_id: string; group_id: string; title: string }>;
      status_labels: Table<StatusLabel, Partial<StatusLabel> & { project_id: string; name: string; color: string }>;
      project_columns: Table<CustomColumn, Partial<CustomColumn> & { project_id: string; name: string; kind: ColumnKind }>;
      task_assignees: Table<{ task_id: string; user_id: string; assigned_by: string | null; assigned_at: string }>;
      task_dependencies: Table<{ task_id: string; depends_on_task_id: string; created_at: string }>;
      task_checklist_items: Table<ChecklistRow, Partial<ChecklistRow> & { task_id: string; title: string }>;
      comments: Table<CommentRow, Partial<CommentRow> & { task_id: string; body: string }>;
      milestones: Table<
        { id: string; project_id: string; title: string; description: string | null; date: string; color: string; created_by: string | null; created_at: string },
        { project_id: string; title: string; date: string; color?: string; description?: string | null; created_by?: string | null }
      >;
      share_links: Table<
        {
          id: string;
          project_id: string;
          token: string;
          label: string | null;
          hide_owners: boolean;
          hide_internal_notes: boolean;
          expires_at: string | null;
          revoked_at: string | null;
          last_viewed_at: string | null;
          created_by: string | null;
          created_at: string;
        },
        {
          project_id: string;
          label?: string | null;
          hide_owners?: boolean;
          hide_internal_notes?: boolean;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_by?: string | null;
        }
      >;
      daily_updates: Table<
        {
          id: string;
          project_id: string;
          author_id: string;
          work_date: string;
          work_done: string;
          hours: number | null;
          issues: string | null;
          client_ref: string | null;
          created_at: string;
          updated_at: string;
        },
        { project_id: string; work_done: string; author_id?: string; work_date?: string; hours?: number | null; issues?: string | null; client_ref?: string | null }
      >;
      daily_update_photos: Table<
        {
          id: string;
          daily_update_id: string;
          project_id: string;
          storage_path: string;
          width: number | null;
          height: number | null;
          size_bytes: number | null;
          caption: string | null;
          uploaded_by: string | null;
          created_at: string;
        },
        {
          id?: string;
          daily_update_id: string;
          project_id: string;
          storage_path: string;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          caption?: string | null;
          uploaded_by?: string | null;
        }
      >;
      channels: Table<
        { id: string; type: "project" | "management" | "general"; project_id: string | null; name: string; description: string | null; archived: boolean; created_by: string | null; created_at: string },
        { type: "management" | "general"; name: string; description?: string | null; created_by?: string | null; archived?: boolean }
      >;
      channel_members: Table<{ channel_id: string; user_id: string; last_read_at: string; muted: boolean }, { channel_id: string; user_id?: string; last_read_at?: string; muted?: boolean }>;
      messages: Table<
        {
          id: string;
          channel_id: string;
          author_id: string;
          parent_id: string | null;
          task_id: string | null;
          body: string;
          mentions: string[];
          edited_at: string | null;
          deleted_at: string | null;
          created_at: string;
        },
        { channel_id: string; body: string; author_id?: string; parent_id?: string | null; task_id?: string | null; mentions?: string[] }
      >;
      message_attachments: Table<{ id: string; message_id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; width: number | null; height: number | null; created_at: string }>;
      message_reactions: Table<{ message_id: string; user_id: string; emoji: string; created_at: string }, { message_id: string; emoji: string; user_id?: string }>;
      attachments: Table<AttachmentRow, Partial<AttachmentRow> & { task_id: string; storage_path: string; file_name: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      get_project_board: { Args: { p_project: string }; Returns: Json };
      list_projects: { Args: { p_include_archived?: boolean; p_templates?: boolean }; Returns: Json };
      get_my_tasks: { Args: Record<string, never>; Returns: Json };
      get_shared_project: { Args: { p_token: string }; Returns: Json };
      get_daily_feed: {
        Args: {
          p_project?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_author?: string | null;
          p_before_date?: string | null;
          p_before_created?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      get_project_photos: {
        Args: { p_project: string; p_from?: string | null; p_to?: string | null; p_before_created?: string | null; p_limit?: number };
        Returns: Json;
      };
      get_daily_status: { Args: { p_date: string }; Returns: Json };
      get_postable_projects: { Args: Record<string, never>; Returns: Json };
      list_my_channels: { Args: Record<string, never>; Returns: Json };
      get_unread_total: { Args: Record<string, never>; Returns: number };
      get_channel_messages: { Args: { p_channel: string; p_before?: string | null; p_limit?: number }; Returns: Json };
      get_channel_messages_since: { Args: { p_channel: string; p_since: string }; Returns: Json };
      get_message: { Args: { p_message: string }; Returns: Json };
      get_thread: { Args: { p_parent: string }; Returns: Json };
      get_channel_people: { Args: { p_channel: string }; Returns: Json };
      mark_channel_read: { Args: { p_channel: string }; Returns: undefined };
      send_chat_message: {
        Args: {
          p_id: string;
          p_channel: string;
          p_body: string;
          p_parent?: string | null;
          p_task?: string | null;
          p_mentions?: string[];
          p_attachments?: Json;
        };
        Returns: Json;
      };
      get_task_detail: { Args: { p_task: string }; Returns: Json };
      duplicate_project: {
        Args: { p_source: string; p_name: string; p_as_template?: boolean; p_start_date?: string | null; p_client_id?: string | null };
        Returns: string;
      };
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
