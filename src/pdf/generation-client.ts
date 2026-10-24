import type { CompilationSnapshot } from "../persistence/compilation-file";
import type { PdfGenerationStage } from "./generate-finished-pdf";

interface WorkerMessage {
  type: "progress" | "complete" | "error";
  stage?: PdfGenerationStage;
  completed?: number;
  total?: number;
  bytes?: Uint8Array;
  error?: string;
}

export function generateWithWorker(
  snapshot: CompilationSnapshot,
  onProgress: (stage: PdfGenerationStage, completed: number, total: number) => void,
): { promise: Promise<Uint8Array>; cancel: () => void } {
  const worker = new Worker(new URL("./generation.worker.ts", import.meta.url), { type: "module" });
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress" && message.stage) {
        onProgress(message.stage, message.completed ?? 0, message.total ?? 1);
      } else if (message.type === "complete" && message.bytes) {
        resolve(message.bytes);
        worker.terminate();
      } else if (message.type === "error") {
        reject(new Error(message.error ?? "PDF_GENERATION_FAILED"));
        worker.terminate();
      }
    };
    worker.onerror = (event) => {
      reject(new Error(event.message));
      worker.terminate();
    };
    worker.postMessage({ type: "generate", snapshot });
  });
  return { promise, cancel: () => worker.terminate() };
}
