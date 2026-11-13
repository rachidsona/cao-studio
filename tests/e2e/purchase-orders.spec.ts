/** Bons de commande : un fournisseur ajouté, un article confié à un autre, les bons téléchargés. */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("les bons de commande se partagent entre deux fournisseurs, gardés par le navigateur, et se téléchargent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-bons-de-commande");
  // A caisson with its door: boards, hinges, handle.
  await click(page, '[data-action="cabinet"]');
  const cabinet = page.getByRole("dialog", { name: "Caisson" });
  await cabinet.getByRole("combobox", { name: "Portes" }).selectOption("flat");
  await page.waitForTimeout(800);
  await cabinet.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");

  await click(page, '[data-workshop="purchase-orders"]');
  const dialog = page.getByRole("dialog", { name: "Bons de commande" });
  await expect(dialog).toContainText("Aucun fournisseur");
  await expect(dialog.locator('[data-order=""]')).toContainText("À attribuer");

  // A first supplier: it sells everything at first.
  await dialog.getByRole("button", { name: "Ajouter un fournisseur" }).click();
  const name = dialog.getByRole("textbox", { name: "Nom du fournisseur" });
  await name.fill("Panneaux du Sud");
  await name.press("Tab");
  await expect(dialog.locator('[data-order="f1"]')).toContainText("Panneaux du Sud —");
  await expect(dialog.locator('[data-order=""]')).toHaveCount(0);
  // A second one, for the hardware.
  await dialog.getByRole("button", { name: "Ajouter un fournisseur" }).click();
  await dialog.getByRole("checkbox", { name: "Panneaux du Sud vend : Quincaillerie" }).uncheck();
  await dialog.getByRole("checkbox", { name: "Fournisseur 2 vend : Quincaillerie" }).check();
  await expect(dialog.locator('[data-order="f2"]')).toContainText("Fournisseur 2 —");
  await expect(dialog.locator('[data-order="f2"]')).toContainText(/Charnière/);
  // The back panel (10 mm) given to the second one.
  const back = dialog.getByRole("combobox", { name: /^Fournisseur de .* 10 mm$/ });
  await back.selectOption({ label: "Fournisseur 2" });
  await expect(dialog.locator('[data-order="f2"]')).toContainText("10 mm");
  await expect(dialog.locator('[data-order="f1"]')).not.toContainText("10 mm");

  // Downloaded: a page and a CSV for each.
  const waiting = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Télécharger (.zip)" }).click();
  const files = unzipSync(new Uint8Array(await readFile(await (await waiting).path())));
  expect(Object.keys(files).sort()).toEqual(["bon-fournisseur-2.csv", "bon-panneaux-du-sud.csv", "bons-de-commande.html"]);
  const html = strFromU8(files["bons-de-commande.html"]!);
  expect(html.match(/<section class="order">/g)).toHaveLength(2);
  expect(strFromU8(files["bon-panneaux-du-sud.csv"]!)).toContain("18 mm;");
  expect(strFromU8(files["bon-fournisseur-2.csv"]!)).toMatch(/Charnière/);
  await dialog.getByRole("button", { name: "Fermer", exact: true }).last().click();

  // Kept by the browser: opened again, the same suppliers.
  await click(page, '[data-workshop="purchase-orders"]');
  await expect(page.getByRole("dialog", { name: "Bons de commande" }).locator('[data-order="f2"]')).toContainText("10 mm");
  expect(errors).toEqual([]);
});
