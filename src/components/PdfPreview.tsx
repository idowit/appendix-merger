import { useEffect, useRef } from "react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export function PdfPreview({ bytes, ariaLabel }: { bytes: Uint8Array; ariaLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      const loading = pdfjs.getDocument({ data: Uint8Array.from(bytes) });
      destroy = () => loading.destroy();
      const document = await loading.promise;
      const page = await document.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1.4, 440 / base.width) });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (context) await page.render({ canvas, canvasContext: context, viewport }).promise;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [bytes]);

  return <canvas ref={canvasRef} className="pdf-preview-canvas" aria-label={ariaLabel} />;
}
