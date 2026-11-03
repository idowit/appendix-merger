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

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRID = rgb(0.65, 0.65, 0.65);

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
    ? { appendix: "נספח", name: "שם המסמך", pages: "עמודים", toc: "רשימת נספחים" }
    : { appendix: "Appendix", name: "Document name", pages: "Pages", toc: "Table of appendices" };
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

function drawCenteredLines(page: PDFPage, lines: string[], font: PDFFont, size: number, centerY: number, color = BLACK): void {
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

function drawCenteredPageRange(
  page: PDFPage,
  label: string,
  range: string,
  font: PDFFont,
  size: number,
  y: number,
  language: "he" | "en",
): void {
  const gap = 7;
  const labelWidth = font.widthOfTextAtSize(label, size);
  const rangeWidth = font.widthOfTextAtSize(range, size);
  const start = (page.getWidth() - labelWidth - gap - rangeWidth) / 2;
  const labelX = language === "he" ? start + rangeWidth + gap : start;
  const rangeX = language === "he" ? start : start + labelWidth + gap;
  page.drawText(label, { x: labelX, y, size, font, color: BLACK });
  page.drawText(range, { x: rangeX, y, size, font, color: BLACK });
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
  pageRange: string,
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

  const pagesLabel = visualText(copy.pages, language);

  page.drawText(appendix, { x: centeredX(bold, appendix, 32, width), y: height / 2 + 55, size: 32, font: bold, color: BLACK });
  drawCenteredLines(page, titleLines, regular, 22, height / 2);
  drawCenteredPageRange(page, pagesLabel, pageRange, regular, 15, height / 2 - 78, language);
}

function centeredCellX(font: PDFFont, text: string, size: number, left: number, right: number): number {
  return left + (right - left - font.widthOfTextAtSize(text, size)) / 2;
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
    const left = 48;
    const right = width - 48;
    const pagesRight = left + 82;
    const appendixLeft = right - 92;
    const headerTop = height - 118;
    const rowHeight = 32;
    const headerBottom = headerTop - rowHeight;
    const rows = appendixSources.slice(offset, offset + 18);
    const tableBottom = headerBottom - rows.length * rowHeight;
    const headerSize = 12;
    const bodySize = 13;

    page.drawText(title, { x: centeredX(bold, title, 25, width), y: height - 72, size: 25, font: bold, color: BLACK });
    [left, pagesRight, appendixLeft, right].forEach((x) => page.drawLine({
      start: { x, y: headerTop }, end: { x, y: tableBottom }, thickness: 0.6, color: GRID,
    }));
    page.drawLine({ start: { x: left, y: headerTop }, end: { x: right, y: headerTop }, thickness: 0.8, color: GRID });
    page.drawLine({ start: { x: left, y: headerBottom }, end: { x: right, y: headerBottom }, thickness: 0.8, color: GRID });

    const pagesHeader = visualText(copy.pages, language);
    const nameHeader = visualText(copy.name, language);
    const appendixHeader = visualText(copy.appendix, language);
    page.drawText(pagesHeader, { x: centeredCellX(bold, pagesHeader, headerSize, left, pagesRight), y: headerBottom + 10, size: headerSize, font: bold, color: BLACK });
    page.drawText(nameHeader, { x: centeredCellX(bold, nameHeader, headerSize, pagesRight, appendixLeft), y: headerBottom + 10, size: headerSize, font: bold, color: BLACK });
    page.drawText(appendixHeader, { x: centeredCellX(bold, appendixHeader, headerSize, appendixLeft, right), y: headerBottom + 10, size: headerSize, font: bold, color: BLACK });

    let rowTop = headerBottom;
    rows.forEach((section) => {
      const document = documents.get(section.documentId);
      if (!document) return;
      const entry = fitLine(document.title, regular, bodySize, appendixLeft - pagesRight - 16, language);
      const appendix = visualText(`${copy.appendix} ${section.appendixLabel}`, language);
      const cover = plan.sections.find(
        (candidate) => candidate.kind === "cover" && candidate.documentId === section.documentId,
      );
      const range = `${cover?.startPage ?? section.startPage}–${section.endPage}`;
      const baseline = rowTop - 21;
      const entryWidth = regular.widthOfTextAtSize(entry, bodySize);
      page.drawText(range, { x: centeredCellX(regular, range, bodySize, left, pagesRight), y: baseline, size: bodySize, font: regular, color: BLACK });
      page.drawText(entry, { x: appendixLeft - 8 - entryWidth, y: baseline, size: bodySize, font: regular, color: BLACK });
      page.drawText(appendix, { x: centeredCellX(regular, appendix, bodySize, appendixLeft, right), y: baseline, size: bodySize, font: regular, color: BLACK });
      rowTop -= rowHeight;
      page.drawLine({ start: { x: left, y: rowTop }, end: { x: right, y: rowTop }, thickness: 0.5, color: GRID });
    });
  }
}

function drawPageNumber(page: PDFPage, number: number, font: PDFFont): void {
  const text = String(number);
  const size = 12;
  const { width, height } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const margin = 18;
  if (rotation === 90) {
    page.drawText(text, { x: width - margin, y: margin, size, font, color: BLACK, rotate: degrees(90) });
  } else if (rotation === 180) {
    page.drawText(text, { x: width - margin, y: height - margin, size, font, color: BLACK, rotate: degrees(180) });
  } else if (rotation === 270) {
    page.drawText(text, { x: margin, y: height - margin, size, font, color: BLACK, rotate: degrees(-90) });
  } else {
    page.drawText(text, { x: margin, y: margin, size, font, color: BLACK });
  }
}

function drawAppendixMarker(page: PDFPage, label: string, font: PDFFont, language: "he" | "en"): void {
  const text = visualText(`${outputCopy(language).appendix} ${label}`, language);
  const size = 14;
  const padding = 9;
  const boxWidth = font.widthOfTextAtSize(text, size) + padding * 2;
  const boxHeight = 34;
  const margin = 18;
  const { width, height } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  let x = margin;
  let y = height - boxHeight - margin;
  let textX = x + padding;
  let textY = y + 10;
  let boxRotation = 0;
  let textRotation = 0;
  if (rotation === 90) {
    x = margin;
    y = margin + boxWidth;
    textX = x + boxHeight - 10;
    textY = margin + padding;
    boxRotation = -90;
    textRotation = 90;
  } else if (rotation === 180) {
    x = width - margin;
    y = margin + boxHeight;
    textX = x - padding;
    textY = y - 10;
    boxRotation = 180;
    textRotation = 180;
  } else if (rotation === 270) {
    x = width - margin;
    y = height - margin - boxWidth;
    textX = x - boxHeight + 10;
    textY = y + boxWidth - padding;
    boxRotation = 90;
    textRotation = -90;
  }
  page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, color: WHITE, borderColor: BLACK, borderWidth: 0.8, rotate: degrees(boxRotation) });
  page.drawText(text, { x: textX, y: textY, size, font, color: BLACK, rotate: degrees(textRotation) });
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
      const source = plan.sections.find(
        (candidate) => candidate.kind === "source" && candidate.documentId === section.documentId,
      );
      if (document && source?.kind === "source") {
        addCover(output, document, section.appendixLabel, `${section.startPage}–${source.endPage}`, regular, bold, snapshot);
      }
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
