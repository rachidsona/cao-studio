/** Le Plan de cuisine dans un vrai navigateur : le plan vu de dessus, un linéaire aménagé sur sa bande de face, la cuisine proposée, le plan modifié. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

/** Where to keep pictures of each step, when asked (SHOTS=<dossier>). */
const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const tree = (page: Page) => page.evaluate(() => document.body.innerText);

test("plan de cuisine : plan en L avec îlot, mur A aménagé, cuisine proposée puis plan modifié", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-plan-cuisine");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByLabel("Îlot", { exact: true }).check();
  await expect(tool.getByLabel("Mur B passe", { exact: false }).or(tool.getByLabel("Angle gauche"))).toBeVisible();
  await shot(page, "1-reglages");
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const runs = tool.getByRole("list", { name: "Linéaires du plan" });
  await expect(runs.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Plan de la cuisine").first()).toBeVisible();

  // Wall A, unit by unit on its front view.
  await tool.locator('[data-open-run="A"]').click();
  await expect(tool.getByRole("heading", { name: "Linéaire — mur A" })).toBeVisible();
  await tool.getByRole("tab", { name: "Électro." }).click();
  await tool.locator('[data-add="app-sink-600"]').click();
  await tool.locator('[data-add="app-dishwasher-600"]').click();
  await tool.getByRole("tab", { name: "Bas" }).click();
  await tool.locator('[data-add="base-bas-3-tiroirs-600"]').click();
  await tool.getByRole("tab", { name: "Électro." }).click();
  await tool.locator('[data-add="app-hob-oven-600"]').click();
  await tool.getByRole("tab", { name: "Hauts" }).click();
  await tool.locator('[data-add="wall-haut-1-porte-600"]').click();
  await expect(tool.locator('[data-run-strip="A"] [data-item]')).toHaveCount(5);
  await expect(tool.locator("[data-run-checks]")).toContainText("Fileur de");
  // The drawers chosen on the strip, a step to the left, then wider.
  await tool.locator('[data-run-strip="A"] [data-item]').nth(2).click();
  await expect(tool.locator("[data-run-item]")).toContainText("Bas 3 tiroirs");
  await tool.getByRole("button", { name: "←" }).click();
  await tool.getByLabel("Largeur").selectOption({ label: (await tool.getByLabel("Largeur").locator("option").allTextContents()).find((t) => /^(80|800)/.test(t)) ?? "" });
  await expect(tool.locator('[data-run-strip="A"] [data-filler]')).toHaveCount(1);
  await shot(page, "2-lineaire");
  await tool.locator("[data-run-ok]").click();
  await expect(page.getByText(/Mur A aménagé/).first()).toBeVisible();
  await expect(page.getByText("Évier 600 (A1)").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plan de travail A").first()).toBeVisible();

  // The whole kitchen proposed, as the Implantation does it.
  await tool.locator("[data-propose]").click();
  await page.getByRole("button", { name: "Proposer", exact: true }).click();
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible();
  await expect(page.getByText("Plan de travail B").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Plan de travail I").first()).toBeVisible();
  await expect(page.getByText("Hotte").first()).toBeVisible();
  expect(await tree(page)).toMatch(/Colonne réfrigérateur 600/);
  await shot(page, "3-proposee");

  // The plan changed: the kitchen follows; the island gone, its units with it.
  await tool.getByRole("button", { name: "Modifier le plan" }).click();
  const length = tool.getByLabel(/^Longueur mur A/);
  const unit = (await length.getAttribute("aria-label"))?.match(/\((\w+)\)/)?.[1];
  await length.fill(unit === "mm" ? "4200" : unit === "m" ? "4,2" : "420");
  await length.press("Enter");
  await tool.getByLabel("Îlot", { exact: true }).uncheck();
  await tool.getByRole("button", { name: "Appliquer" }).click();
  await page.getByRole("button", { name: "Appliquer", exact: true }).last().click();
  await expect(runs.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Plan de travail I")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText("Plan de travail A").first()).toBeVisible();
  await tool.getByRole("button", { name: "Terminer" }).click();

  // A unit it made, chosen in the browser: its run opens again.
  await page.evaluate(() => ([...document.querySelectorAll<HTMLElement>('[data-select^="body:"]')].find((b) => /Évier 600/.test(b.textContent ?? "")) as HTMLElement | undefined)?.click());
  await expect(page.getByRole("heading", { name: "Linéaire — mur A" })).toBeVisible();
  await shot(page, "4-rouvert");
  expect(errors).toEqual([]);
});
