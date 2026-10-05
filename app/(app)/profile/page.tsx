import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";
import { ThemeSwitch } from "@/components/theme-switch";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader title="Профиль" />
      <div className="flex max-w-xl flex-col gap-4">
        <section className="rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
          <ThemeSwitch current={theme} />
        </section>
        <StagePlaceholder stage="M1">
          Вход через Telegram, выбор группы, вход на другом устройстве по QR.
        </StagePlaceholder>
      </div>
    </>
  );
}
