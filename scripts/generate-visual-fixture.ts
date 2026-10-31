import { mkdir, readFile, writeFile } from "node:fs/promises";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { generateFinishedPdf } from "../src/pdf/generate-finished-pdf";
import type { StoredDocument } from "../src/persistence/compilation-file";

async function sourcePdf(id: string, pages: Array<{ width: number; height: number; rotation?: number }>): Promise<StoredDocument> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pages.forEach(({ width, height, rotation = 0 }, index) => {
    const page = pdf.addPage([width, height]);
    page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: rgb(0.25, 0.34, 0.44), borderWidth: 1 });
    page.drawText(`${id} source page ${index + 1} / rotation ${rotation}`, { x: 55, y: height - 78, size: 16, font });
    for (let line = 0; line < 12; line += 1) {
      page.drawLine({ start: { x: 55, y: height - 112 - line * 28 }, end: { x: width - 55, y: height - 112 - line * 28 }, thickness: 0.6, color: rgb(0.75, 0.76, 0.77) });
    }
  });
  return {
    id,
    name: `${id}.pdf`,
    type: "application/pdf",
    title: id,
    pageCount: pages.length,
    bytes: await pdf.save(),
  };
}

const main = { ...(await sourcePdf("Main pleading", [{ width: 612, height: 792 }, { width: 500, height: 700 }])), role: "main" as const, title: "כתב תביעה" };
const appendix = {
  ...(await sourcePdf("Lease agreement", [
    { width: 400, height: 600, rotation: 90 },
    { width: 400, height: 600, rotation: 0 },
    { width: 400, height: 600, rotation: 180 },
    { width: 400, height: 600, rotation: 270 },
  ])),
  role: "appendix" as const,
  title: "הסכם שכירות מסחרי ארוך לדוגמה הכולל נספחי תשלומים ערבויות התחייבויות ותנאים מיוחדים",
};
const [regularFont, boldFont] = await Promise.all([
  readFile("public/fonts/David-Regular.ttf"),
  readFile("public/fonts/David-Bold.ttf"),
]);
const finished = await generateFinishedPdf({
  mode: "appendix",
  documents: [main, appendix],
  settings: { numbering: "hebrew", outputLanguage: "he", tableOfContents: true, appendixCovers: true, appendixMarkers: true, pageNumbers: true },
}, { regularFont, boldFont });

await mkdir("tmp/pdfs", { recursive: true });
await writeFile("tmp/pdfs/visual-fixture.pdf", finished);
