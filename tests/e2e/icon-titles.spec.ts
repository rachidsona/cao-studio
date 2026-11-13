/** Survolée, une icône d'outil ne montre que son nom ; la recherche d'outils trouve encore ce qui l'explique. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("la bulle d'une icône d'outil dit son nom seulement", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-bulles");
  const shell = page.locator('[data-ribbon="model"] [data-action="shell"]');
  await expect(shell).toHaveAttribute("title", "Coque");
  await expect(shell).toHaveAttribute("data-hint", /creuser le corps/);
  await expect(page.locator('[data-ribbon="model"] [data-action="hollow"]')).toHaveAttribute("title", "Vider un corps");
  await expect(page.locator('[data-ribbon="model"] [data-action="fillet"]')).toHaveAttribute("title", "Congé");
  // No icon of the model's ribbon still says more than its name.
  const long = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-ribbon="model"] button[title]')]
      .filter((b) => b.querySelector("svg") && !b.textContent?.trim() && b.title.includes(" : "))
      .map((b) => b.title),
  );
  expect(long).toEqual([]);
  // The tool search still finds a tool by what it does.
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Rechercher un outil" });
  await search.fill("creuser");
  await expect(page.getByRole("listbox", { name: "Commandes" })).toContainText("Coque");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
