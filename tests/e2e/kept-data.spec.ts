/** Ce qu'on garde pour tous ses projets (« Mes caissons », fournisseurs…) est gardé par le serveur : le navigateur vidé, il revient. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("les fournisseurs et Mes caissons gardés par le serveur reviennent après avoir vidé le navigateur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-donnees-gardees");
  await page.evaluate(() => {
    localStorage.setItem("cao.suppliers", JSON.stringify([{ name: "Panneaux du Sud" }]));
    localStorage.setItem("cao.kitchen-own-units", JSON.stringify([{ name: "Mon caisson rangement" }]));
  });
  // Sent a moment later.
  await expect
    .poll(() => page.evaluate(async () => ((await (await fetch("/api/kept/")).json()) as { data: Record<string, string> }).data), { timeout: 10_000 })
    .toMatchObject({ "cao.suppliers": JSON.stringify([{ name: "Panneaux du Sud" }]), "cao.kitchen-own-units": JSON.stringify([{ name: "Mon caisson rangement" }]) });
  // The browser emptied (another computer, or its data cleared): opened again, they are back.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await page.evaluate(() => localStorage.getItem("cao.suppliers"))).toBe(JSON.stringify([{ name: "Panneaux du Sud" }]));
  expect(await page.evaluate(() => localStorage.getItem("cao.kitchen-own-units"))).toBe(JSON.stringify([{ name: "Mon caisson rangement" }]));
  expect(errors).toEqual([]);
});
