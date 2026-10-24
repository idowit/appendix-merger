/// <reference lib="webworker" />
import type { CompilationSnapshot } from "../persistence/compilation-file";
import { generateFinishedPdf } from "./generate-finished-pdf";

self.onmessage = async (event: MessageEvent<{ type: "generate"; snapshot: CompilationSnapshot }>) => {
  if (event.data.type !== "generate") return;
  try {
    const options: Parameters<typeof generateFinishedPdf>[1] = {
      onProgress: (stage, completed, total) => self.postMessage({ type: "progress", stage, completed, total }),
    };
    if (event.data.snapshot.mode === "appendix") {
      const [regular, bold] = await Promise.all([
        fetch("/fonts/David-Regular.ttf").then((response) => response.arrayBuffer()),
        fetch("/fonts/David-Bold.ttf").then((response) => response.arrayBuffer()),
      ]);
      options.regularFont = new Uint8Array(regular);
      options.boldFont = new Uint8Array(bold);
    }
    const bytes = await generateFinishedPdf(event.data.snapshot, options);
    self.postMessage({ type: "complete", bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ type: "error", error: error instanceof Error ? error.message : "PDF_GENERATION_FAILED" });
  }
};

export {};
