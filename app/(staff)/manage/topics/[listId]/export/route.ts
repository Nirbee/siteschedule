import { getMember, isStaff } from "@/lib/auth/current";
import { getTopicList, exportRows } from "@/lib/services/topics";
import { contentDisposition } from "@/lib/storage/serve";
import { shortDate } from "@/lib/schedule/format";
import { buildXlsx } from "@/lib/topics/xlsx";

/** The list as .xlsx in the starostas' format: № | Тема | Подтема | ФИО студента | Группа. */
export async function GET(_request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const current = await getMember();
  if (!current || !isStaff(current.user.role)) return new Response("Not found", { status: 404 });
  const { listId } = await params;
  const list = /^[0-9a-f-]{36}$/.test(listId)
    ? await getTopicList(listId, current.user)
    : undefined;
  if (!list) return new Response("Not found", { status: 404 });

  const rows = await exportRows(list.id, current.user.id);
  const withDates = rows.some((r) => r.dueDate);
  const header = ["№", "Тема", "", "ФИО студента", "Группа", ...(withDates ? ["Сдача"] : [])];
  const body = rows.map((r) => [
    String(r.n),
    r.title,
    r.details ?? "",
    r.name,
    r.group,
    ...(withDates ? [r.dueDate ? shortDate(r.dueDate) : ""] : []),
  ]);
  // Like the hand-made tables: «Тема» spans both columns when there is no subtopic.
  const merges = ["B1:C1", ...rows.flatMap((r, i) => (r.details ? [] : [`B${i + 2}:C${i + 2}`]))];
  const file = buildXlsx({
    name: "Список тем",
    widths: [5, 34, 34, 36, 9, ...(withDates ? [12] : [])],
    rows: [header, ...body],
    merges,
  });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(
        "attachment",
        `${list.title} — ${list.subjectName}.xlsx`,
      ),
      "Cache-Control": "private, no-store",
    },
  });
}
