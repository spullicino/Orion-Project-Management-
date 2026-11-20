import type { MetadataRoute } from "next";

/** Makes Orion Projects installable ("Add to Home Screen" / "Install app"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Orion Projects",
    short_name: "Orion",
    description: "Project management for the Orion Group team.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#2d57a3",
    lang: "en-MT",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Daily Update", short_name: "Daily", url: "/daily-update", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
      { name: "My Tasks", url: "/my-tasks", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
      { name: "Chats", url: "/chats", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
    ],
  };
}
