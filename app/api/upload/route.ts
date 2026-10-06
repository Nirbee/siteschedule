import { getMember } from "@/lib/auth/current";
import { ingest } from "@/lib/ingest/ingest";
import { MAX_FILE_BYTES } from "@/lib/ingest/detect";
import { uploadTarget, type UploadResponse } from "@/lib/ingest/upload-target";
import { rateLimit } from "@/lib/rate-limit";
import { isHappening, resolveDay } from "@/lib/schedule/resolve";
import { loadScheduleData } from "@/lib/services/schedule";

const reject = (error: string, status = 400) =>
  Response.json({ status: "rejected", error } satisfies UploadResponse, { status });

/** One photo or file per request (the upload sheet sends them one by one to show progress). */
export async function POST(request: Request) {
  const current = await getMember();
  if (!current) return reject("Нужно войти", 401);
  const { user } = current;
  if (!rateLimit(`upload:${user.id}`, 200, 60 * 60 * 1000)) {
    return reject("Слишком много загрузок за час, попробуйте позже", 429);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 1024 * 1024) {
    return reject("Файл больше 50 МБ", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject("Не удалось прочитать загрузку");
  }
  const file = form.get("file");
  let targetJson: unknown;
  try {
    targetJson = JSON.parse(String(form.get("target") ?? ""));
  } catch {
    targetJson = null;
  }
  const target = uploadTarget.safeParse(targetJson);
  if (!(file instanceof File) || !target.success) return reject("Не выбран файл или пара");

  const data = await loadScheduleData();
  if (!data?.subjects.has(target.data.subjectId)) return reject("Предмет не найден");
  if (target.data.type === "lesson") {
    const { subjectId, date, slotN, startsAt } = target.data;
    const lessonExists = resolveDay(data, date, user.groupId!).some(
      (l) =>
        isHappening(l) &&
        l.subject.id === subjectId &&
        (slotN !== null ? l.slotN === slotN : l.slotN === null && l.time.start === startsAt),
    );
    if (!lessonExists) return reject("Такой пары нет в расписании");
  }

  const result = await ingest({
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    target: target.data,
    uploaderId: user.id,
  });
  if (result.status === "rejected") return reject(result.error, 422);
  return Response.json({ status: result.status, mediaId: result.mediaId } satisfies UploadResponse);
}
