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
  /** Daily update reminder (database update 0023). */
  daily_reminder_enabled?: boolean;
  daily_reminder_time?: string; // "16:30:00"
  daily_reminder_sent_on?: string | null;
  reminder_checked_at?: string | null;
  /** When unread important messages are sent again (database update 0027). */
  message_repeat_from?: string; // "07:00:00"
  message_repeat_to?: string;
  message_repeat_weekdays_only?: boolean;
  message_repeat_days?: number;
};

import type { Client, ColumnKind, CustomColumn, Priority, StatusLabel } from "./board";

export type GroupRow = { id: string; project_id: string; name: string; color: string; position: number; collapsed: boolean; created_at: string };
export type RepeatRule = "daily" | "weekdays" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
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
  repeat_rule: RepeatRule | null;
  repeat_until: string | null;
  repeated_from: string | null;
  is_internal: boolean;
};
export type MaterialRequestRow = {
  id: string;
  project_id: string;
  number: number;
  requested_by: string;
  status: "requested" | "ordered" | "partly_delivered" | "delivered" | "rejected" | "cancelled";
  needed_by: string | null;
  urgent: boolean;
  delivery_note: string | null;
  supplier: string | null;
  po_number: string | null;
  expected_date: string | null;
  reject_reason: string | null;
  copied_from: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};
