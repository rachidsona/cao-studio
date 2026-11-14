/** « Fichier PDF » de la mise en plan : un vrai PDF téléchargé, une page par feuille, à la taille de la feuille, le cartouche dedans. */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("la mise en plan téléchargée en PDF, sans boîte d'impression", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Plans PDF e2e");
  await page.locator('header > [data-workshop="drawing"]').click();
  const workspace = page.getByRole("dialog", { name: "Mise en plan" });
  await expect(workspace.locator('[data-drawing-stage] g[data-id^="view"]')).toHaveCount(4);
  // Dimensioned: their arrows and texts go into the file too.
  await workspace.getByRole("button", { name: "Cotes auto" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), workspace.getByRole("button", { name: "Fichier PDF" }).click()]);
  expect(download.suggestedFilename()).toBe("Plans PDF e2e - plans.pdf");
  const path = await download.path();
  const pdf = readFileSync(path!, "latin1");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("/Count 1");
  // An A3 sheet, landscape (the default format), in points.
  expect(pdf).toMatch(/\/MediaBox \[0 0 (1190\.55\d*|841\.88\d*) (841\.88\d*|595\.27\d*)\]/);
  expect(pdf).toContain("(Plans PDF e2e) Tj");
  if (process.env.SHOTS) await download.saveAs(`${process.env.SHOTS}/plans.pdf`);
  expect(errors).toEqual([]);
});
