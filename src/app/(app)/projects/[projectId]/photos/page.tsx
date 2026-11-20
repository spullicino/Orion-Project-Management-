import type { Metadata } from "next";
import { PhotoGallery } from "@/components/diary/photo-gallery";
import { requireActiveProfile } from "@/lib/auth/session";
import { getProjectPhotos } from "@/lib/data/diary";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireActiveProfile();
  const photos = await getProjectPhotos({ project: projectId });
  return <PhotoGallery projectId={projectId} initial={photos} />;
}
