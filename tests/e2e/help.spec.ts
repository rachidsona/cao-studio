/** L'aide dans un vrai navigateur : le bouton à côté d'Enregistrer, le sommaire, la recherche et une fiche. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("le bouton Aide ouvre la fiche d'un outil, trouvée par le sommaire ou par la recherche", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Aide e2e");
  await page.locator('header > [data-action="help"]').click();
  const help = page.getByRole("dialog", { name: "Aide", exact: true });
  await expect(help).toContainText("Prise en main");
  await expect(help).toContainText("Palette de commandes");

  await help.locator("summary", { hasText: "Curic" }).click();
  await help.getByRole("button", { name: "Symétrie", exact: true }).click();
  const sheet = help.locator("[data-help-sheet]");
  await expect(sheet.locator("h3")).toHaveText("Symétrie");
  await expect(sheet.locator("header svg")).toHaveCount(1);
  await expect(sheet.locator("ol li").first()).not.toBeEmpty();

  await help.getByRole("searchbox", { name: "Chercher un outil" }).fill("etagere");
  await expect(sheet.locator("h3")).toContainText("Étagère");
  await help.getByRole("searchbox", { name: "Chercher un outil" }).fill("zzzz");
  await expect(help).toContainText("Aucun outil de ce nom.");

  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  expect(errors).toEqual([]);
});
