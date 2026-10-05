import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/current";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireRole("starosta", "admin");
  return <AppShell isStaff>{children}</AppShell>;
}
