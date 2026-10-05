import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { buttonClass } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Нет доступа" };

export default async function NoAccessPage() {
  const { user } = await requireUser();
  if (user.hasAccess) redirect("/");

  return (
    <AuthCard title="Доступ только для группы">
      <p className="mb-3 text-ink-2">
        Сайт открыт для участников Telegram-чата группы, а мы не нашли вас в нём.
      </p>
      <p className="mb-5 text-ink-2">
        Если вы в чате, выйдите и войдите снова — участие проверяется при входе. Если не получается,
        напишите старосте: доступ можно выдать вручную.
      </p>
      <form action={logoutAction}>
        <button type="submit" className={buttonClass("secondary", "w-full")}>
          Выйти и войти снова
        </button>
      </form>
    </AuthCard>
  );
}
