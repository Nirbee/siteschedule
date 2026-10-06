import { bodyLines, numberedItems } from "./format";

/**
 * Homework/topics text: one item per line, shown as a list when there are several. Numbered
 * lists (questions for a control event pasted from the chat) keep their own numbers; lines
 * above the first number are shown as a heading.
 */
export function TaskText({ text, className = "" }: { text: string; className?: string }) {
  const numbered = numberedItems(text);
  if (numbered) {
    return (
      <div className={`flex flex-col gap-2 leading-relaxed ${className}`}>
        {numbered.intro.map((line, i) => (
          <p key={i} className="font-semibold">
            {line}
          </p>
        ))}
        <ol className="flex list-decimal flex-col gap-1 pl-7 marker:text-muted">
          {numbered.items.map((item, i) => (
            <li key={i} value={item.n}>
              {item.text}
            </li>
          ))}
        </ol>
      </div>
    );
  }
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
