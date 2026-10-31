import JSZip from "jszip";
import type {
  CompilationSettings,
  DocumentRole,
  WorkflowMode,
} from "../domain/compilation-planner";
import { normalizeCompilationSettings } from "../domain/compilation-planner";
import { MAX_COMPILATION_BYTES } from "../domain/limits";

export type SourceMediaType = "application/pdf" | "image/png" | "image/jpeg";

export interface StoredDocument {
  id: string;
  name: string;
  type: SourceMediaType;
  title: string;
  pageCount: number;
  role?: DocumentRole;
  bytes: Uint8Array;
}

export interface CompilationSnapshot {
  mode: WorkflowMode;
  documents: StoredDocument[];
  settings: CompilationSettings;
}

interface ManifestDocument extends Omit<StoredDocument, "bytes"> {
  archivePath: string;
  byteLength: number;
}

interface ManifestV1 {
  format: "appendix-merger";
  version: 1;
  mode: WorkflowMode;
  documents: ManifestDocument[];
  settings: CompilationSettings;
}

export class CompilationFileError extends Error {
  constructor(public readonly code: "INVALID_ARCHIVE" | "UNSUPPORTED_VERSION" | "MISSING_DOCUMENT" | "SIZE_LIMIT_EXCEEDED") {
    super(code);
    this.name = "CompilationFileError";
  }
}

export async function exportCompilationFile(snapshot: CompilationSnapshot): Promise<Uint8Array> {
  const zip = new JSZip();
  const documents = snapshot.documents.map<ManifestDocument>((document, index) => {
    const archivePath = `documents/${String(index + 1).padStart(3, "0")}.bin`;
    zip.file(archivePath, document.bytes);
    const { bytes: _bytes, ...metadata } = document;
    return { ...metadata, archivePath, byteLength: document.bytes.byteLength };
  });
  const manifest: ManifestV1 = {
    format: "appendix-merger",
    version: 1,
    mode: snapshot.mode,
    documents,
    settings: snapshot.settings,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function importCompilationFile(bytes: Uint8Array): Promise<CompilationSnapshot> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new CompilationFileError("INVALID_ARCHIVE");
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new CompilationFileError("INVALID_ARCHIVE");

  let manifest: ManifestV1;
  try {
    manifest = JSON.parse(await manifestFile.async("string")) as ManifestV1;
  } catch {
    throw new CompilationFileError("INVALID_ARCHIVE");
  }
  if (manifest.format !== "appendix-merger") throw new CompilationFileError("INVALID_ARCHIVE");
  if (manifest.version !== 1) throw new CompilationFileError("UNSUPPORTED_VERSION");
  if (!Array.isArray(manifest.documents)) throw new CompilationFileError("INVALID_ARCHIVE");
  const declaredSize = manifest.documents.reduce((total, document) => total + Number(document.byteLength), 0);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) throw new CompilationFileError("INVALID_ARCHIVE");
  if (declaredSize > MAX_COMPILATION_BYTES) throw new CompilationFileError("SIZE_LIMIT_EXCEEDED");

  const documents: StoredDocument[] = [];
  let actualSize = 0;
  for (const document of manifest.documents) {
    const archived = zip.file(document.archivePath);
    if (!archived) throw new CompilationFileError("MISSING_DOCUMENT");
    const bytes = await archived.async("uint8array");
    actualSize += bytes.byteLength;
    if (actualSize > MAX_COMPILATION_BYTES) throw new CompilationFileError("SIZE_LIMIT_EXCEEDED");
    if (bytes.byteLength !== document.byteLength) throw new CompilationFileError("INVALID_ARCHIVE");
    if (!["application/pdf", "image/png", "image/jpeg"].includes(document.type)) throw new CompilationFileError("INVALID_ARCHIVE");
    const { archivePath: _archivePath, byteLength: _byteLength, ...metadata } = document;
    documents.push({ ...metadata, type: document.type as SourceMediaType, bytes });
  }
  return { mode: manifest.mode, documents, settings: normalizeCompilationSettings(manifest.settings) };
}
