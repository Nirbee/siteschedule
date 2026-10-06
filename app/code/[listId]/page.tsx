import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current";
import { getTopicList } from "@/lib/services/topics";
import { CodeScreen } from "./code-screen";

export const metadata: Metadata = { title: "Код для пары" };

export default async function ClassCodePage({ params }: { params: Promise<{ listId: string }> }) {
  const [{ user }, { listId }] = await Promise.all([requireRole("starosta", "admin"), params]);
  const list = /^[0-9a-f-]{36}$/.test(listId) ? await getTopicList(listId, user) : undefined;
  if (!list) notFound();
  return <CodeScreen listId={list.id} title={`${list.title} · ${list.subjectName}`} />;
}
