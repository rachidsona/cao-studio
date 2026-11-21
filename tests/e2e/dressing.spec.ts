/**
 * Parcours du dressing dans un vrai navigateur : modules posés et rouverts, outil Niche, étagères supprimées, plan vu de
 * dessus, et les onglets de projets. Chaque test crée son propre compte sur le serveur de test.
 */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { newProject } from "./helpers";

test("Module posé : une étagère sélectionnée mène à ses hauteurs, 40 cm en haut et le reste réparti", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Module change e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);

  await action("module");
  const module = page.getByRole("dialog", { name: "Module" });
  await module.getByRole("button", { name: "Tiroirs et étagères" }).click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Niche équipée : tiroirs et étagères.")).toBeVisible();
  await page.keyboard.press("Escape");

  const tree = page.getByLabel(/^Navigateur : corps/);
  await tree.getByRole("button", { name: "Déplier Étagères", exact: true }).click();
  await tree.getByText("Étagère 3", { exact: true }).first().click();
  await page.getByRole("button", { name: "Modifier Étagères 2" }).click();

  const shelves = page.getByRole("dialog", { name: "Étagères" });
  await expect(shelves).toContainText("Modifier : Étagères 2");
  await shelves.getByLabel("Niches").selectOption("top");
  await shelves.getByLabel(/^Hauteur fixe/).fill("40");
  await shelves.getByLabel(/^Hauteur fixe/).press("Enter");
  await expect(shelves).toContainText(/40 cm \(du bas vers le haut\)/);
  // The dimensions in the view already say it, as the orange preview does.
  await expect(page.locator(".cad-plan-dim").filter({ hasText: /^40$/ }).first()).toBeVisible();
  await shelves.getByRole("button", { name: "OK", exact: true }).click();
  // Kept, and the tool stays on the shelves changed (to set them again); « Terminer » closes it.
  await expect(page.getByText(/^Étagères 2 : /).first()).toBeVisible();
  await expect(shelves).toContainText("Modifier : Étagères 2");
  await shelves.getByRole("button", { name: "Terminer", exact: true }).click();
  await expect(shelves).toHaveCount(0);
  await expect(tree.getByText("Tiroirs 1", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("Étagère 5", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/module-change.png" });
  expect(errors).toEqual([]);
});

test("Niche : un clic, sa hauteur, le reste se partage, et une autre niche ensuite", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Niche e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(middle.x, middle.y);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);

  await action("module");
  const module = page.getByRole("dialog", { name: "Module" });
  await module.getByRole("button", { name: "Tiroirs et étagères" }).click();
  await page.mouse.click(middle.x, middle.y);
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Niche équipée : tiroirs et étagères.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);

  await action("niche");
  const tool = page.getByRole("dialog", { name: "Niche" });
  await expect(tool).toContainText("Cliquez la niche");
  const dims = page.locator(".cad-plan-dim");
  // The niche in the middle of the column of shelves, and the one under the top.
  const view = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".cad-plan-dim")].filter((d) => d.textContent === "33,1").map((d) => d.getBoundingClientRect().y).sort((a, b) => a - b));
  const [highest, centre] = [view[0]!, view[2]!];
  await page.mouse.click(middle.x, centre + 6);
  await tool.getByLabel(/^Hauteur/).fill("20");
  await tool.getByLabel(/^Hauteur/).press("Enter");
  await expect(tool).toContainText("36,35 cm · 36,35 cm · 20 cm · 36,35 cm · 36,35 cm");
  await expect(dims.filter({ hasText: /^20$/ }).first()).toBeVisible();
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Étagères 2 : niche de 20 cm.")).toBeVisible();

  // Still in the tool: the top niche too (once the message no longer covers it); the first keeps its height.
  await expect(page.getByText("Étagères 2 : niche de 20 cm.")).toBeHidden({ timeout: 20000 });
  await page.mouse.click(middle.x, highest + 6);
  await tool.getByLabel(/^Hauteur/).fill("40");
  await tool.getByLabel(/^Hauteur/).press("Enter");
  await expect(tool).toContainText("35,1333 cm · 20 cm · 35,1333 cm · 40 cm");
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Étagères 2 : niche de 40 cm.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/niche-tool.png" });
  expect(errors).toEqual([]);
});

