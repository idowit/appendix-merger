import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CompilationSnapshot } from "./compilation-file";
import { clearDraft, loadDraft, saveDraft } from "./draft-store";

const draft: CompilationSnapshot = {
  mode: "quick-merge",
  documents: [
    {
      id: "one",
      name: "one.pdf",
      type: "application/pdf",
      title: "One",
      pageCount: 1,
      bytes: new Uint8Array([1, 2, 3]),
    },
  ],
  settings: {
    numbering: "decimal",
    outputLanguage: "he",
    tableOfContents: true,
    appendixCovers: true,
    appendixMarkers: true,
    pageNumbers: false,
  },
};

describe("Draft Store", () => {
  beforeEach(async () => clearDraft());

  it("saves, restores, and clears a local draft", async () => {
    await saveDraft(draft);
    const restored = await loadDraft();
    expect(restored?.mode).toBe(draft.mode);
    expect(restored?.settings).toEqual(draft.settings);
    expect(restored?.documents[0]).toMatchObject({
      id: "one",
      name: "one.pdf",
      type: "application/pdf",
      title: "One",
      pageCount: 1,
    });
    expect(Array.from(restored?.documents[0].bytes ?? [])).toEqual([1, 2, 3]);

    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });
});
