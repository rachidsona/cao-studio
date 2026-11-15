/** Le clic droit sur un tiroir : « Modifier les tiroirs… » règle ceux du caisson sur place — nombre, pose. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const DOC = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [
  { id: "cb1", type: "cabinet", name: "Bas tiroirs", origin: [0, -560, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 150, construction: "sides-through" },
  { id: "fr1", type: "fronts", name: "Façades Bas tiroirs", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true },
] };

test("clic droit sur un tiroir : le panneau des tiroirs change leur nombre et leur pose", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "zz-test-tiroirs-clic-droit");
  const id = await page.evaluate(async (document) => {
    const token = window.document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
    const r = await fetch("/api/projects/", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": token, Accept: "application/json" }, body: JSON.stringify({ name: "zz-test-tiroirs", document }) });
    return (await r.json()).id as string;
  }, DOC);
  await page.goto(`/projects/${id}/editor/`);
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText("Façade tiroir 3").first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(1500);

  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2, { button: "right" });
  const menu = page.locator("[data-tree-menu]");
  await expect(menu).toContainText("Tiroirs — Bas tiroirs");
  await menu.getByText("Modifier les tiroirs…").click();
  const panel = page.getByRole("dialog", { name: "Modifier les tiroirs" });
  await panel.getByLabel("Nombre de tiroirs").selectOption("4");
  await expect(page.getByText("Façade tiroir 4").first()).toBeVisible({ timeout: 60_000 });
  await panel.getByLabel("Pose").selectOption("inset");
  await expect(panel.getByLabel("Pose")).toHaveValue("inset");
  await shot(page, "tiroirs-panneau");
  await panel.getByRole("button", { name: "Fermer" }).click();
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});
