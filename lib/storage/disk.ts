// Uploaded files on local disk (Docker volume in production). Keys are relative paths like
// "media/2026-10/<uuid>.webp"; they never change, so files are cached forever.
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

let rootOverride: string | undefined;

export function storageRoot(): string {
  return rootOverride ?? path.resolve(env().STORAGE_DIR);
}

/** Tests only. */
export function setStorageRootForTesting(dir: string | undefined): void {
  rootOverride = dir;
}

/** Absolute path for a key; refuses anything that would escape the storage root. */
export function objectPath(key: string): string {
  const root = storageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return full;
}

/** Writes atomically: a crash mid-write never leaves a truncated file under the final key. */
export async function writeObject(key: string, data: Uint8Array): Promise<void> {
  const target = objectPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, target);
}

export async function objectSize(key: string): Promise<number | null> {
  try {
    return (await stat(objectPath(key))).size;
  } catch {
    return null;
  }
}

export function readObject(key: string, range?: { start: number; end: number }) {
  return createReadStream(objectPath(key), range);
}

export async function deleteObject(key: string): Promise<void> {
  await rm(objectPath(key), { force: true });
}

/** "media/2026-10/<uuid>" — month folders keep directories small. */
export function newKey(prefix: "media" | "files", now = new Date()): string {
  const month = now.toISOString().slice(0, 7);
  return `${prefix}/${month}/${randomUUID()}`;
}
