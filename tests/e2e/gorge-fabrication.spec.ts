/** Entailles de gorge en fabrication : le dossier de production les montre dans la liste de débit, les fiches et le DXF. */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("les côtés entaillés pour la gorge sont dits dans la liste de débit et les fiches, et découpés dans le DXF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-gorge-fabrication");
  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await cabinet.getByRole("combobox", { name: "Portes" }).selectOption("none");
  await page.waitForTimeout(800);
  await cabinet.getByRole("button", { name: "Fermer", exact: true }).click();
  await click(page, '[data-action="fronts"]');
  const tool = page.getByRole("dialog", { name: "Façades" });
  await tool.getByRole("combobox", { name: "Disposition" }).selectOption("drawers");
  await tool.getByRole("checkbox", { name: /^Sans poignée/ }).check();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  await tool.getByRole("button", { name: "Terminer", exact: true }).click();

  // The cut list: the two sides together, « entaillé ».
  await click(page, '[data-workshop="cutlist"]');
  const list = page.getByRole("dialog", { name: "Liste de débit" });
  await expect(list.locator("[data-cut-notches]")).toHaveCount(1);
  await expect(list.locator("[data-cut-notches]")).toHaveAttribute("title", /^3 entailles 5,7 × 2,6 cm à l'avant \(profil gorge\), leur bas à [\d,]+ ; [\d,]+ ; [\d,]+ cm du bas du côté$/);
  await list.getByRole("button", { name: "Fermer", exact: true }).first().click();

  // The production folder.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("dossier production");
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { name: "Dossier de production" });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const window = page.locator("div.fixed").filter({ has: heading });
  const waiting = page.waitForEvent("download");
  await window.getByRole("button", { name: /^Télécharger/ }).click();
  const files = unzipSync(new Uint8Array(await readFile(await (await waiting).path())));
  const text = (name: string) => strFromU8(files[name]!);
  expect(text("01-liste-de-debit.csv")).toMatch(/Côté gauche, .*Côté droit \(3 entailles/);
  expect(text("03-fiches-de-fabrication.html")).toContain("<th>Entailles</th><td>3 entailles");
  // In the DXF, each part's entities come before its label: the side's outline is notched — 16 lines, a rectangle
  // notched three times.
  const dxf = text("05-pieces-cnc.dxf");
  const parts = dxf.split(/\r\nTEXT\r\n/);
  const left = parts.findIndex((chunk, i) => i > 0 && /^8\r\nTEXTE[\s\S]*?\r\n1\r\n[^\r]*Cote gauche/.test(chunk));
  expect(left).toBeGreaterThan(0);
  const lines = (chunk: string) => (chunk.match(/\r\nLINE\r\n/g) ?? []).length;
  // The chunk before the label holds the side's entities (after the previous label).
  expect(lines(parts[left - 1]!)).toBe(16);
  expect(errors).toEqual([]);
});
