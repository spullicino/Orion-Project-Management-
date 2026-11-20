import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/** [CSS width, CSS height, pixel ratio] of iPhones/iPads with a matching file in /public/splash. */
const SPLASH: [number, number, number][] = [
  [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2],
  [414, 736, 3], [375, 667, 2], [1024, 1366, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [744, 1133, 2],
];

export const metadata: Metadata = {
  title: { default: "Orion Projects", template: "%s · Orion Projects" },
  description: "Project management for the Orion Group team.",
  applicationName: "Orion Projects",
  appleWebApp: {
    capable: true,
    title: "Orion",
    statusBarStyle: "default",
    // Splash screens for iPhone and iPad (portrait) when opened from the Home Screen.
    startupImage: SPLASH.map(([w, h, dpr]) => ({
      url: `/splash/splash-${w * dpr}x${h * dpr}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2d57a3" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-MT" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" closeButton />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
