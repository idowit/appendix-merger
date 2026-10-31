import fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  PageSizes,
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import { planCompilation } from "../domain/compilation-planner";
import type { CompilationPlan, CompilationSection } from "../domain/compilation-planner";
import type { CompilationSnapshot, StoredDocument } from "../persistence/compilation-file";

export type PdfGenerationStage = "reading" | "assembling" | "numbering" | "saving";

export interface PdfGenerationOptions {
  signal?: AbortSignal;
  onProgress?: (stage: PdfGenerationStage, completed: number, total: number) => void;
  regularFont?: Uint8Array;
  boldFont?: Uint8Array;
}

export class PdfGenerationError extends Error {
  constructor(
    public readonly code:
      | "ENCRYPTED_PDF"
      | "INVALID_PDF"
      | "UNSUPPORTED_IMAGE"
      | "FONT_REQUIRED"
      | "CANCELLED",
    public readonly documentId?: string,
  ) {
    super(code);
    this.name = "PdfGenerationError";
  }
}

const INK = rgb(0.09, 0.12, 0.16);
const NAVY = rgb(0.08, 0.16, 0.25);
const BRASS = rgb(0.67, 0.48, 0.2);
const PAPER = rgb(0.98, 0.975, 0.955);

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PdfGenerationError("CANCELLED");
}

function visualText(text: string, _language: "he" | "en"): string {
  return text;
}

function centeredX(font: PDFFont, text: string, size: number, pageWidth: number): number {
  return (pageWidth - font.widthOfTextAtSize(text, size)) / 2;
}

function outputCopy(language: "he" | "en") {
  return language === "he"
    ? { appendix: "נספח", toc: "רשימת נספחים" }
    : { appendix: "Appendix", toc: "Table of appendices" };
}

function fitLine(text: string, font: PDFFont, size: number, maxWidth: number, language: "he" | "en"): string {
  let candidate = text;
  while (candidate.length > 1 && font.widthOfTextAtSize(visualText(candidate, language), size) > maxWidth) {
    candidate = `${candidate.slice(0, -2).trimEnd()}…`;
  }
  return visualText(candidate, language);
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number, language: "he" | "en", maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(visualText(candidate, language), size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) visible[maxLines - 1] = `${visible[maxLines - 1]}…`;
  return visible.map((line) => fitLine(line, font, size, maxWidth, language));
}

function drawCenteredLines(page: PDFPage, lines: string[], font: PDFFont, size: number, centerY: number, color = INK): void {
  const lineHeight = size * 1.35;
  const firstY = centerY + ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => page.drawText(line, {
    x: centeredX(font, line, size, page.getWidth()),
    y: firstY - index * lineHeight,
    size,
    font,
    color,
  }));
}

async function appendSource(output: PDFDocument, document: StoredDocument): Promise<PDFPage[]> {
  if (document.type === "application/pdf" || document.name.toLowerCase().endsWith(".pdf")) {
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(document.bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      throw new PdfGenerationError(message.includes("encrypt") ? "ENCRYPTED_PDF" : "INVALID_PDF", document.id);
    }
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    return pages;
  }

  try {
    const image = document.type === "image/png" || document.name.toLowerCase().endsWith(".png")
      ? await output.embedPng(document.bytes)
      : await output.embedJpg(document.bytes);
    const page = output.addPage(PageSizes.A4);
    const margin = 36;
    const scale = Math.min(
      (page.getWidth() - margin * 2) / image.width,
      (page.getHeight() - margin * 2) / image.height,
      1,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height,
    });
    return [page];
  } catch {
    throw new PdfGenerationError("UNSUPPORTED_IMAGE", document.id);
  }
}

function addCover(
  output: PDFDocument,
  document: StoredDocument,
  label: string,
  regular: PDFFont,
  bold: PDFFont,
  snapshot: CompilationSnapshot,
): void {
  const page = output.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  const language = snapshot.settings.outputLanguage;
  const copy = outputCopy(language);
  const appendix = visualText(`${copy.appendix} ${label}`, language);
  const titleLines = wrapLines(document.title || document.name.replace(/\.[^.]+$/, ""), regular, 22, width - 140, language);

  page.drawText(appendix, { x: centeredX(bold, appendix, 32, width), y: height / 2 + 42, size: 32, font: bold, color: INK });
  drawCenteredLines(page, titleLines, regular, 22, height / 2 - 10);
}

function addToc(
  output: PDFDocument,
  plan: CompilationPlan,
  documents: Map<string, StoredDocument>,
  regular: PDFFont,
  bold: PDFFont,
  snapshot: CompilationSnapshot,
): void {
  const language = snapshot.settings.outputLanguage;
  const copy = outputCopy(language);
  const appendixSources = plan.sections.filter(
    (section): section is Extract<CompilationSection, { kind: "source" }> =>
      section.kind === "source" && Boolean(section.appendixLabel),
  );
  for (let offset = 0; offset < appendixSources.length; offset += 18) {
    const page = output.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    const title = visualText(copy.toc, language);
    page.drawRectangle({ x: 0, y: height - 18, width, height: 18, color: NAVY });
    page.drawText(title, { x: centeredX(bold, title, 25, width), y: height - 82, size: 25, font: bold, color: INK });
    page.drawLine({ start: { x: 54, y: height - 108 }, end: { x: width - 54, y: height - 108 }, thickness: 1, color: BRASS });
    let y = height - 154;
    appendixSources.slice(offset, offset + 18).forEach((section) => {
      const document = documents.get(section.documentId);
      if (!document) return;
      const entry = fitLine(
        `${copy.appendix} ${section.appendixLabel} · ${document.title}`,
        regular,
        14,
        width - 170,
        language,
      );
      const cover = plan.sections.find(
        (candidate) => candidate.kind === "cover" && candidate.documentId === section.documentId,
      );
      const range = `${cover?.startPage ?? section.startPage}–${section.endPage}`;
      const rangeWidth = regular.widthOfTextAtSize(range, 12);
      const entryWidth = regular.widthOfTextAtSize(entry, 14);
      page.drawText(entry, { x: width - 54 - entryWidth, y, size: 14, font: regular, color: INK });
      page.drawText(range, { x: 54, y, size: 12, font: regular, color: rgb(0.35, 0.38, 0.42) });
      page.drawLine({ start: { x: 54 + rangeWidth + 12, y: y + 3 }, end: { x: width - 68 - entryWidth, y: y + 3 }, thickness: 0.4, color: rgb(0.72, 0.72, 0.7), dashArray: [1.5, 3] });
      y -= 34;
    });
  }
}

