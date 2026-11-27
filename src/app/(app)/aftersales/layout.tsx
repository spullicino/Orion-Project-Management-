import { AftersalesTabs } from "@/components/aftersales/aftersales-tabs";
import { requireModule } from "@/lib/modules";

/** Aftersales module: only for people an administrator gave access to (Admin → Modules). */
export default async function AftersalesLayout({ children }: { children: React.ReactNode }) {
  await requireModule("aftersales");
  return (
    <>
      <AftersalesTabs />
      {children}
    </>
  );
}
