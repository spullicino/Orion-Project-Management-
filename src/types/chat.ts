export type ChannelType = "project" | "management" | "general";

export type ChannelSummary = {
  id: string;
  type: ChannelType;
  name: string;
  description: string | null;
  project_id: string | null;
  project_color: string | null;
  archived: boolean;
  can_post: boolean;
  muted: boolean;
  unread: number;
  last: { body: string; created_at: string; deleted: boolean; has_attachments: boolean; author: string } | null;
};

export type ChatPerson = { user_id: string; first_name: string | null; last_name: string | null; email: string | null; avatar_url: string | null; avatar_src?: string | null };

export type ChatAttachment = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  /** Signed URLs, added on the server. */
  url?: string | null;
  thumb_url?: string | null;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  author: { first_name: string | null; last_name: string | null; email: string | null; avatar_url: string | null } | null;
  author_avatar_src?: string | null;
  attachments: ChatAttachment[];
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  reply_count: number;
  last_reply_at: string | null;
  task: { id: string; title: string; project_id: string; completed: boolean } | null;
  /** Client-only: still being sent. */
  pending?: boolean;
  failed?: boolean;
};

/** Images get a small preview file stored next to them. */
export const isImageAttachment = (a: Pick<ChatAttachment, "mime_type" | "width">) => a.mime_type === "image/jpeg" && a.width !== null;
export const chatThumbPath = (path: string) => path.replace(/\.jpg$/, "_thumb.jpg");