export type MaterialItemRow = { id: string; request_id: string; position: number; name: string; quantity: number; unit: string; note: string | null; delivered_qty: number; product_id: string | null };
export type ProductRow = { id: string; name: string; unit: string; category: string | null; code: string | null; active: boolean; created_by: string | null; created_at: string; updated_at: string };
export type MaterialPhotoRow = { id: string; request_id: string; project_id: string; storage_path: string; width: number | null; height: number | null; size_bytes: number | null; uploaded_by: string | null; created_at: string };
export type MaterialCommentRow = { id: string; request_id: string; author_id: string; body: string; created_at: string };
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
      job_secrets: Table<{ name: string; token: string }>;
      material_request_documents: Table<
        {
          id: string;
          request_id: string;
          project_id: string;
          kind: "delivery_note" | "invoice" | "other";
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
          created_at: string;
        },
        { id: string; request_id: string; project_id: string; kind?: "delivery_note" | "invoice" | "other"; storage_path: string; file_name: string; mime_type?: string | null; size_bytes?: number | null; uploaded_by?: string }
      >;
      audit_log: Table<{
        id: number;
        created_at: string;
        actor_id: string | null;
        actor_name: string;
        action: string;
        entity: string;
        entity_id: string | null;
        project_id: string | null;
        project_name: string | null;
        title: string | null;
        changes: Json;
      }>;
      deleted_tasks: Table<{
        task_id: string;
        project_id: string;
        project_name: string | null;
        title: string;
        deleted_at: string;
        deleted_by: string | null;
        deleted_by_name: string | null;
        snapshot: Json;
        restored_at: string | null;
        restored_by: string | null;
      }>;
      general_tasks: Table<
        {
          id: string;
          title: string;
          description: string | null;
          client_id: string | null;
          status: "not_started" | "working" | "waiting" | "done";
          priority: Priority;
          due_date: string | null;
          checklist: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        },
        { title: string; description?: string | null; client_id?: string | null; due_date?: string | null; priority?: Priority; created_by?: string; checklist?: Json }
      >;
      general_task_assignees: Table<{ task_id: string; user_id: string; added_at: string }, { task_id: string; user_id: string }>;
      general_task_comments: Table<{ id: string; task_id: string; author_id: string | null; body: string; created_at: string }, { task_id: string; body: string; author_id?: string }>;
      announcements: Table<{
        id: string;
        title: string;
        body: string;
        remind_every_hours: number | null;
        created_by: string | null;
        created_at: string;
        repeat_from?: string;
        repeat_to?: string;
        repeat_weekdays_only?: boolean;
        repeat_days?: number;
      }>;
      announcement_recipients: Table<{ announcement_id: string; user_id: string; read_at: string | null; last_sent_at: string; times_sent: number }>;
      projects: Table<ProjectRow, Partial<ProjectRow> & { name: string }>;
      project_members: Table<{ project_id: string; user_id: string; added_by: string | null; added_at: string }>;
      clients: Table<Client & { created_by: string | null }, Partial<Client & { created_by: string | null }> & { name: string }>;
      groups: Table<GroupRow, Partial<GroupRow> & { project_id: string; name: string }>;
      tasks: Table<TaskRow, Partial<TaskRow> & { project_id: string; group_id: string; title: string }>;
      material_requests: Table<MaterialRequestRow, Partial<MaterialRequestRow> & { id: string; project_id: string }>;
      products: Table<ProductRow, Partial<ProductRow> & { name: string }>;
      material_request_items: Table<MaterialItemRow, Partial<MaterialItemRow> & { request_id: string; name: string; quantity: number }>;
      material_request_photos: Table<MaterialPhotoRow, Partial<MaterialPhotoRow> & { id: string; request_id: string; project_id: string; storage_path: string }>;
      material_request_comments: Table<MaterialCommentRow, Partial<MaterialCommentRow> & { request_id: string; body: string }>;
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
      notifications: Table<
        {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          project_id: string | null;
          task_id: string | null;
          actor_id: string | null;
          read_at: string | null;
          pushed_at: string | null;
          created_at: string;
        },
        { user_id: string; type: string; title: string; body?: string | null; link?: string | null; project_id?: string | null; task_id?: string | null; actor_id?: string | null }
      >;
      notification_preferences: Table<
        { user_id: string; push_enabled: boolean; email_digest: boolean; types: Json; quiet_hours_from: string | null; quiet_hours_to: string | null; updated_at: string },
        { user_id?: string; push_enabled?: boolean; email_digest?: boolean; types?: Json; quiet_hours_from?: string | null; quiet_hours_to?: string | null }
      >;
      push_subscriptions: Table<
        { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; created_at: string; last_used_at: string | null },
        { endpoint: string; p256dh: string; auth: string; user_id?: string; user_agent?: string | null }
      >;
      personal_todos: Table<
        { id: string; user_id: string; title: string; due_date: string | null; done_at: string | null; position: number; created_at: string; updated_at: string },
        { title: string; user_id?: string; due_date?: string | null; done_at?: string | null; position?: number }
      >;
      personal_notes: Table<
        { id: string; user_id: string; title: string; body: string; color: string; pinned: boolean; created_at: string; updated_at: string },
        { user_id?: string; title?: string; body?: string; color?: string; pinned?: boolean }
      >;
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
      create_due_notifications: { Args: Record<string, never>; Returns: number };
      queue_daily_update_reminders: { Args: { p_now?: string }; Returns: number };
      touch_last_seen: { Args: Record<string, never>; Returns: undefined };
      restore_task: { Args: { p_task: string }; Returns: string };
      create_variation: {
        Args: { p_project: string; p_source: string | null; p_title: string | null; p_reason: string | null; p_requested_by?: string | null; p_requested_on?: string | null };
        Returns: string;
      };
      receive_material_request: { Args: { p_id: string; p_deliveries: Json; p_note?: string | null }; Returns: string };
      cleanup_audit: { Args: Record<string, never>; Returns: undefined };
      get_general_tasks: { Args: { p_all?: boolean }; Returns: Json };
      create_general_task_due_notifications: { Args: Record<string, never>; Returns: number };
      queue_announcement_reminders: { Args: { p_now?: string }; Returns: number };
      send_announcement: {
        Args: {
          p_title: string;
          p_body: string;
          p_user_ids: string[];
          p_remind_every_hours?: number | null;
          p_repeat_from?: string | null;
          p_repeat_to?: string | null;
          p_weekdays_only?: boolean | null;
          p_repeat_days?: number | null;
        };
        Returns: string;
      };
      mark_announcement_read: { Args: { p_id: string }; Returns: undefined };
      get_user_activity: { Args: Record<string, never>; Returns: Json };
      claim_push_batch: { Args: { p_limit?: number }; Returns: Json };
      claim_chat_push_batch: { Args: { p_limit?: number }; Returns: Json };
      get_channel_media: { Args: { p_channel: string; p_kind?: string; p_before?: string | null; p_limit?: number }; Returns: Json };
      copy_task_to_projects: { Args: { p_task: string; p_targets: Json }; Returns: Json };
      create_material_request: {
        Args: { p_id: string; p_project: string; p_needed_by: string | null; p_urgent: boolean; p_note: string; p_items: Json; p_copied_from: string | null };
        Returns: Json;
      };
      get_material_requests: { Args: { p_project: string | null; p_open_only: boolean }; Returns: Json };
      get_material_request: { Args: { p_id: string }; Returns: Json };
      get_project_materials: { Args: { p_project: string }; Returns: Json };
      move_task: { Args: { p_task: string; p_group: string; p_before: string | null }; Returns: undefined };
      insert_task_at: { Args: { p_anchor: string; p_where: string; p_title: string; p_start: string | null; p_due: string | null; p_rewire: boolean }; Returns: string };
      get_material_report: { Args: { p_project: string; p_from: string | null; p_to: string | null }; Returns: Json };
      get_digest_recipients: { Args: Record<string, never>; Returns: Json };
      cleanup_old_data: { Args: Record<string, never>; Returns: undefined };
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
