export function PageHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="mb-6">
      {eyebrow ? <p className="mb-1 eyebrow">{eyebrow}</p> : null}
      <h1 className="font-display text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[36px]">
        {title}
      </h1>
    </div>
  );
}
