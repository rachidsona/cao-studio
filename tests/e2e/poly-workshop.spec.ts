/**
 * L'atelier de l'ancien poly_3D, monté sous /poly/ : il demande un compte, l'éditeur de caisson et l'éditeur de pièce
 * (cuisine, dressing) s'ouvrent sans erreur, une séparation passe par l'API, la pièce reçoit un
 * caisson de sa bibliothèque. Serveur et base de test à part (playwright.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page): Promise<void> {
  const user = `poly${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const secret = `Copeau-${Math.random().toString(36).slice(2, 10)}-Chene`;
  await page.goto("/accounts/signup/");
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password1"]', secret);
  await page.fill('input[name="password2"]', secret);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL("**/projects/");
}

const csrf = (page: Page) => page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "");

test("l'atelier demande un compte, puis s'ouvre depuis l'accueil, avec son catalogue", async ({ page }) => {
  await page.goto("/poly/");
  await page.waitForURL("**/accounts/login/?next=/poly/");
  await signUp(page);
  await page.getByRole("link", { name: "Ouvrir l'atelier" }).click();
  await page.waitForURL("**/poly/");
  await expect(page.getByRole("button", { name: "Nouveau caisson" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Accueil" })).toBeVisible();
  // The catalogue opens in the application, not in the administration.
  await page.getByRole("link", { name: "Quincaillerie", exact: true }).click();
  await page.waitForURL("**/poly/catalogue/quincaillerie/");
  await expect(page.getByRole("link", { name: "Charnière à clip 35 mm" })).toBeVisible();
});

test("l'accueil supprime un projet après confirmation", async ({ page }) => {
  await signUp(page);
  await page.goto("/projects/");
  await page.fill("#affair-name", "À supprimer e2e");
  await page.getByRole("button", { name: "Créer et dessiner la pièce" }).click();
  await page.waitForURL(/\/poly\/projet\/\d+\/piece\/$/);
  await page.goto("/projects/");

  const remove = page.getByRole("button", { name: "Supprimer À supprimer e2e" });
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Supprimer ce projet ?" });
  await expect(dialog).toContainText("« À supprimer e2e » et sa pièce seront supprimés définitivement");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("link", { name: /À supprimer e2e/ })).toBeVisible();

  await remove.click();
  await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText("Projet « À supprimer e2e » supprimé.")).toBeVisible();
  await expect(page.getByRole("link", { name: /À supprimer e2e/ })).toHaveCount(0);
});

test("l'accueil supprime ensemble les projets cochés", async ({ page }) => {
  await signUp(page);
  for (const name of ["Un e2e", "Deux e2e", "Trois e2e"]) {
    await page.goto("/projects/");
    await page.fill("#affair-name", name);
    await page.getByRole("button", { name: "Créer et dessiner la pièce" }).click();
    await page.waitForURL(/\/poly\/projet\/\d+\/piece\/$/);
  }
  await page.goto("/projects/");
  const list = page.locator("section[aria-labelledby='affairs-title']");
  const remove = list.locator("[data-delete-selected]");
  await expect(remove).toBeHidden();
  await page.getByLabel("Sélectionner Un e2e").check();
  await page.getByLabel("Sélectionner Deux e2e").check();
  await expect(remove).toHaveText("Supprimer la sélection (2)");
  await expect(list.locator("[data-select-all]")).toHaveJSProperty("indeterminate", true);

  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Supprimer ces projets ?" });
  await expect(dialog.getByRole("listitem")).toHaveText(["Deux e2e", "Un e2e"]);
  await expect(dialog).toContainText("Ces 2 projets et leurs pièces seront supprimés définitivement");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(list.getByRole("link", { name: /Un e2e/ })).toBeVisible();

  await remove.click();
  await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText("2 projets supprimés.")).toBeVisible();
  await expect(list.getByRole("link", { name: /Un e2e|Deux e2e/ })).toHaveCount(0);
  await expect(list.getByRole("link", { name: /Trois e2e/ })).toBeVisible();

  await list.locator("[data-select-all]").check();
  await expect(remove).toHaveText("Supprimer la sélection (1)");
});

