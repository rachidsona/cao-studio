/** L'aperçu d'un projet : ouvert une première fois, sa vue 3D est envoyée et s'affiche sur sa carte de l'accueil. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("la carte d'un projet montre l'image de son modèle", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sent = page.waitForResponse((r) => r.url().endsWith("/thumbnail/") && r.request().method() === "POST", { timeout: 30_000 });
  await newProject(page, "Aperçu e2e");
  expect((await sent).status()).toBe(204);
  await page.goto("/projects/");
  const card = page.locator("[data-project-row]", { hasText: "Aperçu e2e" });
  const image = card.locator("img[data-preview]");
  await expect(image).toBeVisible();
  // A real picture: decoded, as wide as the card's band.
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(480);
  expect(errors).toEqual([]);
});
