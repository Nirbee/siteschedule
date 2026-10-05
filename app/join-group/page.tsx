import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { buttonClass } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current";
import { getGroup, listGroups } from "@/lib/services/members";
import { chooseGroupAction } from "./actions";

export const metadata: Metadata = { title: "Выбор группы" };

export default async function JoinGroupPage() {
  const { user } = await requireUser();
  if (!user.hasAccess) redirect("/no-access");
  if (user.groupId && (await getGroup(user.groupId))?.isEnabled) redirect("/");

  const groups = await listGroups({ enabledOnly: true });

  return (
    <AuthCard title={`Привет, ${user.firstName}!`}>
      <p className="mb-5 text-ink-2">
        Выберите свою учебную группу — от неё зависит расписание. Поменять потом может админ.
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <form key={group.id} action={chooseGroupAction}>
            <input type="hidden" name="groupId" value={group.id} />
            <button type="submit" className={buttonClass("secondary", "w-full font-mono")}>
              {group.code}
            </button>
          </form>
        ))}
      </div>
      <p className="mt-5 text-[14px] text-muted">
        Вашей группы нет в списке? Значит, она пока не подключена к сайту — напишите старосте.
      </p>
      <form action={logoutAction} className="mt-3">
        <button type="submit" className={buttonClass("ghost", "w-full")}>
          Выйти
        </button>
      </form>
    </AuthCard>
  );
}