test("la liste des caissons : recherche, filtre, menu d'une ligne et fenêtre de création", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page);
  for (const name of ["Colonne e2e", "Haut e2e"]) {
    await page.goto("/poly/");
    await page.getByRole("button", { name: "Nouveau caisson" }).click();
    await page.fill("#name", name);
    await page.getByRole("button", { name: "Créer et ouvrir l'éditeur" }).click();
    await page.waitForURL(/\/poly\/cabinet\/\d+\/$/);
  }
  await page.goto("/poly/");
  const rows = page.locator("[data-cabinet]:visible");
  await expect(rows).toHaveCount(2);
  await page.fill("#cabinet-search", "colonne");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Colonne e2e");
  await page.fill("#cabinet-search", "introuvable");
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("Aucun caisson ne correspond.")).toBeVisible();
  await page.fill("#cabinet-search", "");
  await page.selectOption("#cabinet-affair", "none");
  await expect(rows).toHaveCount(2);

  await page.getByLabel("Actions de Colonne e2e").click();
  await expect(page.getByRole("link", { name: "Devis" })).toHaveCount(1);
  await page.getByLabel("Actions de Haut e2e").click();
  await expect(page.locator(".row-menu[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".row-menu[open]")).toHaveCount(0);

  await page.getByRole("button", { name: "Nouveau caisson" }).click();
  await expect(page.getByRole("dialog", { name: "Nouveau caisson" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("éditeur de caisson : il s'ouvre et une séparation s'ajoute", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page);
  await page.goto("/poly/");
  await page.getByRole("button", { name: "Nouveau caisson" }).click();
  await page.fill("#name", "Bibliothèque e2e");
  await page.getByRole("button", { name: "Créer et ouvrir l'éditeur" }).click();
  await page.waitForURL(/\/poly\/cabinet\/\d+\/$/);
  await expect(page.locator(".editor-shell canvas").first()).toBeVisible();
  const id = page.url().match(/cabinet\/(\d+)\//)?.[1];
  const token = await csrf(page);
  const scene = await page.evaluate(async (url) => (await fetch(url)).json(), `/poly/api/cabinets/${id}/scene/`);
  const root = scene.scene?.volumes?.find?.((v: { is_root?: boolean }) => v.is_root) ?? scene.volumes?.find?.((v: { is_root?: boolean }) => v.is_root);
  expect(root).toBeTruthy();
  const post = (url: string, body: unknown) => page.evaluate(async ([u, b, t]) => (await fetch(u as string, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": t as string }, body: JSON.stringify(b) })).json(), [url, body, token] as const);
  const split = await post(`/poly/api/cabinets/${id}/split/`, { volume_id: root.id, direction: "vertical", position: 0.5, mode: "ratio" });
  expect(split.ok).toBe(true);
  await page.reload();
  await expect(page.locator(".editor-shell canvas").first()).toBeVisible();
  // « Modèle » asks its name in the page (the browser's own question box may be refused), then saves the template.
  page.on("dialog", (dialog) => void dialog.dismiss());
  await page.locator("#btn-save-template").click();
  const ask = page.getByRole("alertdialog", { name: "Enregistrer comme modèle" });
  await ask.getByLabel("Nom du modèle").fill("Bibliothèque type");
  await ask.getByRole("button", { name: "Enregistrer" }).click();
  await page.goto("/poly/catalogue/bibliotheque/");
  await expect(page.getByRole("link", { name: "Bibliothèque type" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("éditeur de caisson : une étagère se pose dans une niche basse, dans les limites du serveur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page);
  await page.goto("/poly/");
  await page.getByRole("button", { name: "Nouveau caisson" }).click();
  await page.fill("#name", "Niche basse e2e");
  await page.fill("#height", "360");
  await page.getByRole("button", { name: "Créer et ouvrir l'éditeur" }).click();
  await page.waitForURL(/\/poly\/cabinet\/\d+\/$/);
  const canvas = page.locator(".editor-shell canvas").first();
  await expect(canvas).toBeVisible();
  await page.locator('.editor-toolbar [data-toolbar-tool="shelf"]').click();
  // Un clic dans la niche la choisit (outil Étagère).
  const box = await canvas.boundingBox();
  if (!box) throw new Error("pas de vue 3D");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator("#shelf-mode").selectOption("ratio");
  // Niche de 32,2 cm : 5 cm au moins sous et sur l'étagère, soit 16 % à 78 % environ.
  await expect(page.locator("#shelf-hint")).toContainText("5,0 cm au moins du dessous et du dessus");
  expect(Number(await page.locator("#shelf-position").getAttribute("min"))).toBeGreaterThan(15);
  await page.locator("#shelf-position").fill("7");
  await page.locator("#shelf-position").press("Tab");
  expect(Number(await page.locator("#shelf-position").inputValue())).toBeGreaterThan(15);
  await page.locator("#btn-shelf").click();
  await expect(page.locator("#toast-host")).not.toContainText("hors limites");
  await expect(page.locator('.tree-row[data-kind="shelf"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("éditeur de caisson : les cartes d'options sont fermées, en ouvrir une ferme l'autre ; le Navigateur se replie", async ({ page }) => {
  await signUp(page);
  await page.goto("/poly/");
  await page.getByRole("button", { name: "Nouveau caisson" }).click();
  await page.fill("#name", "Cartes e2e");
  await page.getByRole("button", { name: "Créer et ouvrir l'éditeur" }).click();
  await page.waitForURL(/\/poly\/cabinet\/\d+\/$/);
  const selection = page.getByRole("button", { name: "Sélection", exact: true });
  const tools = page.getByRole("button", { name: "Outils", exact: true });
  // Closed at first.
  await expect(selection).toHaveAttribute("aria-expanded", "false");
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#selection-panel")).toBeHidden();
  await expect(page.locator(".tool-tabs")).toBeHidden();
  // One open at a time.
  await selection.click();
  await expect(page.locator("#selection-panel")).toBeVisible();
  await tools.click();
  await expect(page.locator(".tool-tabs")).toBeVisible();
  await expect(page.locator("#selection-panel")).toBeHidden();
  await expect(selection).toHaveAttribute("aria-expanded", "false");
  // A tool of the top bar opens « Outils ».
  await selection.click();
  await expect(page.locator(".tool-tabs")).toBeHidden();
  await page.locator('.editor-toolbar [data-toolbar-tool="shelf"]').click();
  await expect(page.locator("#btn-shelf")).toBeVisible();
  await expect(page.locator("#selection-panel")).toBeHidden();
  // The navigator stays open by default; folded from the keyboard, it stays folded after a reload.
  const navigator = page.getByRole("button", { name: /^Navigateur/ });
  await expect(page.locator("#scene-tree")).toBeVisible();
  await navigator.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#scene-tree")).toBeHidden();
  await page.reload();
  await expect(page.locator("#scene-tree")).toBeHidden();
  await expect(page.locator("#selection-panel")).toBeHidden();
  await expect(page.locator(".tool-tabs")).toBeHidden();
});

test("éditeur de pièce : une affaire de cuisine s'ouvre en plan et reçoit un meuble", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page);
  await page.goto("/projects/");
  await page.fill("#affair-name", "Cuisine e2e");
  await page.getByRole("button", { name: "Créer et dessiner la pièce" }).click();
  await page.waitForURL(/\/poly\/projet\/\d+\/piece\/$/);
  const config = await page.evaluate(() => JSON.parse(document.getElementById("room-config")?.textContent ?? "{}"));
  expect(config.urls.items).toMatch(/^\/poly\/api\/projects\/\d+\/room\/items\/$/);
  const payload = await page.evaluate(() => JSON.parse(document.getElementById("room-payload")?.textContent ?? "{}"));
  const preset = payload.presets?.[0]?.key;
  expect(preset).toBeTruthy();
  const token = await csrf(page);
  const added = await page.evaluate(async ([u, k, t]) => (await fetch(u as string, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": t as string }, body: JSON.stringify({ preset_key: k }) })).json(), [config.urls.items, preset, token] as const);
  expect(added.ok).toBe(true);
  await page.reload();
  // The plan 2D first: the walls and the cabinet drawn in it; then the 3D view.
  await expect(page.locator("#room-plan")).toBeVisible();
  await expect(page.locator("#room-plan *").first()).toBeAttached();
  await page.getByRole("button", { name: "Vue 3D" }).click();
  await expect(page.locator("#room-3d canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("éditeur de caisson : avec Séparer, Côté ou Étagère, un simple clic choisit la niche", async ({ page }) => {
  await signUp(page);
  await page.goto("/poly/");
  await page.getByRole("button", { name: "Nouveau caisson" }).click();
  await page.fill("#name", "Niches e2e");
  await page.fill("#width", "1000");
  await page.getByRole("button", { name: "Créer et ouvrir l'éditeur" }).click();
  await page.waitForURL(/\/poly\/cabinet\/\d+\/$/);
  const id = page.url().match(/cabinet\/(\d+)\//)?.[1];
  const token = await csrf(page);
  const scene = await page.evaluate(async (url) => (await fetch(url)).json(), `/poly/api/cabinets/${id}/scene/`);
  const root = scene.scene.volumes.find((v: { is_root: boolean }) => v.is_root);
  const split = await page.evaluate(async ([u, b, t]) => (await fetch(u as string, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": t as string }, body: JSON.stringify(b) })).json(), [`/poly/api/cabinets/${id}/split/`, { volume_id: root.id, direction: "vertical", position: 0.5, mode: "ratio" }, token] as const);
  expect(split.ok).toBe(true);
  const leaves = (split.scene.volumes as { id: number; is_leaf: boolean; x: number; slot: string }[]).filter((v) => v.is_leaf).sort((a, b) => a.x - b.x);
  expect(leaves).toHaveLength(2);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __ploy3d?: { pickables: unknown[] } }).__ploy3d?.pickables.length);
  // Where a niche is on screen: the middle of its volume box, projected by the editor's camera.
  const spot = (volumeId: number) => page.evaluate((vid) => {
    const p3 = (window as unknown as { __ploy3d: { pickables: { userData: { volumeId?: number; componentId?: number | null }; geometry: { computeBoundingBox(): void; boundingBox: { getCenter(v: unknown): { applyMatrix4(m: unknown): { project(c: unknown): { x: number; y: number } } } } }; matrixWorld: unknown }[]; camera: { position: { constructor: new () => unknown } }; renderer: { domElement: HTMLCanvasElement } } }).__ploy3d;
    const mesh = p3.pickables.find((m) => m.userData.volumeId === vid && !m.userData.componentId)!;
    mesh.geometry.computeBoundingBox();
    const Vec = p3.camera.position.constructor;
    const ndc = mesh.geometry.boundingBox.getCenter(new Vec()).applyMatrix4(mesh.matrixWorld).project(p3.camera);
    const rect = p3.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
  }, volumeId);
  // The niche chosen is named in the view (« Niche A », « Niche B »).
  const selected = () => page.locator("#selection-measure strong").textContent();
  for (const tool of ["split", "side", "shelf"]) {
    await page.locator(`.editor-toolbar [data-toolbar-tool="${tool}"]`).click();
    for (const leaf of leaves) {
      const at = await spot(leaf.id);
      await page.mouse.click(at.x, at.y);
      await expect.poll(selected).toBe(`Niche ${leaf.slot.toUpperCase()}`);
    }
  }
  await expect(page.locator("#viewport-action-hint")).toContainText("Clic : choisir la niche");
});

test("éditeur de pièce : un meuble et une fenêtre se suppriment après une confirmation dans la page, Ctrl+Z les rend", async ({ page }) => {
  // The browser's own confirm() is refused here, as in some embedded browsers: the page must ask by itself.
  page.on("dialog", (dialog) => void dialog.dismiss());
  await signUp(page);
  await page.goto("/projects/");
  await page.fill("#affair-name", "Suppression e2e");
  await page.getByRole("button", { name: "Créer et dessiner la pièce" }).click();
  await page.waitForURL(/\/poly\/projet\/\d+\/piece\/$/);
  const config = await page.evaluate(() => JSON.parse(document.getElementById("room-config")?.textContent ?? "{}"));
  const payload = await page.evaluate(() => JSON.parse(document.getElementById("room-payload")?.textContent ?? "{}"));
  const token = await csrf(page);
  const post = (url: string, body: unknown) => page.evaluate(async ([u, b, t]) => (await fetch(u as string, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": t as string }, body: JSON.stringify(b) })).json(), [url, body, token] as const);
  expect((await post(config.urls.items, { preset_key: payload.presets[0].key })).ok).toBe(true);
  expect((await post(config.urls.openings, { wall_id: payload.walls[0].id, kind: "window", offset: 200, width: 900 })).ok).toBe(true);
  await page.reload();
  const items = page.locator("#item-list .room-row");
  const openings = page.locator("#opening-list .room-row");
  // The lists are folded under the « Sélection » panel; the openings are in the « Ouvertures » mode.
  await page.locator('details[data-remember="items"] > summary').click();
  await expect(items).toHaveCount(1);
  // Cancel first: nothing goes.
  await items.first().locator(".room-row-delete").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Retirer");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(items).toHaveCount(1);
  // Then confirm: the cabinet leaves the room…
  await items.first().locator(".room-row-delete").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(items).toHaveCount(0);
  // … comes back with Annuler (Ctrl+Z), and goes again with Rétablir.
  await page.keyboard.press("Control+z");
  await expect(items).toHaveCount(1);
  await page.locator("[data-room-redo]").click();
  await expect(items).toHaveCount(0);
  await page.locator('[data-room-mode="openings"]').click();
  await expect(openings).toHaveCount(1);
  await openings.first().locator(".icon-btn.danger").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(openings).toHaveCount(0);
  const after = await page.evaluate(async (u) => (await fetch(u)).json(), config.urls.room);
  const room = after.payload;
  expect(room.items).toHaveLength(0);
  expect(room.openings).toHaveLength(0);
});

test("éditeur de pièce : un clic sélectionne, le panneau Sélection le montre, R le tourne, Échap désélectionne ; mesure, côte à côte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.dismiss());
  await signUp(page);
  await page.goto("/projects/");
  await page.fill("#affair-name", "Disposition e2e");
  await page.getByRole("button", { name: "Créer et dessiner la pièce" }).click();
  await page.waitForURL(/\/poly\/projet\/\d+\/piece\/$/);
  await expect(page.locator("[data-selection-empty]")).toBeVisible();
  // The library: « Plans » shows the worktop button instead of the models.
  await page.locator("[data-lib-worktops]").click();
  await expect(page.locator("[data-lib-worktops-panel]")).toBeVisible();
  await expect(page.locator("#preset-list")).toBeHidden();
  await page.locator('.room-lib-tabs [data-category="kitchen"]').click();
  await page.locator("#preset-list .btn").first().click();
  await expect(page.locator(".plan-item")).toHaveCount(1);
  await page.locator(".plan-item").first().click();
  await expect(page.locator("#item-props")).toBeVisible();
  await expect(page.locator("[data-selection-empty]")).toBeHidden();
  const rotation = () => page.locator("#item-rotation").inputValue();
  const before = Number(await rotation());
  await page.keyboard.press("r");
  await expect.poll(async () => Number(await rotation())).toBe((before + 90) % 360);
  await page.keyboard.press("Escape");
  await expect(page.locator("#item-props")).toBeHidden();
  await expect(page.locator("[data-selection-empty]")).toBeVisible();
  // Mesurer: two clicks, a distance.
  await page.locator('[data-room-mode="measure"]').click();
  const box = (await page.locator("#room-plan").boundingBox())!;
  // Maj held: free points (no corner near them to hook to).
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.keyboard.up("Shift");
  await expect(page.locator("[data-measure-distance]")).toContainText("cm");
  await expect(page.locator("[data-measure-layer] line")).toHaveCount(1);
  // The bar under the view: the quote opens; « Côte à côte » shows both views; both are remembered.
  await page.locator('[data-dock="quote"]').click();
  await expect(page.locator('[data-dock-panel="quote"]')).toBeVisible();
  await page.locator('.room-view-tabs [data-view="split"]').click();
  await expect(page.locator("#plan-view")).toBeVisible();
  await expect(page.locator("#room-3d canvas")).toBeVisible();
  await page.reload();
  await expect(page.locator("#room-3d canvas")).toBeVisible();
  await expect(page.locator("#plan-view")).toBeVisible();
  await expect(page.locator('[data-dock-panel="quote"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("éditeur de caisson : trois onglets, l'outil choisi montre ses réglages, le menu du nom donne les documents", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page);
  await page.goto("/poly/");
  await page.getByRole("button", { name: "Nouveau caisson" }).click();
  await page.fill("#name", "Onglets e2e");
  await page.getByRole("button", { name: "Créer et ouvrir l'éditeur" }).click();
  await page.waitForURL(/\/poly\/cabinet\/\d+\/$/);
  const tabs = page.locator(".editor-right .tabs button");
  await expect(tabs).toHaveText(["Sélection et outil", "Fabrication", "Devis et croquis"]);
  // The « Séparation » tool is gone from the bar and the tools (Séparer divides a niche); its shortcut does nothing.
  await expect(page.locator('.editor-toolbar [data-toolbar-tool]:not([hidden])')).toHaveText(["Séparer", "Déplacer", "Côté", "Étagère", "Mesurer", "Plinthe", "Caisson"]);
  await expect(page.locator('.tool-tabs [data-tool="partition"]')).toHaveCount(0);
  await page.locator("#btn-settings").click();
  await expect(page.locator("#settings-tools")).not.toContainText("Séparation");
  await page.locator("#settings-close").click();
  // A tool of the bar: the selection and that tool's settings, together.
  await page.locator('.editor-toolbar [data-toolbar-tool="shelf"]').click();
  await expect(page.locator('.tab-panel[data-panel="selection"]')).toBeVisible();
  await expect(page.locator('.tool-panel[data-panel="shelf"]')).toBeVisible();
  // Fabrication: the cut list, the sheets and the checks in one tab, remembered.
  await page.locator('.tabs [data-tab="fabrication"]').click();
  await expect(page.locator('.tab-panel[data-panel="cutlist"]')).toBeVisible();
  await expect(page.locator('.tab-panel[data-panel="checks"]')).toBeVisible();
  await expect(page.locator('.tab-panel[data-panel="selection"]')).toBeHidden();
  await page.reload();
  await expect(page.locator('.tab-panel[data-panel="cutlist"]')).toBeVisible();
  // The name's menu: the documents and the other places.
  await page.locator(".page-menu > summary").click();
  const menu = page.locator(".page-menu-list");
  await expect(menu.getByRole("menuitem", { name: "Devis" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mes projets (éditeur 3D)" })).toHaveAttribute("href", "/projects/");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  expect(errors).toEqual([]);
});
