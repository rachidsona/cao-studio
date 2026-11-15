/** Le DXF pour la commande numérique avec les calques d'une machine : woodWOP choisi, enregistré sous son nom, exporté. */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un bureau exporté en DXF avec les calques woodWOP, la machine gardée sous son nom", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-dxf-machines");
  await click(page, '[data-workshop="furniture"]');
  const tool = page.getByRole("dialog", { name: "Assistant meuble" });
  await tool.getByRole("combobox", { name: "Meuble" }).selectOption("desk");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("« Bureau 1 » posé")).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();

  await click(page, '[data-workshop="dxf"]');
  const dialog = page.getByRole("dialog", { name: "DXF pour la commande numérique" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator("[data-dxf-preset]").selectOption("preset:woodwop");
  await expect(dialog.locator("[data-dxf-example]")).toContainText("FK-1T101R");
  await expect(dialog.getByRole("checkbox", { name: "Contours enchaînés" })).toBeChecked();
  const contour = dialog.getByRole("textbox", { name: "Calque des contours" });
  await contour.fill("FK-1T105R");
  await dialog.getByRole("textbox", { name: "Nom de la machine" }).fill("Weeke de l'atelier");
  await dialog.locator("[data-dxf-save-machine]").click();
  await expect(dialog.locator("[data-dxf-preset]")).toHaveValue("machine:Weeke de l'atelier");

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter", exact: true }).click();
  const dxf = readFileSync((await (await download).path())!, "utf8");
  expect(dxf).toContain("POLYLINE\r\n8\r\nFK-1T105R\r\n");
  expect(dxf).not.toMatch(/\r\nLINE\r\n8\r\nFK-1T105R/);

  // Kept: the next export opens on that machine.
  await click(page, '[data-workshop="dxf"]');
  await expect(dialog.locator("[data-dxf-preset]")).toHaveValue("machine:Weeke de l'atelier");
  await expect(dialog.getByRole("textbox", { name: "Calque des contours" })).toHaveValue("FK-1T105R");
  expect(errors).toEqual([]);
});