function drawPageNumber(page: PDFPage, number: number, font: PDFFont): void {
  const text = String(number);
  const size = 9;
  const { width, height } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const textWidth = font.widthOfTextAtSize(text, size);
  if (rotation === 90) {
    page.drawText(text, { x: width - 18, y: height / 2 + textWidth / 2, size, font, color: rgb(0.35, 0.35, 0.35), rotate: degrees(-90) });
  } else if (rotation === 180) {
    page.drawText(text, { x: width / 2 + textWidth / 2, y: height - 18, size, font, color: rgb(0.35, 0.35, 0.35), rotate: degrees(180) });
  } else if (rotation === 270) {
    page.drawText(text, { x: 18, y: height / 2 - textWidth / 2, size, font, color: rgb(0.35, 0.35, 0.35), rotate: degrees(90) });
  } else {
    page.drawText(text, { x: width / 2 - textWidth / 2, y: 16, size, font, color: rgb(0.35, 0.35, 0.35) });
  }
}

function drawAppendixMarker(page: PDFPage, label: string, font: PDFFont, language: "he" | "en"): void {
  const text = visualText(`${outputCopy(language).appendix} ${label}`, language);
  const size = 10;
  const padding = 8;
  const boxWidth = font.widthOfTextAtSize(text, size) + padding * 2;
  const boxHeight = 25;
  const margin = 16;
  const { width, height } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  let x = width - boxWidth - margin;
  let y = height - boxHeight - margin;
  let textX = x + padding;
  let textY = y + 8;
  let textRotation = 0;
  if (rotation === 90) {
    x = margin;
    y = height - margin;
    textX = margin + boxHeight - 8;
    textY = height - margin - padding;
    textRotation = -90;
  } else if (rotation === 180) {
    x = margin;
    y = margin;
    textX = margin + boxWidth - padding;
    textY = margin + boxHeight - 8;
    textRotation = 180;
  } else if (rotation === 270) {
    x = width - margin;
    y = margin;
    textX = width - margin - boxHeight + 8;
    textY = margin + padding;
    textRotation = 90;
  }
  page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, color: PAPER, borderColor: BRASS, borderWidth: 0.8, rotate: degrees(textRotation) });
  page.drawText(text, { x: textX, y: textY, size, font, color: INK, rotate: degrees(textRotation) });
}

export async function generateFinishedPdf(
  snapshot: CompilationSnapshot,
  options: PdfGenerationOptions = {},
): Promise<Uint8Array> {
  const plan = planCompilation({
    mode: snapshot.mode,
    documents: snapshot.documents.map(({ id, name, title, pageCount, role }) => ({ id, name, title, pageCount, role })),
    settings: snapshot.settings,
  });
  const documents = new Map(snapshot.documents.map((document) => [document.id, document]));
  const output = await PDFDocument.create();
  const numberFont = await output.embedFont(StandardFonts.Helvetica);
  let regular = numberFont;
  let bold = await output.embedFont(StandardFonts.HelveticaBold);
  if (snapshot.mode === "appendix") {
    if (!options.regularFont || !options.boldFont) throw new PdfGenerationError("FONT_REQUIRED");
    output.registerFontkit(fontkit);
    regular = await output.embedFont(Uint8Array.from(options.regularFont), { subset: true });
    bold = await output.embedFont(Uint8Array.from(options.boldFont), { subset: true });
  }

  for (let index = 0; index < plan.sections.length; index += 1) {
    assertNotCancelled(options.signal);
    const section = plan.sections[index];
    options.onProgress?.("assembling", index, plan.sections.length);
    if (section.kind === "toc") {
      addToc(output, plan, documents, regular, bold, snapshot);
    } else if (section.kind === "cover") {
      const document = documents.get(section.documentId);
      if (document) addCover(output, document, section.appendixLabel, regular, bold, snapshot);
    } else {
      const document = documents.get(section.documentId);
      if (!document) continue;
      const pages = await appendSource(output, document);
      if (section.appendixLabel && snapshot.settings.appendixMarkers && pages[0]) {
        drawAppendixMarker(pages[0], section.appendixLabel, regular, snapshot.settings.outputLanguage);
      }
    }
  }

  if (snapshot.settings.pageNumbers) {
    output.getPages().forEach((page, index) => {
      assertNotCancelled(options.signal);
      options.onProgress?.("numbering", index, output.getPageCount());
      drawPageNumber(page, index + 1, numberFont);
    });
  }
  output.setTitle(snapshot.mode === "appendix" ? "Appendix Compilation" : "Merged PDF");
  output.setProducer("Appendix Merger");
  options.onProgress?.("saving", plan.sections.length, plan.sections.length);
  assertNotCancelled(options.signal);
  return output.save();
}
