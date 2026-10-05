import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/current";
import { listGroups, listMembers } from "@/lib/services/members";
import { formatRelativeDay } from "@/lib/time";
import { updateMemberAction } from "./actions";
import { LoginLinkButton } from "./login-link-button";

export const metadata: Metadata = { title: "Пользователи" };

const ROLES = [
  { value: "student", label: "Студент" },
  { value: "starosta", label: "Староста" },
  { value: "admin", label: "Админ" },
] as const;

const fieldClass =
  "h-11 min-w-0 flex-1 rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";

export default async function UsersPage() {
  const { user: me } = await requireRole("admin");
  const [members, groups] = await Promise.all([listMembers(), listGroups()]);

  return (
    <>
      <PageHeader eyebrow="Админ" title="Пользователи" />
      <p className="mb-4 text-muted">Всего: {members.length}</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => {
          const isMe = member.id === me.id;
          const seen = member.lastSeenAt
            ? `заходил(а) ${formatRelativeDay(member.lastSeenAt)}`
            : "ещё не заходил(а)";
          return (
            <li
              key={member.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-[14px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {member.displayName}
                    {isMe ? (
                      <span className="ml-2 text-[13px] font-normal text-muted">(вы)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {member.username ? `@${member.username} · ${seen}` : seen}
                  </p>
                </div>
                <StatusBadge hasAccess={member.hasAccess} isBlocked={member.isBlocked} />
              </div>

              <form action={updateMemberAction} className="flex gap-2">
                <input type="hidden" name="userId" value={member.id} />
                <input type="hidden" name="kind" value="group" />
                <select
                  name="value"
                  defaultValue={member.groupId ?? ""}
                  aria-label="Группа"
                  className={fieldClass}
                >
                  <option value="">Без группы</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.isEnabled ? group.code : `${group.code} (не подключена)`}
                    </option>
                  ))}
                </select>
                <button type="submit" className={buttonClass("secondary")}>
                  OK
                </button>
              </form>

              {isMe ? null : (
                <>
                  <form action={updateMemberAction} className="flex gap-2">
                    <input type="hidden" name="userId" value={member.id} />
                    <input type="hidden" name="kind" value="role" />
                    <select
                      name="value"
                      defaultValue={member.role}
                      aria-label="Роль"
                      className={fieldClass}
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={buttonClass("secondary")}>
                      OK
                    </button>
                  </form>

                  <div className="grid grid-cols-2 gap-2">
                    <Toggle userId={member.id} kind="access" value={!member.hasAccess}>
                      {member.hasAccess ? "Забрать доступ" : "Дать доступ"}
                    </Toggle>
                    <Toggle userId={member.id} kind="blocked" value={!member.isBlocked} danger>
                      {member.isBlocked ? "Разблокировать" : "Заблокировать"}
                    </Toggle>
                  </div>
                  <LoginLinkButton userId={member.id} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Toggle({
  userId,
  kind,
  value,
  danger = false,
  children,
}: {
  userId: string;
  kind: "access" | "blocked";
  value: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={updateMemberAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="value" value={String(value)} />
      <button type="submit" className={buttonClass(danger ? "danger" : "secondary", "w-full px-3")}>
        {children}
      </button>
    </form>
  );
}

function StatusBadge({ hasAccess, isBlocked }: { hasAccess: boolean; isBlocked: boolean }) {
  const [label, className] = isBlocked
    ? ["Заблокирован", "bg-cancel-bg text-cancel"]
    : hasAccess
      ? ["Есть доступ", "bg-add-bg text-add"]
      : ["Нет доступа", "bg-chip text-ink-2"];
  return (
    <span className={`shrink-0 rounded-badge px-2 py-1 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}
