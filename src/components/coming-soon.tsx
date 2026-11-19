import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ icon: Icon, title, phase, children }: { icon: LucideIcon; title: string; phase: number; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-7" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-muted-foreground">{children}</p>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Coming in phase {phase}</span>
      </CardContent>
    </Card>
  );
}
