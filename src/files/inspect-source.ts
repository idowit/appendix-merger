import { PDFDocument } from "pdf-lib";
import type { DocumentRole } from "../domain/compilation-planner";
import type { SourceMediaType, StoredDocument } from "../persistence/compilation-file";
import { MAX_COMPILATION_BYTES } from "../domain/limits";

export { MAX_COMPILATION_BYTES } from "../domain/limits";

export type SourceInspectionCode =
  | "UNSUPPORTED_FORMAT"
  | "ENCRYPTED_PDF"
  | "INVALID_PDF"
  | "EMPTY_FILE"
  | "SIZE_LIMIT_EXCEEDED";

export class SourceInspectionError extends Error {
  constructor(public readonly code: SourceInspectionCode, public readonly filename: string) {
    super(`${code}:${filename}`);
    this.name = "SourceInspectionError";
  }
}

function normalizedType(file: File): SourceMediaType | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return null;
}

export async function inspectSource(file: File, role?: DocumentRole): Promise<StoredDocument> {
  const type = normalizedType(file);
  if (!type) throw new SourceInspectionError("UNSUPPORTED_FORMAT", file.name);
  if (file.size === 0) throw new SourceInspectionError("EMPTY_FILE", file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pageCount = 1;
  if (type === "application/pdf") {
    try {
      const pdf = await PDFDocument.load(bytes);
      pageCount = pdf.getPageCount();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      throw new SourceInspectionError(message.includes("encrypt") ? "ENCRYPTED_PDF" : "INVALID_PDF", file.name);
    }
  }
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type,
    title: file.name.replace(/\.[^.]+$/, ""),
    pageCount,
    role,
    bytes,
  };
}

export function assertWithinSizeLimit(existing: StoredDocument[], incoming: File[]): void {
  const total = existing.reduce((sum, document) => sum + document.bytes.byteLength, 0)
    + incoming.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_COMPILATION_BYTES) {
    throw new SourceInspectionError("SIZE_LIMIT_EXCEEDED", incoming[0]?.name ?? "");
  }
}