test("Étagères supprimées : leurs traits et leurs niches partent avec elles", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Suppression e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);

  await action("module");
  const module = page.getByRole("dialog", { name: "Module" });
  await module.getByRole("button", { name: "Tiroirs et étagères" }).click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Niche équipée : tiroirs et étagères.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);

  // One of the five: four left, and the niche it divided counts for one in the dimensions of the Niche tool.
  const tree = page.getByLabel(/^Navigateur : corps/);
  const dims = page.locator(".cad-plan-dim");
  await action("niche");
  await expect(dims.filter({ hasText: /^33,1$/ })).toHaveCount(5);
  await page.keyboard.press("Escape");
  await tree.getByRole("button", { name: "Déplier Étagères", exact: true }).click();
  await tree.getByText("Étagère 3", { exact: true }).first().click();
  await page.getByRole("button", { name: /^Supprimer( \(\d+\))?$/ }).first().click();
  await expect(tree.getByText("Étagère 5", { exact: true })).toHaveCount(0);
  await expect(tree.getByText("Étagère 4", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await action("niche");
  await expect(dims.filter({ hasText: /^33,1$/ })).toHaveCount(3);
  await expect(dims.filter({ hasText: /^68$/ }).first()).toBeVisible();

  // Undone in one go.
  await page.keyboard.press("Escape");
  await page.locator('[data-action="undo"]').click();
  await expect(tree.getByText("Étagère 5", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/shelf-removed.png" });
  expect(errors).toEqual([]);
});

test("Onglets : plusieurs projets ouverts, chacun garde son travail, et ils reviennent au rechargement", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Premier e2e");
  const tabs = page.getByRole("tablist", { name: "Projets ouverts" });
  await expect(tabs.getByRole("tab", { name: "Premier e2e" })).toHaveAttribute("aria-selected", "true");

  // A work in the first one, not saved.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="partition"]')?.click());
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();

  // The + makes a second project in its own tab, with its own editor.
  await page.getByLabel("Nouveau projet ou ouvrir un projet").click();
  await page.getByLabel("Nom du nouveau projet").fill("Second e2e");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  const second = page.frameLocator("iframe[data-project-frame]");
  await expect(second.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(second.locator('[data-ref="status-kernel"]')).toHaveText("Noyau OpenCascade prêt");
  await expect(second.getByRole("tab", { name: "Second e2e" })).toHaveAttribute("aria-selected", "true");
  await expect(second.getByRole("tab", { name: "Premier e2e" })).toHaveAttribute("aria-selected", "false");
  await expect(second.getByText("Côtés", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/editor\/$/);
  const url = page.url();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/tabs-second.png" });

  // Back to the first one, at once: the frame stays, the work and its history too.
  await second.getByRole("tab", { name: "Premier e2e" }).click();
  await expect(page.locator("iframe[data-project-frame]")).toHaveCSS("visibility", "hidden");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="undo"]').first()).toBeEnabled();

  // The second one is there again as it was, then the first is closed from it: the second stays.
  await tabs.getByRole("tab", { name: "Second e2e" }).click();
  await expect(page.locator("iframe[data-project-frame]")).toHaveCSS("visibility", "visible");
  await page.waitForTimeout(2500);
  await second.getByLabel("Fermer Premier e2e").click();
  await expect(second.getByRole("tablist", { name: "Projets ouverts" }).getByRole("tab")).toHaveCount(1);

  // Reloading the page opens the tab that was active, and the + offers the project closed.
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(page.url()).toBe(url);
  await expect(tabs.getByRole("tab")).toHaveCount(1);
  await expect(tabs.getByRole("tab", { name: "Second e2e" })).toBeVisible();
  await page.getByLabel("Nouveau projet ou ouvrir un projet").click();
  await expect(page.getByRole("group", { name: "Ouvrir un projet" }).getByRole("button", { name: "Premier e2e" })).toBeVisible();
  await page.getByRole("group", { name: "Ouvrir un projet" }).getByRole("button", { name: "Premier e2e" }).click();
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(second.getByRole("tab", { name: "Premier e2e" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("Plan de dressing : le schéma, une Répartition par zone, l'angle coupé, le plan changé", { tag: "@rapide" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Plan e2e");
  const open = () => page.evaluate(() => document.querySelector<HTMLElement>('[data-workshop="dressing-plan"]')?.click());
  await open();
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "En L à droite, pan coupé" }).click();
  await tool.getByLabel(/^Longueur mur A/).fill("400");
  await tool.getByLabel(/^Longueur mur A/).press("Enter");
  await expect(tool.getByRole("img", { name: "Schéma du plan vu de dessus" })).toContainText("300 cm");
  await tool.getByRole("button", { name: "Créer le plan" }).click();
  const zones = tool.getByRole("list", { name: "Zones du plan" });
  await expect(zones).toBeVisible();

  // The plan on the floor, clicked in the view, comes back too.
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="top"]')?.click());
  await page.waitForTimeout(800);
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  for (let i = 1; i < 12 && !(await tool.count()); i++) {
    for (let j = 1; j < 8 && !(await tool.count()); j++) {
      await page.mouse.click(view.x + (view.width * i) / 12, view.y + (view.height * j) / 8);
      await page.waitForTimeout(60);
    }
  }
  await expect(zones).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="iso"]')?.click());

  // Each zone: its Répartition opens in its own tool; the corner too.
  // (Its « Dedans : » buttons come after it.)
  const zone = (name: string) => zones.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: /^(Modifier|Répartition)$/ });
  const partition = page.getByRole("dialog", { name: "Répartition" });
  await expect(zones.getByRole("listitem")).toHaveCount(3);
  for (const name of ["Mur A", "Angle droit", "Mur C"]) {
    await zone(name).click();
    await expect(partition).toContainText("Modifier");
    await partition.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(partition).toHaveCount(0);
    await page.waitForTimeout(1200);
    await open();
    await expect(zone(name)).toHaveText("Modifier");
  }

  // The door on the slanted front.
  await tool.getByLabel("Porte sur le pan coupé").check();
  await expect(page.getByText("Angle droit — porte", { exact: true }).first()).toBeVisible();

  // Shelves in the corner, as in any Répartition, then the Niche tool on them.
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="top"]')?.click());
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/plan-top.png" });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="iso"]')?.click());

  // The plan changed: what is on it follows, the depth of wall A with it.
  await open();
  await tool.getByRole("button", { name: "Modifier le plan" }).click();
  await tool.getByLabel(/^Longueur mur A/).fill("450");
  await tool.getByLabel(/^Longueur mur A/).press("Enter");
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByText("Plan modifié : ce qui est fait dessus a suivi.")).toBeVisible();
  await expect(zones.getByRole("listitem").filter({ hasText: "Mur A · 350 cm" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ref="status-kernel"]')).toHaveText("Noyau OpenCascade prêt");
  await expect(page.locator('[data-state="error"]')).toHaveCount(0);

  // Saved and read again.
  await page.locator('[data-action="save"]').first().click();
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré");
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await open();
  await expect(zone("Mur C")).toHaveText("Modifier");
  await expect(tool.getByLabel("Porte sur le pan coupé")).toBeChecked();

  // The sketch of the plan, clicked in the browser, shows it again.
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(tool).toHaveCount(0);
  await page.getByText("Plan du dressing", { exact: true }).first().click();
  await expect(zones.getByRole("listitem")).toHaveCount(3);
  await expect(zone("Mur A")).toHaveText("Modifier");
  await page.getByText("Plan du dressing", { exact: true }).first().click();
  await expect(tool).toHaveCount(1);

  // Another model: what it no longer has goes, once asked.
  await tool.getByRole("button", { name: "Modifier le plan" }).click();
  await tool.getByRole("button", { name: "Face à face" }).click();
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByText(/Ce plan n'a plus : Angle droit, Mur C/)).toBeVisible();
  await page.getByRole("button", { name: "Appliquer" }).last().click();
  await expect(zones.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Angle droit — porte", { exact: true })).toHaveCount(0);

  // All the bodies of a zone deleted from the browser: its sketch goes with them, and the zone is free again.
  await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByText("Plan — mur a", { exact: true }).first()).toBeVisible();
  await page.locator('[data-head^="group:"]').filter({ hasText: "Plan — mur a" }).first().click();
  await page.getByRole("button", { name: /^Supprimer( \(\d+\))?$/ }).first().click();
  await expect(page.getByText("Plan — mur a", { exact: true })).toHaveCount(0);
  await page.getByText("Plan du dressing", { exact: true }).first().click();
  await expect(zone("Mur A")).toHaveText("Répartition");
  expect(errors).toEqual([]);
});

test("Module posé, rouvert dans son outil : étagères, tiroirs, hauteur d'une niche", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Module rouvert e2e");
  const action = (name: string) => page.evaluate((a) => document.querySelector<HTMLElement>(`[data-action="${a}"]`)?.click(), name);
  await action("partition");
  const canvas = page.locator("canvas.cad-view");
  const box = (await canvas.boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(middle.x, middle.y);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Côtés", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="view"][data-view="front"]')?.click());
  await page.waitForTimeout(600);

  await action("module");
  const tool = page.getByRole("dialog", { name: "Module" });
  await tool.getByRole("button", { name: "Tiroirs et étagères" }).click();
  await page.mouse.click(middle.x, middle.y);
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Niche équipée : tiroirs et étagères.")).toBeVisible();
  await page.waitForTimeout(1500);

  // A click in the module brings it back, with what it really has.
  await page.mouse.click(middle.x, middle.y);
  await expect(tool).toContainText("Modifier : Tiroirs et étagères");
  await expect(tool.getByLabel("Étagères", { exact: true })).toHaveValue("4");
  await expect(tool.getByLabel("Tiroirs", { exact: true })).toHaveValue("3");
  await tool.getByLabel("Tiroirs", { exact: true }).selectOption("4");
  await tool.getByLabel("Étagères", { exact: true }).selectOption("3");
  await tool.getByLabel(/^Niche 5/).fill("40");
  await tool.getByLabel(/^Niche 5/).press("Enter");
  await expect(tool.getByLabel(/^Niche 5/)).toHaveValue("40");
  await expect(page.locator(".cad-plan-dim").filter({ hasText: /^40$/ }).first()).toBeVisible();
  // Stored by itself a moment later (no « OK »).
  await expect(page.getByText("Module modifié : tiroirs et étagères.")).toBeVisible();
  await page.keyboard.press("Escape");
  const tree = page.getByLabel(/^Navigateur : corps/);
  await tree.getByRole("button", { name: "Déplier Étagères", exact: true }).click();
  await expect(tree.getByText("Étagère 4", { exact: true }).first()).toBeVisible();
  await expect(tree.getByText("Étagère 5", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1500);

  // Back again: its niche is at 40, then the module goes.
  await action("module");
  await page.mouse.click(middle.x, middle.y);
  await expect(tool.getByLabel(/^Niche 5/)).toHaveValue("40");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/module-edit.png" });
  await tool.getByRole("button", { name: "Retirer ce module" }).click();
  await expect(page.getByText("Module retiré : tiroirs et étagères.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tree.getByText("Étagères", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Remplir, palette de commandes, dossier de production : du plan au .zip", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Dossier e2e");

  // The palette finds a tool put away in a menu, without its accents, and launches it.
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await page.keyboard.type("plan de dres");
  await expect(palette.getByRole("option").first()).toContainText("Plan de dressing");
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await tool.getByRole("button", { name: "Droit", exact: true }).click();
  await tool.getByLabel(/^Longueur mur A/).fill("200");
  await tool.getByLabel(/^Longueur mur A/).press("Enter");
  await tool.getByRole("button", { name: "Créer le plan" }).click();

  // A free zone filled to size: three cases and the exact filler.
  await tool.getByRole("button", { name: "Remplir", exact: true }).click();
  await expect(tool).toContainText("Remplir : Mur A");
  await tool.getByRole("button", { name: "3 caissons de 60 cm et un fileur de 11 cm" }).click();
  await expect(page.getByText(/Mur A remplie/)).toBeVisible();
  await expect(tool.getByRole("button", { name: "Modifier", exact: true })).toBeVisible();
  await expect(page.getByText("Mur A — fileur", { exact: true }).first()).toBeVisible();
  // Its inside, straight from the plan: the tools of a niche, each opened on the zone.
  const inside = tool.locator("[data-zone-inside]").first();
  await expect(inside.locator("[data-zone-tool]")).toHaveText(["Module", "Étagères", "Cloisons", "Tiroirs", "Portes", "Penderie"]);
  await inside.locator('[data-zone-tool="module"]').click();
  await expect(page.getByRole("dialog", { name: "Module" })).toBeVisible();
  await page.keyboard.press("Escape");
  await inside.locator('[data-zone-tool="shelves"]').click();
  await expect(page.getByRole("dialog", { name: "Étagères" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The zone was isolated for the tool: the view's bar brings the rest back (the plan's panel gave way to the tool).
  await page.getByRole("button", { name: "Tout montrer", exact: true }).first().click();
  if (await tool.count()) await tool.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator('[data-ref="status-recompute"]')).toHaveText(/Recalcul \d/);
  await page.waitForTimeout(1500);

  // Escape closes the palette; nothing is launched.
  await page.getByLabel("Palette de commandes").first().click();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);

  // The folder: the check first, then one .zip.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("dossier production");
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { name: "Dossier de production" });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const window = page.locator("div.fixed").filter({ has: heading });
  await expect(window.getByLabel("Devis")).not.toBeChecked();
  const waiting = page.waitForEvent("download");
  await window.getByRole("button", { name: /^Télécharger/ }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe("dossier-e2e-dossier-production.zip");
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  expect(Object.keys(files).sort()).toEqual([
    "00-lisez-moi.txt", "01-liste-de-debit.csv", "01-liste-de-debit.html", "01-plaqueuse.csv", "02-bon-a-attribuer.csv", "02-bons-de-commande.html", "02-calepinage.html", "02-liste-d-achat.csv",
    "03-fiches-de-fabrication.html", "04-etiquettes.html", "05-pieces-cnc.dxf", "05-pieces.nc", "06-notice-de-montage.html",
  ]);
  const text = (name: string) => strFromU8(files[name]!);
  expect(text("00-lisez-moi.txt")).toContain("Dossier de production : Dossier e2e");
  expect(text("01-liste-de-debit.csv")).toContain("fileur");
  expect(text("05-pieces-cnc.dxf")).toContain("EOF");
  expect(text("04-etiquettes.html")).toContain("<svg");
  expect(text("06-notice-de-montage.html")).toContain("data:image/png");
  expect(text("02-calepinage.html")).toContain("Liste d'achat");
  // Without suppliers in this browser: one order, « to give ».
  expect(text("02-bons-de-commande.html")).toContain("Fournisseur à choisir");
  await page.screenshot({ path: "test-results/production-folder.png" });
  expect(errors).toEqual([]);
});
