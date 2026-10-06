import { getMember } from "@/lib/auth/current";
import { teacherPhotoKey } from "@/lib/services/teachers";
import { serveObject } from "@/lib/storage/serve";

/** A teacher's photo; like all files, only for members. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getMember())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const key = /^[0-9a-f-]{36}$/.test(id) ? await teacherPhotoKey(id) : null;
  if (!key) return new Response("Not found", { status: 404 });
  return serveObject(key, { mime: "image/webp" });
}
