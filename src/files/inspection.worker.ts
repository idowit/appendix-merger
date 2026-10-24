import type { DocumentRole } from "../domain/compilation-planner";
import { inspectSource, SourceInspectionError } from "./inspect-source";

self.onmessage = async (event: MessageEvent<{ file: File; role?: DocumentRole }>) => {
  try {
    const document = await inspectSource(event.data.file, event.data.role);
    self.postMessage({ type: "complete", document }, { transfer: [document.bytes.buffer] });
  } catch (error) {
    self.postMessage({
      type: "error",
      code: error instanceof SourceInspectionError ? error.code : "INVALID_PDF",
      filename: event.data.file.name,
    });
  }
};
