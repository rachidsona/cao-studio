/** La Pièce remplie d'un relevé de télémètre collé : les murs, leurs longueurs et leurs angles repris tels quels. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test("pièce : un relevé collé remplace les murs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-releve-colle");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="room"]')?.click());
  const tool = page.getByRole("dialog", { name: "Pièce" });
  await tool.getByRole("button", { name: "Coller un relevé…" }).click();
  await tool.locator("[data-room-survey]").fill("Mur;Longueur (m);Angle\n1;3,452;90\n2;2,498;90\n3;3,452;90\n4;2,498;90");
  await tool.getByRole("button", { name: "Remplacer les murs" }).click();
  await expect(page.getByText("4 mur(s) repris du relevé.").first()).toBeVisible();
  await expect(tool.getByLabel(/^Mur A : longueur/)).toHaveValue(/345,2|3452|3,452/);
  await shot(page, "releve-colle");
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("Pièce 1").first()).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
