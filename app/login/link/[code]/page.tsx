import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { buttonClass } from "@/components/ui/button";
import { loginWithLinkAction } from "./actions";

export const metadata: Metadata = { title: "Вход по ссылке" };

/**
 * Login link from an admin. Opening the page does not log in: link previews (e.g. in Telegram)
 * fetch URLs too, so the one-time link is spent only by pressing the button.
 */
export default async function LoginLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ code }, { error }] = await Promise.all([params, searchParams]);

  if (error) {
    return (
      <AuthCard title="Ссылка не работает">
        <p className="mb-5 text-ink-2">
          Ссылка для входа уже использована или устарела. Попросите администратора создать новую.
        </p>
        <Link href="/login" className={buttonClass("secondary", "w-full")}>
          К обычному входу
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Вход по ссылке">
      <p className="mb-5 text-ink-2">
        Администратор создал для вас одноразовую ссылку. Нажмите кнопку, чтобы войти на этом
        устройстве.
      </p>
      <form action={loginWithLinkAction}>
        <input type="hidden" name="code" value={code} />
        <button type="submit" className={buttonClass("primary", "w-full")}>
          Войти
        </button>
      </form>
    </AuthCard>
  );
}
