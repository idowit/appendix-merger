import { expect, test, type Locator, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function onePagePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([420, 595]);
  return Buffer.from(await pdf.save());
}

function onePixelPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
}

async function reachWithTab(page: Page, target: Locator, maximumTabs = 30): Promise<void> {
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("Control was not reachable with the keyboard");
}

test("creates and previews an Appendix Compilation in the Hebrew workspace", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "עריכת תיק נספחים" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { name: "Build an appendix compilation" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByRole("button", { name: "עב" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const pdf = await onePagePdf();
  await page.locator('input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]').setInputFiles([
    { name: "claim.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "contract.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "photo.png", mimeType: "image/png", buffer: onePixelPng() },
  ]);

  await expect(page.getByText("מסמך ראשי", { exact: true })).toBeVisible();
  await expect(page.getByText("נספח", { exact: true })).toHaveCount(2);
  await page.locator("details.settings-panel > summary").click();
  const tocOption = page.getByRole("checkbox", { name: "הוספת תוכן עניינים לפי מספרי העמודים" });
  const coverOption = page.getByRole("checkbox", { name: "הוספת דף שער לפני כל נספח" });
  await expect(tocOption).toBeChecked();
  await expect(coverOption).toBeChecked();
  await tocOption.uncheck();
  await coverOption.uncheck();
  await expect(page.getByText("עמודים משוערים").locator("..").getByText("3", { exact: true })).toBeVisible();
  const chooseFiles = page.getByRole("button", { name: "בחירת קבצים" });
  await reachWithTab(page, chooseFiles);
  await expect(chooseFiles).toBeFocused();
  const dragHandle = page.getByRole("button", { name: "שינוי סדר" }).first();
  await reachWithTab(page, dragHandle);
  await expect(dragHandle).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });

  await page.getByRole("button", { name: "יצירת PDF" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "הקובץ מוכן" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("finished-pdf.png"), fullPage: true });
  expect(consoleErrors).toEqual([]);
});
