import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { inspectSource, SourceInspectionError } from "./inspect-source";

describe("inspectSource", () => {
  it("returns trusted page metadata and a title derived from the filename", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const file = new File([await pdf.save()], "כתב תביעה.pdf", { type: "application/pdf" });

    const inspected = await inspectSource(file, "main");

    expect(inspected).toMatchObject({
      name: "כתב תביעה.pdf",
      type: "application/pdf",
      title: "כתב תביעה",
      pageCount: 2,
      role: "main",
    });
    expect(inspected.id).toEqual(expect.any(String));
  });

  it("rejects unsupported formats without affecting other documents", async () => {
    const file = new File(["not supported"], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(inspectSource(file)).rejects.toEqual(new SourceInspectionError("UNSUPPORTED_FORMAT", "notes.docx"));
  });
});
