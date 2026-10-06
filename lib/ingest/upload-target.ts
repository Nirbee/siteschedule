import { z } from "zod";
import { clockTime, isoDate, lessonKind } from "@/lib/schedule/inputs";

/** Where a site upload goes; sent by the upload sheet as JSON next to the file. */
export const uploadTarget = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lesson"),
    subjectId: z.uuid(),
    date: isoDate,
    slotN: z.number().int().min(1).max(12).nullable(),
    startsAt: clockTime.nullable(),
    kind: lessonKind.nullable(),
    title: z.string().trim().max(200).optional(),
  }),
  z.object({ type: z.literal("materials"), subjectId: z.uuid() }),
]);
export type UploadTarget = z.infer<typeof uploadTarget>;

export type UploadResponse =
  { status: "created" | "duplicate"; mediaId: string } | { status: "rejected"; error: string };
