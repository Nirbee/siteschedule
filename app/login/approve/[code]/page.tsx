import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { buttonClass } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current";
import { approveQrAction } from "./actions";

export const metadata: Metadata = { title: "Вход на другом устройстве" };

const RESULTS: Record<string, string> = {
  confirmed: "Готово! Вход на другом устройстве выполнен — можно вернуться к нему.",
  expired: "Этот QR-код уже использован или устарел. Обновите код на другом устройстве.",
  not_found: "Код не найден. Отсканируйте QR ещё раз.",
};

export default async function ApproveQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const [{ code }, { result }, current] = await Promise.all([
    params,
    searchParams,
    getCurrentUser(),
  ]);

  if (result && RESULTS[result]) {
    return (
      <AuthCard title="Вход на другом устройстве">
        <p className="mb-5 text-ink-2">{RESULTS[result]}</p>
        <Link href="/" className={buttonClass("secondary", "w-full")}>
          На главную
        </Link>
      </AuthCard>
    );
  }

  if (!current) {
    return (
      <AuthCard title="Сначала войдите">
        <p className="mb-5 text-ink-2">
          Подтвердить вход на другом устройстве можно только с устройства, где вы уже вошли на сайт.
          Если сайт открылся не в том браузере, откройте эту ссылку там, где вы залогинены.
        </p>
        <Link href="/login" className={buttonClass("secondary", "w-full")}>
          Войти
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Войти на другом устройстве?">
      <p className="mb-2 text-ink-2">
        На другом устройстве будет выполнен вход в аккаунт <b>{current.user.displayName}</b>.
      </p>
      <p className="mb-5 text-[14px] text-cancel">
        Подтверждайте, только если QR-код показан на вашем собственном экране.
      </p>
      <form action={approveQrAction} className="flex flex-col gap-2">
        <input type="hidden" name="code" value={code} />
        <button type="submit" className={buttonClass("primary", "w-full")}>
          Подтвердить вход
        </button>
        <Link href="/" className={buttonClass("ghost", "w-full")}>
          Отмена
        </Link>
      </form>
    </AuthCard>
  );
}
