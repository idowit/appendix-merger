import { decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFRawStream, type PDFPage } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { CompilationSnapshot, StoredDocument } from "../persistence/compilation-file";
import { generateFinishedPdf } from "./generate-finished-pdf";

async function pdfDocument(id: string, sizes: Array<[number, number]>): Promise<StoredDocument> {
  const pdf = await PDFDocument.create();
  sizes.forEach(([width, height]) => pdf.addPage([width, height]));
  return {
    id,
    name: `${id}.pdf`,
    type: "application/pdf",
    title: id,
    pageCount: sizes.length,
    bytes: await pdf.save(),
  };
}

function textOperationCount(document: PDFDocument, page: PDFPage): number {
  const contents = page.node.Contents();
  if (!contents) return 0;
  const entries = contents instanceof PDFArray ? contents.asArray() : [contents];
  const operators = entries.map((entry) => {
    const stream = document.context.lookup(entry, PDFRawStream);
    return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  }).join("\n");
  return operators.match(/\bBT\b/g)?.length ?? 0;
}

describe("generateFinishedPdf", () => {
  it("keeps Hebrew cover text in logical reading order", async () => {
    const main = { ...(await pdfDocument("rtl-main", [[300, 400]])), role: "main" as const };
    const appendix = {
      ...(await pdfDocument("rtl-appendix", [[300, 400], [300, 400]])),
      role: "appendix" as const,
      title: "הסכם מיוחד",
    };
    const [regularFont, boldFont] = await Promise.all([
      readFile("public/fonts/David-Regular.ttf"),
      readFile("public/fonts/David-Bold.ttf"),
    ]);
    const bytes = await generateFinishedPdf({
      mode: "appendix",
      documents: [main, appendix],
      settings: { numbering: "hebrew", outputLanguage: "he", outputStyle: "polished", appendixMarkers: true, pageNumbers: true },
    }, { regularFont, boldFont });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: Uint8Array.from(bytes), disableWorker: true }).promise;
    const extract = async (pageNumber: number) => {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      return content.items.map((item) => "str" in item ? item.str : "").join(" ");
    };
    const tocText = await extract(2);
    const coverText = await extract(3);
    const appendixText = await extract(4);

    expect(tocText).toContain("רשימת נספחים");
    expect(tocText).toContain("נספח א");
    expect(coverText).toContain("נספח א");
    expect(coverText).toContain("הסכם מיוחד");
    expect(coverText).toContain("4–5");
    expect(appendixText).toContain("נספח א");
  });

  it("combines Quick Merge sources in order while preserving page geometry", async () => {
    const snapshot: CompilationSnapshot = {
      mode: "quick-merge",
      documents: [
        await pdfDocument("first", [[300, 500], [500, 300]]),
        await pdfDocument("second", [[612, 792]]),
      ],
      settings: {
        numbering: "decimal",
        outputLanguage: "en",
        outputStyle: "minimal",
        appendixMarkers: false,
        pageNumbers: false,
      },
    };

    const bytes = await generateFinishedPdf(snapshot);
    const generated = await PDFDocument.load(bytes);

    expect(generated.getPageCount()).toBe(3);
    expect(generated.getPages().map((page) => page.getSize())).toEqual([
      { width: 300, height: 500 },
      { width: 500, height: 300 },
      { width: 612, height: 792 },
    ]);
  });

  it("builds an Appendix Compilation with A4 TOC and cover pages around original documents", async () => {
    const main = { ...(await pdfDocument("main", [[612, 792], [500, 700]])), role: "main" as const };
    const appendix = { ...(await pdfDocument("appendix", [[400, 600]])), title: "הסכם שכירות", role: "appendix" as const };
    const snapshot: CompilationSnapshot = {
      mode: "appendix",
      documents: [main, appendix],
      settings: {
        numbering: "hebrew",
        outputLanguage: "he",
        outputStyle: "polished",
        appendixMarkers: true,
        pageNumbers: true,
      },
    };
    const [regularFont, boldFont] = await Promise.all([
      readFile("public/fonts/David-Regular.ttf"),
      readFile("public/fonts/David-Bold.ttf"),
    ]);

    const bytes = await generateFinishedPdf(snapshot, { regularFont, boldFont });
    const generated = await PDFDocument.load(bytes);

    expect(generated.getPageCount()).toBe(5);
    expect(generated.getPages().map((page) => page.getSize())).toEqual([
      { width: 612, height: 792 },
      { width: 500, height: 700 },
      { width: 595.28, height: 841.89 },
      { width: 595.28, height: 841.89 },
      { width: 400, height: 600 },
    ]);
  });

  it("renders every planned TOC page for a long Appendix Compilation", async () => {
    const main = { ...(await pdfDocument("main-long", [[300, 400]])), role: "main" as const };
    const appendixSource = await pdfDocument("source", [[300, 400]]);
    const appendices = Array.from({ length: 19 }, (_, index) => ({
      ...appendixSource,
      id: `long-${index}`,
      name: `long-${index}.pdf`,
      title: `נספח ${index + 1}`,
      role: "appendix" as const,
    }));
    const [regularFont, boldFont] = await Promise.all([
      readFile("public/fonts/David-Regular.ttf"),
      readFile("public/fonts/David-Bold.ttf"),
    ]);
    const bytes = await generateFinishedPdf({
      mode: "appendix",
      documents: [main, ...appendices],
      settings: { numbering: "decimal", outputLanguage: "he", outputStyle: "minimal", appendixMarkers: false, pageNumbers: false },
    }, { regularFont, boldFont });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(41);
  });

  it("preserves all source rotations when adding appendix markers and page numbers", async () => {
    const main = { ...(await pdfDocument("rotation-main", [[300, 400]])), role: "main" as const };
    const rotated = await PDFDocument.create();
    [0, 90, 180, 270].forEach((angle) => rotated.addPage([400, 600]).setRotation(degrees(angle)));
    const appendix: StoredDocument = {
      id: "rotations", name: "rotations.pdf", type: "application/pdf", title: "כיווני עמוד",
      pageCount: 4, role: "appendix", bytes: await rotated.save(),
    };
    const [regularFont, boldFont] = await Promise.all([
      readFile("public/fonts/David-Regular.ttf"),
      readFile("public/fonts/David-Bold.ttf"),
    ]);
    const bytes = await generateFinishedPdf({
      mode: "appendix",
      documents: [main, appendix],
      settings: { numbering: "hebrew", outputLanguage: "he", outputStyle: "polished", appendixMarkers: true, pageNumbers: true },
    }, { regularFont, boldFont });
    const generated = await PDFDocument.load(bytes);
    const appendixPages = generated.getPages().slice(-4);

    expect(appendixPages.map((page) => page.getRotation().angle)).toEqual([0, 90, 180, 270]);
    const textOperations = appendixPages.map((page) => textOperationCount(generated, page));
    expect(textOperations.every((count) => count >= 1)).toBe(true);
    expect(textOperations[0]).toBeGreaterThan(textOperations[1]);
  });

  it("converts PNG input into a centered A4 page", async () => {
    const png = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ));
    const bytes = await generateFinishedPdf({
      mode: "quick-merge",
      documents: [{ id: "image", name: "evidence.png", type: "image/png", title: "Evidence", pageCount: 1, bytes: png }],
      settings: { numbering: "decimal", outputLanguage: "en", outputStyle: "minimal", appendixMarkers: false, pageNumbers: false },
    });
    const generated = await PDFDocument.load(bytes);

    expect(generated.getPageCount()).toBe(1);
    expect(generated.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });

  it("merges PDF and image sources in one mixed-file workflow", async () => {
    const pdf = await pdfDocument("mixed-pdf", [[320, 480]]);
    const png = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ));
    const bytes = await generateFinishedPdf({
      mode: "quick-merge",
      documents: [pdf, { id: "mixed-image", name: "photo.png", type: "image/png", title: "Photo", pageCount: 1, bytes: png }],
      settings: { numbering: "decimal", outputLanguage: "en", outputStyle: "minimal", appendixMarkers: false, pageNumbers: false },
    });
    const generated = await PDFDocument.load(bytes);

    expect(generated.getPages().map((page) => page.getSize())).toEqual([
      { width: 320, height: 480 },
      { width: 595.28, height: 841.89 },
    ]);
  });

  it("converts JPEG input into a centered A4 page", async () => {
    const jpeg = Uint8Array.from(Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
      "base64",
    ));
    const bytes = await generateFinishedPdf({
      mode: "quick-merge",
      documents: [{ id: "jpeg", name: "evidence.jpg", type: "image/jpeg", title: "Evidence", pageCount: 1, bytes: jpeg }],
      settings: { numbering: "decimal", outputLanguage: "en", outputStyle: "minimal", appendixMarkers: false, pageNumbers: false },
    });

    expect((await PDFDocument.load(bytes)).getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });
});
