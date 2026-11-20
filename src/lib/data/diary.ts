import "server-only";
import { dbError } from "@/lib/data/db-errors";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { thumbPath, type DailyStatus, type DailyUpdate, type DiaryPhoto, type FeedQuery, type GalleryPhoto } from "@/types/diary";

type Supa = Awaited<ReturnType<typeof createClient>>;
const SIGN_SECONDS = 60 * 60 * 2;

/** Adds short-lived URLs for each photo's thumbnail and full-size image (one request for all of them). */
export async function signPhotos<T extends DiaryPhoto>(supabase: Supa, photos: T[], opts: { full?: boolean } = { full: true }): Promise<T[]> {
  if (!photos.length) return photos;
  const paths = photos.flatMap((p) => (opts.full ? [p.storage_path, thumbPath(p.storage_path)] : [thumbPath(p.storage_path)]));
  const { data } = await supabase.storage.from("project-files").createSignedUrls(paths, SIGN_SECONDS);
  const urls = new Map((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
  return photos.map((p) => ({
    ...p,
    thumb_url: urls.get(thumbPath(p.storage_path)) ?? null,
    full_url: opts.full ? (urls.get(p.storage_path) ?? null) : null,
  }));
}

export async function getDailyFeed(q: FeedQuery, opts: { fullPhotos?: boolean } = {}): Promise<DailyUpdate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_daily_feed", {
    p_project: q.project ?? null,
    p_from: q.from ?? null,
    p_to: q.to ?? null,
    p_author: q.author ?? null,
    p_before_date: q.before?.date ?? null,
    p_before_created: q.before?.created ?? null,
    p_limit: q.limit ?? 20,
  });
  if (error) throw dbError("Could not load daily updates", error);
  const updates = (data ?? []) as unknown as DailyUpdate[];
  const allPhotos = await signPhotos(supabase, updates.flatMap((u) => u.photos), { full: opts.fullPhotos ?? true });
  const byId = new Map(allPhotos.map((p) => [p.id, p]));
  const avatars = await resolveAvatarUrls(supabase, updates.map((u) => u.author.avatar_url));
  return updates.map((u, i) => ({ ...u, author_avatar_src: avatars[i], photos: u.photos.map((p) => byId.get(p.id) ?? p) }));
}

export async function getProjectPhotos(q: { project: string; from?: string | null; to?: string | null; before?: string | null; limit?: number }): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_photos", {
    p_project: q.project,
    p_from: q.from ?? null,
    p_to: q.to ?? null,
    p_before_created: q.before ?? null,
    p_limit: q.limit ?? 60,
  });
  if (error) throw dbError("Could not load photos", error);
  return signPhotos(supabase, (data ?? []) as unknown as GalleryPhoto[]);
}

export async function getDailyStatus(date: string): Promise<DailyStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_daily_status", { p_date: date });
  if (error) throw dbError("Could not load the daily overview", error);
  if (!data) return null;
  const status = data as unknown as DailyStatus;
  const people = status.flatMap((s) => s.people);
  const urls = await resolveAvatarUrls(supabase, people.map((p) => p.avatar_url));
  let i = 0;
  return status.map((s) => ({ ...s, people: s.people.map((p) => ({ ...p, avatar_src: urls[i++] })) }));
}

export async function getPostableProjects(): Promise<{ id: string; name: string; color: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_postable_projects");
  if (error) throw dbError("Could not load your projects", error);
  return (data ?? []) as unknown as { id: string; name: string; color: string }[];
}
