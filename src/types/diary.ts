export type Person = { first_name: string | null; last_name: string | null; email: string | null; avatar_url?: string | null };

export type DiaryPhoto = {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  /** Signed URLs, added on the server. */
  thumb_url?: string | null;
  full_url?: string | null;
};

export type DailyUpdate = {
  id: string;
  project_id: string;
  author_id: string;
  work_date: string;
  work_done: string;
  hours: number | null;
  issues: string | null;
  created_at: string;
  updated_at: string;
  project: { id: string; name: string; color: string };
  author: Person;
  author_avatar_src?: string | null;
  photos: DiaryPhoto[];
};

export type GalleryPhoto = DiaryPhoto & {
  created_at: string;
  work_date: string;
  daily_update_id: string;
  author: Person;
};

export type DailyStatus = {
  project: { id: string; name: string; color: string };
  update_count: number;
  people: (Person & { user_id: string; posted: boolean; avatar_src?: string | null })[];
}[];

export type FeedQuery = {
  project?: string | null;
  from?: string | null;
  to?: string | null;
  author?: string | null;
  before?: { date: string; created: string } | null;
  limit?: number;
};

export const thumbPath = (storagePath: string) => storagePath.replace(/\.jpg$/, "_thumb.jpg");
