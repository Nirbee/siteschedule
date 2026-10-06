import { bodyLines } from "./format";

/** Homework/topics text: one item per line, shown as a list when there are several. */
export function TaskText({ text, className = "" }: { text: string; className?: string }) {
  const lines = bodyLines(text);
  if (lines.length === 1) return <p className={`leading-relaxed ${className}`}>{lines[0]}</p>;
  return (
    <ul
      className={`flex list-disc flex-col gap-1 pl-5 leading-relaxed marker:text-muted ${className}`}
    >
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}
