import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeSwitch } from "@/components/theme-switch";
import { buttonClass } from "@/components/ui/button";
import { logoutAction, logoutOtherDevicesAction } from "@/lib/auth/actions";
import { isStaff, requireMember } from "@/lib/auth/current";
import { deviceLabel } from "@/lib/auth/device-label";
import { listActiveSessions } from "@/lib/services/auth";
import { getGroup } from "@/lib/services/members";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";
import { formatRelativeDay } from "@/lib/time";

export const metadata: Metadata = { title: "Профиль" };

const ROLE_LABELS = { student: "студент", starosta: "староста", admin: "админ" } as const;

export default async function ProfilePage() {
  const { user, sessionId } = await requireMember();
  const [group, devices, cookieStore] = await Promise.all([
    getGroup(user.groupId!),
    listActiveSessions(user.id),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader eyebrow="Профиль" title={user.displayName} />
      <div className="flex max-w-xl flex-col gap-4">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted">Группа</dt>
            <dd className="font-mono font-semibold">{group?.code ?? "—"}</dd>
            <dt className="text-muted">Роль</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
            {user.username ? (
              <>
                <dt className="text-muted">Telegram</dt>
                <dd>@{user.username}</dd>
              </>
            ) : null}
          </dl>
          {isStaff(user.role) ? (
            <Link href="/manage" className={buttonClass("secondary", "mt-4 w-full")}>
              Панель старосты
            </Link>
          ) : null}
        </Card>

        <Card>
          <ThemeSwitch current={theme} />
        </Card>

        <Card>
          <h2 className="mb-1 text-[17px] font-bold">Устройства</h2>
          <p className="mb-3 text-[14px] text-muted">
            Чтобы войти на ноутбуке без Telegram, откройте там сайт, выберите «Войти по QR-коду» и
            отсканируйте код этим телефоном.
          </p>
          <ul className="mb-4 flex flex-col divide-y divide-line">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  {deviceLabel(device.userAgent)}
                  {device.id === sessionId ? (
                    <span className="ml-2 rounded-badge bg-add-bg px-2 py-0.5 text-xs font-bold text-add">
                      это устройство
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[13px] text-muted">
                  {formatRelativeDay(device.lastUsedAt)}
                </span>
              </li>
            ))}
          </ul>
          {devices.length > 1 ? (
            <form action={logoutOtherDevicesAction}>
              <button type="submit" className={buttonClass("secondary", "w-full")}>
                Выйти на остальных устройствах
              </button>
            </form>
          ) : null}
        </Card>

        <form action={logoutAction}>
          <button type="submit" className={buttonClass("danger", "w-full")}>
            Выйти
          </button>
        </form>
      </div>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
      {children}
    </section>
  );
}
