// Imports the course chat history from a Telegram Desktop export (JSON + photos/ + files/).
// Usage: pnpm import:tg <export folder> --topics 1,2,16 [--review 2] [--since 2026-08-31] [--apply]
//   --review: topics with announcements — everything goes to «Неразобранное» with a hint.
// Without --apply it is a dry run: nothing is written, a report is printed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseExport } from "../lib/ingest/tg-export";
import { moscowInstant } from "../lib/schedule/dates";
import { getCurrentSemester } from "../lib/services/schedule";
import { applyImport, loadSortContext, planImport, reportPlan } from "../lib/services/tg-import";

// PDF copies and OCR are done by the site in the background, not by this process.
process.env.PARA_NO_BACKGROUND_JOBS = "1";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const folder = process.argv[2];
  const topicsArg = arg("topics");
  if (!folder || folder.startsWith("--") || !topicsArg) {
    console.error(
      "Usage: import-tg <export folder> --topics 1,2,16 [--review 2] [--since YYYY-MM-DD] [--apply]\n" +
        "  --topics  topic ids to import (1 = General); others (flood, other groups) are skipped\n" +
        "  --review  announcement topics: everything goes to «Неразобранное» with a hint",
    );
    process.exit(1);
  }
  const topics = new Set(topicsArg.split(",").map((t) => Number(t.trim())));
  const semester = await getCurrentSemester();
  const sinceDate = arg("since") ?? semester?.startsOn;
  if (!sinceDate) throw new Error("No current semester: pass --since YYYY-MM-DD");
  const since = moscowInstant(sinceDate, "00:00");

  const raw: unknown = JSON.parse(readFileSync(path.join(folder, "result.json"), "utf8"));
  const parsed = parseExport(raw, { topics, since });
  console.info(`Chat ${parsed.chatId}; topics in export:`, Object.fromEntries(parsed.topics));
  console.info("Skipped:", parsed.skipped);

  const ctx = await loadSortContext();
  if (!ctx) throw new Error("Set up the semester and the schedule first");
  const review = new Set(
    (arg("review") ?? "")
      .split(",")
      .map((t) => Number(t.trim()))
      .filter((t) => t > 0),
  );
  const planned = planImport(parsed.items, ctx, { reviewTopics: review });
  const report = await reportPlan(planned, ctx, parsed.chatId);
  console.info("Plan:", JSON.stringify(report, null, 2));

  if (!process.argv.includes("--apply")) {
    console.info("Dry run — nothing written. Add --apply to import.");
    return;
  }
  const counts = await applyImport(folder, parsed.chatId, planned, (done, total) => {
    if (done % 25 === 0 || done === total) console.info(`  ${done}/${total}`);
  });
  console.info("Imported:", counts);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
