// Usage: pnpm schedule:import data/private/schedule.json
import { readFileSync } from "node:fs";
import { importSchedule } from "../lib/services/schedule-import";

const path = process.argv[2];
if (!path) {
  console.error("Usage: pnpm schedule:import <file.json>");
  process.exit(1);
}

importSchedule(JSON.parse(readFileSync(path, "utf8")))
  .then((report) => {
    console.info("Schedule imported:", JSON.stringify(report));
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
