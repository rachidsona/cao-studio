/** Ce que partagent les parcours dans le navigateur. */
import { expect, type Page } from "@playwright/test";

/** A new account and a new project (the default document: a plate with a hole); returns the project's API URL. */
export async function newProject(page: Page, name: string): Promise<string> {
  const user = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // A throwaway password for this local test account, unlike the user name (Django refuses similar ones).
  const secret = `Copeau-${Math.random().toString(36).slice(2, 10)}-Chene`;
  await page.goto("/accounts/signup/");
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password1"]', secret);
  await page.fill('input[name="password2"]', secret);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL("**/projects/");
  // The tests use the ribbon's tools: in Cuisine and Dressing, the whole ribbon rather than the steps' tools only.
  await page.evaluate(() => {
    localStorage.setItem("cao.steps-ribbon", "1");
    // And every tab in this project, the kitchen's or the dressing's tools on a 3D project (spaces: their own tests).
    localStorage.setItem("cao.free-spaces", "1");
  });
  await page.fill("#id_name", name);
  await page.getByRole("button", { name: "Créer et ouvrir" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const id = page.url().match(/projects\/([0-9a-f-]+)\/editor/)?.[1];
  return `/api/projects/${id}/`;
}
