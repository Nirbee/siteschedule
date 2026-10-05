import { AppShell } from "@/components/app-shell";
import { isStaff, requireMember } from "@/lib/auth/current";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireMember();
  return <AppShell isStaff={isStaff(user.role)}>{children}</AppShell>;
}
