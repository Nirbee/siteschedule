/** Card for a section that is not ready yet. */
export function ComingSoon({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
      <p className="mb-2 eyebrow">Скоро</p>
      <p className="text-ink-2">{children}</p>
    </div>
  );
}
