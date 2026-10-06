// Loads a whole base schedule from a JSON file (data/private/*.json, never committed).
// Re-running it updates in place: no duplicates, and lessons with history are ended, not deleted.
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  groups,
  scheduleChanges,
  scheduleEntries,
  scheduleEntryGroups,
  semesters,
  subjects,
  timeSlots,
} from "@/lib/db/schema";
import { addDays, todayInMoscow, type IsoDate } from "@/lib/schedule/dates";
import { clockTime, isoDate, lessonKind, parity, semesterInput } from "@/lib/schedule/inputs";

export const scheduleFile = z.object({
  semester: semesterInput,
  slots: z.array(z.object({ n: z.number().int().min(1), start: clockTime, end: clockTime })),
  groups: z.array(z.string().min(1)).min(1),
  subjects: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      shortName: z.string().nullable().default(null),
      aliases: z.array(z.string()).default([]),
      teacher: z.string().nullable().default(null),
    }),
  ),
  entries: z.array(
    z.object({
      subject: z.string().min(1),
      weekday: z.number().int().min(1).max(7),
      slot: z.number().int().min(1),
      parity: parity.default("any"),
      kind: lessonKind,
      room: z.string().nullable().default(null),
      teacher: z.string().nullable().default(null),
      groups: z.array(z.string()).optional(),
      validFrom: isoDate.nullable().default(null),
      validTo: isoDate.nullable().default(null),
    }),
  ),
});
export type ScheduleFile = z.input<typeof scheduleFile>;

export interface ImportReport {
  subjects: { created: number; updated: number };
  entries: { created: number; updated: number; deleted: number; ended: number };
}

const entryKey = (e: {
  subjectId: string;
  weekday: number;
  slotN: number;
  parity: string;
  kind: string;
}) => `${e.subjectId}|${e.weekday}|${e.slotN}|${e.parity}|${e.kind}`;

export async function importSchedule(
  raw: unknown,
  { today = todayInMoscow() }: { today?: IsoDate } = {},
): Promise<ImportReport> {
  const file = scheduleFile.parse(raw);
  const report: ImportReport = {
    subjects: { created: 0, updated: 0 },
    entries: { created: 0, updated: 0, deleted: 0, ended: 0 },
  };

  await db().transaction(async (tx) => {
    for (const slot of file.slots) {
      await tx
        .insert(timeSlots)
        .values({ n: slot.n, startsAt: slot.start, endsAt: slot.end })
        .onConflictDoUpdate({
          target: timeSlots.n,
          set: { startsAt: slot.start, endsAt: slot.end },
        });
    }

    await tx
      .insert(groups)
      .values(file.groups.map((code, i) => ({ code, sort: i + 1 })))
      .onConflictDoNothing();
    const groupRows = await tx.select().from(groups).where(inArray(groups.code, file.groups));
    const groupId = (code: string) => {
      const found = groupRows.find((g) => g.code === code);
      if (!found) throw new Error(`Unknown group ${code}`);
      return found.id;
    };

    // Semester: matched by title, becomes the current one.
    let [semester] = await tx
      .select()
      .from(semesters)
      .where(eq(semesters.title, file.semester.title));
    await tx.update(semesters).set({ isCurrent: false }).where(eq(semesters.isCurrent, true));
    if (semester) {
      await tx
        .update(semesters)
        .set({ ...file.semester, isCurrent: true })
        .where(eq(semesters.id, semester.id));
    } else {
      [semester] = await tx
        .insert(semesters)
        .values({ ...file.semester, isCurrent: true })
        .returning();
    }
    const semesterId = semester!.id;

    // Subjects: matched by name within the semester.
    const existingSubjects = await tx
      .select()
      .from(subjects)
      .where(eq(subjects.semesterId, semesterId));
    const subjectIdByKey = new Map<string, string>();
    for (const s of file.subjects) {
      const values = {
        name: s.name,
        shortName: s.shortName,
        aliases: s.aliases,
        teacher: s.teacher,
      };
      const existing = existingSubjects.find((row) => row.name === s.name);
      if (existing) {
        await tx.update(subjects).set(values).where(eq(subjects.id, existing.id));
        subjectIdByKey.set(s.key, existing.id);
        report.subjects.updated++;
      } else {
        const [created] = await tx
          .insert(subjects)
          .values({ ...values, semesterId })
          .returning();
        subjectIdByKey.set(s.key, created!.id);
        report.subjects.created++;
      }
    }

    // Entries: matched by (subject, weekday, slot, parity, kind).
    const existingEntries = await tx
      .select({ entry: scheduleEntries })
      .from(scheduleEntries)
      .innerJoin(subjects, eq(subjects.id, scheduleEntries.subjectId))
      .where(eq(subjects.semesterId, semesterId));
    const unmatched = new Map(existingEntries.map(({ entry }) => [entryKey(entry), entry]));

    for (const e of file.entries) {
      const subjectId = subjectIdByKey.get(e.subject);
      if (!subjectId) throw new Error(`Entry refers to unknown subject key "${e.subject}"`);
      const values = {
        subjectId,
        weekday: e.weekday,
        slotN: e.slot,
        parity: e.parity,
        kind: e.kind,
        room: e.room,
        teacher: e.teacher,
        validFrom: e.validFrom,
        validTo: e.validTo,
      };
      const key = entryKey(values);
      const existing = unmatched.get(key);
      let entryId: string;
      if (existing) {
        unmatched.delete(key);
        await tx.update(scheduleEntries).set(values).where(eq(scheduleEntries.id, existing.id));
        await tx.delete(scheduleEntryGroups).where(eq(scheduleEntryGroups.entryId, existing.id));
        entryId = existing.id;
        report.entries.updated++;
      } else {
        const [created] = await tx.insert(scheduleEntries).values(values).returning();
        entryId = created!.id;
        report.entries.created++;
      }
      await tx
        .insert(scheduleEntryGroups)
        .values((e.groups ?? file.groups).map((code) => ({ entryId, groupId: groupId(code) })));
    }

    // Lessons no longer in the file: delete, or end yesterday if they have history.
    for (const entry of unmatched.values()) {
      const [used] = await tx
        .select({ id: scheduleChanges.id })
        .from(scheduleChanges)
        .where(eq(scheduleChanges.entryId, entry.id))
        .limit(1);
      if (!used) {
        await tx.delete(scheduleEntries).where(eq(scheduleEntries.id, entry.id));
        report.entries.deleted++;
      } else if (!entry.validTo || entry.validTo >= today) {
        await tx
          .update(scheduleEntries)
          .set({ validTo: addDays(today, -1) })
          .where(eq(scheduleEntries.id, entry.id));
        report.entries.ended++;
      }
    }
  });

  return report;
}
