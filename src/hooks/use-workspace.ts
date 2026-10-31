import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeCompilationSettings, type CompilationSettings, type WorkflowMode } from "../domain/compilation-planner";
import { assertWithinSizeLimit, SourceInspectionError } from "../files/inspect-source";
import { inspectWithWorker } from "../files/inspection-client";
import { clearDraft, loadDraft, saveDraft } from "../persistence/draft-store";
import type { CompilationSnapshot, StoredDocument } from "../persistence/compilation-file";

export const DEFAULT_SETTINGS: CompilationSettings = {
  numbering: "hebrew",
  outputLanguage: "he",
  tableOfContents: true,
  appendixCovers: true,
  appendixMarkers: true,
  pageNumbers: true,
};

export interface WorkspaceNotice {
  kind: "error" | "success";
  message: string;
}

export function useWorkspace() {
  const [mode, setModeState] = useState<WorkflowMode>("appendix");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    loadDraft()
      .then((draft) => {
        if (draft) {
          setModeState(draft.mode);
          setDocuments(draft.documents);
          setSettings(normalizeCompilationSettings(draft.settings));
          restored.current = true;
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  const snapshot = useMemo<CompilationSnapshot>(() => ({ mode, documents, settings }), [mode, documents, settings]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => saveDraft(snapshot).catch(() => undefined), 500);
    return () => window.clearTimeout(timer);
  }, [hydrated, snapshot]);

  const setMode = useCallback((nextMode: WorkflowMode) => {
    setModeState(nextMode);
    setDocuments((current) => current.map((document, index) => ({
      ...document,
      role: nextMode === "appendix" ? (index === 0 ? "main" : "appendix") : undefined,
    })));
    setSettings((current) => ({ ...current, pageNumbers: nextMode === "appendix" }));
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    try {
      assertWithinSizeLimit(documents, files);
    } catch (error) {
      if (error instanceof SourceInspectionError) setNotice({ kind: "error", message: error.code });
      return;
    }
    const additions: StoredDocument[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const index = documents.length + additions.length;
        additions.push(await inspectWithWorker(file, mode === "appendix" ? (index === 0 ? "main" : "appendix") : undefined));
      } catch (error) {
        errors.push(error instanceof SourceInspectionError ? `${file.name}: ${error.code}` : file.name);
      }
    }
    if (additions.length) setDocuments((current) => [...current, ...additions]);
    setNotice(errors.length ? { kind: "error", message: errors.join(" · ") } : null);
  }, [documents, mode]);

  const updateDocument = useCallback((id: string, patch: Partial<StoredDocument>) => {
    setDocuments((current) => current.map((document) => document.id === id ? { ...document, ...patch } : document));
  }, []);

  const makeMain = useCallback((id: string) => {
    setDocuments((current) => current.map((document) => ({ ...document, role: document.id === id ? "main" : "appendix" })));
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((current) => {
      const removed = current.filter((document) => document.id !== id);
      if (mode === "appendix" && removed.length && !removed.some((document) => document.role === "main")) {
        return removed.map((document, index) => ({ ...document, role: index === 0 ? "main" : "appendix" }));
      }
      return removed;
    });
  }, [mode]);

  const reorder = useCallback((oldIndex: number, newIndex: number) => {
    setDocuments((current) => {
      const next = [...current];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  const clear = useCallback(async () => {
    setDocuments([]);
    setSettings(DEFAULT_SETTINGS);
    setNotice(null);
    await clearDraft().catch(() => undefined);
  }, []);

  const replace = useCallback((next: CompilationSnapshot) => {
    setModeState(next.mode);
    setDocuments(next.documents);
    setSettings(normalizeCompilationSettings(next.settings));
  }, []);

  return {
    mode, documents, settings, snapshot, notice, setNotice, restored: restored.current,
    setMode, addFiles, updateDocument, makeMain, removeDocument, reorder,
    setSettings, clear, replace,
  };
}
