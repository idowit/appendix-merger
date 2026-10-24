import type { DocumentRole } from "../domain/compilation-planner";
import type { StoredDocument } from "../persistence/compilation-file";
import { SourceInspectionError, type SourceInspectionCode } from "./inspect-source";

type InspectionMessage =
  | { type: "complete"; document: StoredDocument }
  | { type: "error"; code: SourceInspectionCode; filename: string };

export function inspectWithWorker(file: File, role?: DocumentRole): Promise<StoredDocument> {
  const worker = new Worker(new URL("./inspection.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<InspectionMessage>) => {
      worker.terminate();
      if (event.data.type === "complete") resolve(event.data.document);
      else reject(new SourceInspectionError(event.data.code, event.data.filename));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new SourceInspectionError("INVALID_PDF", file.name));
    };
    worker.postMessage({ file, role });
  });
}
