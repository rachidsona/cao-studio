/** Concevoir dans la vue, dans un vrai navigateur : menu de la niche, copie, cote tapée, étagère tirée, répétition, vue d'un mur, style. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
const tree = (page: Page) => page.getByLabel(/^Navigateur : corps/);

/** A plan with two free walls, wall A made, seen from the front. */
async function ready(page: Page) {
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à gauche", exact: true }).click();
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").first().getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(700);
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  return { tool, at: (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const };
}

test("menu de la niche, copie, cote tapée, étagère tirée, répétition", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Niches e2e");
  const { at } = await ready(page);

  // The menu of a niche opens Étagères on it.
  const [x1, y1] = at(0.38, 0.55);
  await page.mouse.click(x1, y1, { button: "right" });
  const menu = page.getByRole("menu", { name: "Menu de la niche" });
  await menu.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await expect(shelves).toContainText("Niche choisie");
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await expect(tree(page).getByText("Étagères", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1200);

  // That niche copied to the next one, from its menu.
  await page.mouse.click(x1, y1, { button: "right" });
  await menu.getByRole("menuitem", { name: "Copier cette niche" }).click();
  const copy = page.getByRole("dialog", { name: "Copier une niche" });
  await expect(copy).toContainText("Cliquez les niches à faire pareil");
  const [x2, y2] = at(0.62, 0.55);
  await page.mouse.click(x2, y2);
  await expect(page.getByText("Niche copiée.")).toBeVisible();
  await copy.getByRole("button", { name: "Terminer" }).click();
  await expect(tree(page).getByText("Étagères", { exact: true }).first().locator("..")).toContainText("6");
  await page.waitForTimeout(1200);

  // A dimension typed in the view.
  const dims = page.locator('[data-piece-dims]');
  if ((await dims.getAttribute("aria-pressed")) !== "true") await click(page, "[data-piece-dims]");
  await page.keyboard.press("Escape");
  await tree(page).getByText("Dessous", { exact: true }).first().click();
  const editable = page.locator(".cad-plan-dim[data-editable]").first();
  await expect(editable).toBeVisible();
  const before = await editable.innerText();
  await editable.click();
  const input = page.getByRole("textbox", { name: "Nouvelle cote" });
  await input.fill("31");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-rachidsanohotmail-fr-Desktop-3D-claude/85f34b85-0394-445b-96b3-5c4231afb9c7/scratchpad/d1.png" });

  // A shelf pulled by its handle.
  await tree(page).getByRole("button", { name: "Déplier Étagères", exact: true }).first().click();
  await tree(page).getByText("Étagère 1", { exact: true }).first().click();
  const handle = page.locator("[data-shelf-handle]");
  await expect(handle).toBeVisible();
  // Its step in the history is framed in green.
  const lit = page.locator("[data-op][data-lit]");
  await expect(lit).toHaveCount(1);
  await expect(lit).toHaveAttribute("aria-label", /^Étagères/);
  await expect(lit).toHaveCSS("border-top-color", "rgb(99, 223, 15)");
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y - 30, { steps: 4 });
  await expect(handle).toContainText("/");
  await page.mouse.up();
  await expect(handle).toBeHidden();
  await page.waitForTimeout(1200);
  await tree(page).getByText("Étagère 1", { exact: true }).first().click();
  await expect(page.locator(".cad-plan-dim").filter({ hasText: /^(60|61|62|63|64|65),?\d?$/ }).first()).toBeVisible();

  // R runs the last tool again, with its settings, on the niche under the pointer.
  await click(page, '[data-action="shelves"]');
  const again = page.getByRole("dialog", { name: "Étagères" });
  await again.getByRole("button", { name: "Terminer" }).click();
  await page.mouse.move(...at(0.2, 0.55));
  await page.keyboard.press("r");
  await expect(page.getByRole("dialog", { name: "Étagères" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(before).not.toBe("");
});

test("voir un mur, mes murs, style du dressing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Style e2e");
  await ready(page);
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await expect(tool.getByRole("list", { name: "Zones du plan" })).toBeVisible();
  await tool.getByRole("button", { name: "Voir" }).click();
  await expect(tool.getByRole("button", { name: "Tout montrer" })).toBeVisible();
  await tool.getByRole("button", { name: "Tout montrer" }).click();

  await tool.getByRole("button", { name: "Garder" }).click();
  await expect(page.getByText(/^Mur gardé/)).toBeVisible();
  await tool.getByRole("button", { name: "Poser" }).click();
  await expect(page.getByText("Mur posé : Mur B.")).toBeVisible();
  await expect(tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").nth(1)).toContainText("Modifier");

  await click(page, '[data-workshop="dressing-style"]');
  const style = page.getByRole("dialog", { name: "Style du dressing" });
  await style.getByRole("button", { name: "Chêne et noir" }).click();
  await expect(page.getByText("Style appliqué : Chêne et noir.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Module marche sur les étagères copiées et alignées, jusqu'au bord et sur un autre mur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await newProject(page, "Module copié e2e");
  const { at } = await ready(page);
  const [mx, my] = at(0.38, 0.55);
  await page.mouse.click(mx, my, { button: "right" });
  await page.getByRole("menuitem", { name: "Étagères" }).click();
  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await shelves.getByRole("combobox").first().selectOption("3");
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  await shelves.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  // The niche at the left edge, seen in perspective, aligned on the model.
  await page.mouse.click(mx, my, { button: "right" });
  await page.getByRole("menuitem", { name: "Aligner sur cette niche" }).click();
  const copy = page.getByRole("dialog", { name: "Copier une niche" });
  await page.mouse.click(...at(0.2, 0.55));
  await expect(page.getByText("Étagères alignées.")).toBeVisible();
  await copy.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(1000);

  await click(page, '[data-action="module"]');
  const mod = page.getByRole("dialog", { name: "Module" });
  await page.mouse.click(...at(0.2, 0.5));
  await expect(mod).toContainText("Modifier : Étagères");
  await mod.getByRole("button", { name: "Penderie longue" }).click();
  await mod.getByRole("button", { name: "OK", exact: true }).click();
  await expect(tree(page).getByText("Penderie 1", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  // A niche of another wall than the last one made: Module follows the click.
  await click(page, '[data-workshop="dressing-plan"]');
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("list", { name: "Zones du plan" }).getByRole("listitem").nth(1).getByRole("button").last().click();
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await partition.getByRole("button", { name: "OK", exact: true }).click();
  await expect(partition).toHaveCount(0);
  await page.waitForTimeout(1000);
  await click(page, '[data-action="view"][data-view="front"]');
  await page.waitForTimeout(700);
  await click(page, '[data-action="module"]');
  await page.waitForTimeout(500);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  await page.mouse.click(view.x + view.width * 0.38, view.y + view.height * 0.55);
  await expect(page.getByRole("dialog", { name: "Module" })).toContainText("Modifier : Étagères");
  expect(errors).toEqual([]);
});
