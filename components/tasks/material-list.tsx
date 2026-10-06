import type { Route } from "next";
import Link from "next/link";
import { ExternalLink, FileText, Image as ImageIcon, Images } from "lucide-react";
import type { MaterialView } from "@/lib/services/tasks";
import { materialLink, type MaterialLink } from "./format";

const ICONS = { file: FileText, photo: ImageIcon, note: Images, link: ExternalLink };

/** Materials of a homework or a control event: chips (compact) or full-width rows. */
export function MaterialList({
  materials,
  variant = "chips",
}: {
  materials: MaterialView[];
  variant?: "chips" | "rows";
}) {
  if (materials.length === 0) return null;
  const links = materials.map((m) => ({ id: m.id, ...materialLink(m) }));
  if (variant === "rows") {
    return (
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.id}>
            <MaterialAnchor
              link={link}
              className="flex min-h-[56px] items-center gap-3 rounded-card border border-line bg-surface px-[14px] py-2.5 text-ink no-underline hover:bg-surface-muted"
            >
              <Icon kind={link.kind} size={20} />
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-semibold">{link.label}</span>
                {link.detail ? <span className="text-[13px] text-muted">{link.detail}</span> : null}
              </span>
            </MaterialAnchor>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {links.map((link) => (
        <li key={link.id} className="max-w-full">
          <MaterialAnchor
            link={link}
            className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] font-semibold text-ink-2 no-underline hover:bg-chip"
          >
            <Icon kind={link.kind} size={15} />
            <span className="truncate">{link.label}</span>
            {link.detail ? (
              <span className="shrink-0 font-normal text-muted">{link.detail}</span>
            ) : null}
          </MaterialAnchor>
        </li>
      ))}
    </ul>
  );
}

function Icon({ kind, size }: { kind: MaterialLink["kind"]; size: number }) {
  const Component = ICONS[kind];
  return <Component size={size} className="shrink-0 text-muted" aria-hidden />;
}

function MaterialAnchor({
  link,
  className,
  children,
}: {
  link: MaterialLink;
  className: string;
  children: React.ReactNode;
}) {
  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link href={link.href as Route} className={className}>
      {children}
    </Link>
  );
}
