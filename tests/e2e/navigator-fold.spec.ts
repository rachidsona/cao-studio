/** Le Navigateur se replie par la flèche de son titre ; un onglet au bord de la vue le rouvre. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("le Navigateur replié laisse sa place à la vue, l'onglet « Navigateur » le rouvre, et c'est retenu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-navigateur-replie");
  const tree = page.locator('[data-ref="panel-tree"]');
  const tab = page.locator("[data-navigator-unfold]");
  const viewLeft = async () => (await page.locator('[data-ref="workspace"]').boundingBox())!.x;
  await expect(tree).toBeVisible();
  await expect(tab).toBeHidden();
  const open = await viewLeft();

  await page.getByRole("button", { name: "Replier le Navigateur" }).click();
  await expect(tree).toBeHidden();
  await expect(tab).toBeVisible();
  expect(await viewLeft()).toBeLessThan(open - 150);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/navigateur-replie.png` });

  // Kept from one visit to the next.
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(tree).toBeHidden();

  await tab.click();
  await expect(tree).toBeVisible();
  await expect(tab).toBeHidden();
  expect(Math.abs((await viewLeft()) - open)).toBeLessThan(2);

  // On a narrow screen, folded or not, the « Arbre » button still opens it as a sheet.
  await page.getByRole("button", { name: "Replier le Navigateur" }).click();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(tab).toBeHidden();
  await page.getByRole("button", { name: "Arbre", exact: true }).click();
  await expect(tree).toBeVisible();
  expect(errors).toEqual([]);
});
