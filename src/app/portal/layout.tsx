import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Customer portal · Orion Group", template: "%s · Orion Group" }, robots: { index: false } };

/** Aftersales customer portal: its own simple frame, separate from the staff app. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <Link href="/portal" className="flex min-w-0 items-center gap-3 rounded-lg">
            <Logo className="h-7" />
            <span className="truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">Customer portal</span>
          </Link>
          {signedIn && (
            <form action="/portal/signout" method="post" className="ml-auto">
              <button type="submit" className="flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground">
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
        {children}
      </main>
      <footer className="pb-safe px-4 py-6 text-center text-xs text-muted-foreground">Orion Group · Aftersales · support@oriongroup.com.mt</footer>
    </div>
  );
}
