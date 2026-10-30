/**
 * Parcours clés de l'éditeur dans un vrai navigateur : ouvrir un projet, modifier une esquisse et retrouver la
 * modification après rechargement, ouvrir la liste de débit. Chaque test crée son propre compte sur le serveur de
 * test (base .e2e/db.sqlite3, recréée à chaque lancement).
 */
import { expect, test, type Page } from "@playwright/test";

/** A new account and a new project (the default document: a plate with a hole); returns the project's API URL. */
async function newProject(page: Page, name: string): Promise<string> {
  const user = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // A throwaway password for this local test account, unlike the user name (Django refuses similar ones).
  const secret = `Copeau-${Math.random().toString(36).slice(2, 10)}-Chene`;
  await page.goto("/accounts/signup/");
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password1"]', secret);
  await page.fill('input[name="password2"]', secret);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL("**/projects/");
  await page.fill('input[name="name"]', name);
  await page.getByRole("button", { name: "Créer et ouvrir" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const id = page.url().match(/projects\/([0-9a-f-]+)\/editor/)?.[1];
  return `/api/projects/${id}/`;
}

async function sketchCurves(page: Page, api: string, sketchId: string): Promise<number> {
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const sketch = (project.document.features as { id: string; curves?: unknown[] }[]).find((f) => f.id === sketchId);
  return sketch?.curves?.length ?? 0;
}

test("un projet s'ouvre : noyau prêt, corps listé, aucune erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Plaque e2e");
  await expect(page.locator('[data-ref="status-kernel"]')).toHaveText("Noyau OpenCascade prêt");
  await expect(page.locator('[data-select^="body:"]')).toHaveCount(1);
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré");
  expect(errors).toEqual([]);
});

test("une ligne tracée dans l'esquisse est enregistrée et retrouvée après rechargement", async ({ page }) => {
  const api = await newProject(page, "Esquisse e2e");
  const before = await sketchCurves(page, api, "sk1");
  // The sketch's row in the "Esquisses" section (it is also in the history of the body).
  await page.locator('details:not([data-bodies]) [data-menu="sk1"]').click();
  await page.getByRole("button", { name: /^Modifier/ }).first().click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "sketch");
  await page.locator('[data-sketch-tool="line"]').click();
  const canvas = page.locator('[data-ref="viewport"] canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Terminer l'esquisse" }).click();
  await expect(page.locator("#editor")).toHaveAttribute("data-mode", "model");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  await expect.poll(() => sketchCurves(page, api, "sk1")).toBe(before + 1);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await sketchCurves(page, api, "sk1")).toBe(before + 1);
});

test("le projet exemple s'ouvre : six panneaux, devis et aide", async ({ page }) => {
  await newProject(page, "Compte e2e");
  await page.goto("/projects/");
  await page.getByRole("button", { name: "Ouvrir le projet exemple" }).click();
  await page.waitForURL("**/editor/");
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('[data-select^="body:"]')).toHaveCount(6);
  await page.locator('[data-workshop="quote"]').click();
  const quote = page.getByRole("dialog", { name: "Devis" });
  await expect(quote).toContainText("Mélaminé chêne 1,8 cm"); // centimetres by default
  await expect(quote).toContainText("Total TTC");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Aide et raccourcis clavier" })).toBeVisible();
});

test("les panneaux latéraux s'élargissent à la poignée et gardent leur largeur", async ({ page }) => {
  await newProject(page, "Panneaux e2e");
  const panel = page.locator('[data-ref="panel-properties"]');
  const before = (await panel.boundingBox())!.width;
  const handle = (await page.locator('[data-panel-resize="left"]').boundingBox())!;
  const x = handle.x + handle.width / 2;
  await page.mouse.move(x, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(x - 120, handle.y + 100, { steps: 5 });
  await page.mouse.up();
  const width = async () => Math.round((await panel.boundingBox())!.width);
  await expect.poll(width).toBeGreaterThan(before + 110);
  const dragged = await width();
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  expect(await width()).toBe(dragged);
});

test("une apparence de la bibliothèque se donne à un corps, s'enregistre et s'annule", async ({ page }) => {
  const api = await newProject(page, "Apparence e2e");
  const appearanceOf = async () => {
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return Object.values((project.document.bodyInfo ?? {}) as Record<string, { appearance?: string }>).map((i) => i.appearance).filter(Boolean);
  };
  await page.locator('[data-select^="body:"]').first().click();
  await page.getByRole("button", { name: "Apparence", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Apparence" });
  await panel.getByRole("searchbox", { name: "Rechercher une apparence" }).fill("carrare");
  await panel.locator('[data-appearance-grid] [data-appearance="marble-carrara"]').click();
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 15_000 });
  await expect.poll(appearanceOf).toEqual(["marble-carrara"]);
  await expect(panel).toContainText("Dans ce modèle");
  await page.locator('[data-ref="undo"]').click();
  await expect.poll(appearanceOf, { timeout: 15_000 }).toEqual([]);
});

// The headless browser draws WebGL in software: the path tracer starts but does not get far, so only opening and
// closing are checked here (the refining is checked by hand in a real browser).
test("le mode Rendu s'ouvre et rend la main à l'édition", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await newProject(page, "Rendu e2e");
  await page.getByRole("button", { name: "Rendu", exact: true }).click();
  await expect(page.locator("#editor")).toHaveAttribute("data-render", "on");
  await expect(page.locator("[data-render-panel]")).toBeVisible();
  await expect(page.locator("[data-render-status]")).toContainText("échantillons");
  await expect(page.locator('[data-ribbon="model"]')).toBeHidden();
  await page.getByRole("button", { name: "Quitter le rendu" }).first().click();
  await expect(page.locator("#editor")).not.toHaveAttribute("data-render", "on");
  await expect(page.locator('[data-ribbon="model"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("la liste de débit s'ouvre avec les pièces du modèle", async ({ page }) => {
  await newProject(page, "Débit e2e");
  await page.locator('[data-workshop="cutlist"]').click();
  await expect(page.getByRole("dialog", { name: /Liste de débit/ })).toBeVisible();
});
