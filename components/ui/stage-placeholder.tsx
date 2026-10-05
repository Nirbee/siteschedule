/** Empty-state card for sections that are not implemented yet. */
export function StagePlaceholder({
  stage,
  children,
}: {
  stage: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
      <p className="mb-2 eyebrow">Появится на этапе {stage}</p>
      <p className="text-ink-2">{children}</p>
    </div>
  );
}
