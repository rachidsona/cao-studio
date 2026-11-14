/** Vue éclatée dans la mise en plan : la vue isométrique du caisson exemple, ses pièces écartées de 30 %. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

test("la vue isométrique du caisson, éclatée à 30 %", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "zz-eclatee");
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.locator("[data-project-menu] summary").click();
  await page.locator("[data-project-menu]").getByRole("menuitem", { name: "Mise en plan du caisson sélectionné" }).click();
  const workspace = page.getByRole("dialog", { name: "Mise en plan" });
  const views = workspace.locator('[data-drawing-stage] g[data-id^="view"]');
  await expect(views).toHaveCount(4);
  // The isometric view: the last one laid.
  const iso = views.last();
  const before = (await iso.boundingBox())!;
  // A click on one of its lines chooses the view.
  const edge = (await iso.locator("line").first().boundingBox())!;
  await page.mouse.click(edge.x + edge.width / 2, edge.y + edge.height / 2);
  const share = workspace.getByRole("combobox", { name: "Vue éclatée : écart des pièces" });
  await expect(share).toBeVisible();
  await share.selectOption("0.3");
  await expect.poll(async () => (await views.last().boundingBox())!.width).toBeGreaterThan(before.width * 1.2);
  await shot(page, "vue-eclatee");
  expect(errors).toEqual([]);
});
