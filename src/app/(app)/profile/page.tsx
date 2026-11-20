import { Building2, ChevronRight, ListChecks, LogOut, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { ProfileForm } from "@/components/profile/profile-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, ROLE_LABEL, ROLES } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireActiveProfile();
  const [avatarUrl] = await resolveAvatarUrls(await createClient(), [profile.avatar_url]);
  const roleInfo = ROLES.find((r) => r.value === profile.role);

  return (
    <>
      <PageHeader title="Your profile" />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <AvatarUpload profile={profile} avatarUrl={avatarUrl} />
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Your access level</CardTitle>
              <CardDescription>{roleInfo?.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge className="text-sm">{ROLE_LABEL[profile.role]}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <ThemeToggle />
            </CardContent>
          </Card>

          {[
            { href: "/my-tasks", label: "My Tasks", icon: ListChecks, show: true },
            { href: "/clients", label: "Clients", icon: Building2, show: can.createProjects(profile.role) },
          ]
            .filter((l) => l.show)
            .map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
                <Card className="hover:bg-accent/50">
                  <CardContent className="flex items-center gap-3 p-5">
                    <Icon className="size-5 text-primary" aria-hidden />
                    <span className="flex-1 font-medium">{label}</span>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  </CardContent>
                </Card>
              </Link>
            ))}

          {can.manageUsers(profile.role) && (
            <Link href="/admin" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
              <Card className="hover:bg-accent/50">
                <CardContent className="flex items-center gap-3 p-5">
                  <ShieldCheck className="size-5 text-primary" aria-hidden />
                  <span className="flex-1 font-medium">Admin: users &amp; settings</span>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          )}

          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" className="w-full">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
