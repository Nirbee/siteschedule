/**
 * Server start: finish PDF copies and search indexing queued before a restart,
 * then re-check every 5 min.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { kickViewCopies } = await import("@/lib/ingest/convert");
  const { kickTextIndex } = await import("@/lib/ingest/text-index");
  const kick = () => {
    kickViewCopies();
    kickTextIndex();
  };
  setTimeout(kick, 10_000);
  setInterval(kick, 5 * 60_000).unref();
}
