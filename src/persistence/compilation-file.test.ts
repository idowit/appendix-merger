import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { MAX_COMPILATION_BYTES } from "../domain/limits";
import { CompilationFileError, exportCompilationFile, importCompilationFile } from "./compilation-file";

describe("Compilation File", () => {
  it("round-trips documents, ordering, roles, titles, and output settings", async () => {
    const original = {
      mode: "appendix" as const,
      documents: [
        {
          id: "main",
          name: "claim.pdf",
          type: "application/pdf",
          title: "כתב תביעה",
          pageCount: 1,
          role: "main" as const,
          bytes: new Uint8Array([37, 80, 68, 70]),
        },
        {
          id: "appendix-a",
          name: "contract.png",
          type: "image/png",
          title: "הסכם",
          pageCount: 1,
          role: "appendix" as const,
          bytes: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      settings: {
        numbering: "hebrew" as const,
        outputLanguage: "he" as const,
        tableOfContents: false,
        appendixCovers: false,
        appendixMarkers: true,
        pageNumbers: true,
      },
    };

    const archive = await exportCompilationFile(original);
    const restored = await importCompilationFile(archive);

    expect(restored).toEqual(original);
  });

  it("rejects an archive that declares more than the workspace size limit", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({
      format: "appendix-merger",
      version: 1,
      mode: "quick-merge",
      settings: { numbering: "decimal", outputLanguage: "en", appendixMarkers: false, pageNumbers: false },
      documents: [{ id: "large", name: "large.pdf", type: "application/pdf", title: "Large", pageCount: 1, archivePath: "documents/001.bin", byteLength: MAX_COMPILATION_BYTES + 1 }],
    }));
    zip.file("documents/001.bin", new Uint8Array([1]));

    await expect(importCompilationFile(await zip.generateAsync({ type: "uint8array" })))
      .rejects.toEqual(new CompilationFileError("SIZE_LIMIT_EXCEEDED"));
  });

  it("adds TOC and cover defaults when importing an older compilation file", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({
      format: "appendix-merger",
      version: 1,
      mode: "quick-merge",
      settings: { numbering: "decimal", outputLanguage: "en", outputStyle: "minimal", appendixMarkers: false, pageNumbers: false },
      documents: [{ id: "one", name: "one.pdf", type: "application/pdf", title: "One", pageCount: 1, archivePath: "documents/001.bin", byteLength: 1 }],
    }));
    zip.file("documents/001.bin", new Uint8Array([1]));

    const restored = await importCompilationFile(await zip.generateAsync({ type: "uint8array" }));

    expect(restored.settings).toEqual({
      numbering: "decimal",
      outputLanguage: "en",
      tableOfContents: true,
      appendixCovers: true,
      appendixMarkers: false,
      pageNumbers: false,
    });
  });
});
