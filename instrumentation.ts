/** Server start: finish PDF copies that were queued before a restart, then re-check every 5 min. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { kickViewCopies } = await import("@/lib/ingest/convert");
  setTimeout(kickViewCopies, 10_000);
  setInterval(kickViewCopies, 5 * 60_000).unref();
}
