import { openDB } from "idb";
import type { CompilationSnapshot } from "./compilation-file";

const DATABASE_NAME = "appendix-merger";
const STORE_NAME = "drafts";
const CURRENT_DRAFT = "current";

function database() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    },
  });
}

export async function saveDraft(snapshot: CompilationSnapshot): Promise<void> {
  const db = await database();
  await db.put(STORE_NAME, snapshot, CURRENT_DRAFT);
  db.close();
}

export async function loadDraft(): Promise<CompilationSnapshot | null> {
  const db = await database();
  const snapshot = (await db.get(STORE_NAME, CURRENT_DRAFT)) as CompilationSnapshot | undefined;
  db.close();
  return snapshot ?? null;
}

export async function clearDraft(): Promise<void> {
  const db = await database();
  await db.delete(STORE_NAME, CURRENT_DRAFT);
  db.close();
}
