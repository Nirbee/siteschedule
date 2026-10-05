import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-[18px]">
      <p className="eyebrow">Ошибка 404</p>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.03em]">Такой страницы нет</h1>
      <Link href="/" className="font-semibold">
        На главную
      </Link>
    </main>
  );
}
