/** Gabarits de perçage 1:1 : la plaque percée du projet neuf en un PDF A4 à l'échelle 1, son trou à sa place. */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("le gabarit de perçage de la plaque, en PDF A4 à l'échelle 1", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-gabarits");
  await expect(page.locator('[data-ref="status-recompute"]')).toContainText("Recalcul", { timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="drill-templates"]')?.click()),
  ]);
  expect(download.suggestedFilename()).toMatch(/gabarits de perçage 1-1\.pdf$/);
  const pdf = readFileSync((await download.path())!, "latin1");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  const count = Number(/\/Count (\d+)/.exec(pdf)![1]);
  expect(count).toBe(1);
  // The plate's hole and its diameter (« Ø » is \330 in the PDF's text).
  expect(pdf).toMatch(/\(\\330[\d.]+\) Tj/);
  // A4 portrait pages, each with its 100 mm bar.
  expect(pdf.match(/\/MediaBox \[0 0 595\.2756 841\.8898\]/g)).toHaveLength(count);
  expect(pdf).toContain("(Imprimer \\340 100 % : la barre doit mesurer 100 mm) Tj");
  await expect(page.getByText(/Gabarits de perçage : \d+ pièces?, \d+ pages? A4/)).toBeVisible();
  if (process.env.SHOTS) await download.saveAs(`${process.env.SHOTS}/gabarits.pdf`);
  expect(errors).toEqual([]);
});
