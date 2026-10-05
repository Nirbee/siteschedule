import { Logo } from "@/components/logo";

/** Centered card for login and access screens (no app navigation). */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-[18px] py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="rounded-card border border-line bg-surface p-5 md:p-7">
        <h1 className="mb-2 font-display text-[24px] leading-tight font-bold tracking-[-0.03em]">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}
