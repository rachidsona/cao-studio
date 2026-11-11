/** La recherche du Navigateur et son bouton « cachés seulement ». */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("le Navigateur trouve un élément par son nom et montre seulement les éléments cachés", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-navigateur-recherche");
  const tree = page.locator('[data-ref="tree"]');
  const search = page.getByRole("searchbox", { name: "Rechercher dans le Navigateur" });
  const hiddenOnly = page.getByRole("button", { name: "Afficher seulement les éléments cachés" });
  const bodyRow = tree.locator('[data-select^="body:"]');
  const sketchRow = tree.locator('[data-select^="sketch:"]');
  await expect(bodyRow).toHaveCount(1);
  await expect(sketchRow).toHaveCount(1);

  // By its name, accents and capitals aside.
  await search.fill("ESQUISSE");
  await expect(sketchRow).toHaveCount(1);
  await expect(bodyRow).toHaveCount(0);
  await expect(tree).toContainText("Aucun corps trouvé.");
  await search.fill("corps 1");
  await expect(bodyRow).toHaveCount(1);
  await expect(sketchRow).toHaveCount(0);
  // Escape empties the field: all back.
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(sketchRow).toHaveCount(1);

  // Nothing hidden yet: the button shows nothing.
  await hiddenOnly.click();
  await expect(hiddenOnly).toHaveAttribute("aria-pressed", "true");
  await expect(bodyRow).toHaveCount(0);
  await expect(sketchRow).toHaveCount(0);
  await hiddenOnly.click();

  // The body hidden by its eye: alone in the list with the button; shown again, it leaves the list.
  await tree.getByRole("button", { name: "Masquer Corps 1" }).click();
  await hiddenOnly.click();
  await expect(bodyRow).toHaveCount(1);
  await expect(sketchRow).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/navigateur-caches.png` });
  await tree.getByRole("button", { name: "Afficher Corps 1" }).click();
  await expect(bodyRow).toHaveCount(0);
  await hiddenOnly.click();
  await expect(bodyRow).toHaveCount(1);
  expect(errors).toEqual([]);
});
