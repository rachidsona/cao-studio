/** Un caisson déplacé par sa poignée « ✥ Déplacer » ne se pose jamais dans un autre : il est remis à côté, au ras. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { runCabinets } from "../../frontend/src/document/kitchen-plan-add";
import { createReferencePlate, type CabinetFeature, type CadDocument } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { roomClashes } from "../../frontend/src/features/room-plan";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("un caisson amené dans son voisin est posé à côté de lui ; Alt le laisse où on le pose", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-caisson-a-cote");
  // Two cabinets 600 wide side by side, no doors.
  for (let i = 0; i < 2; i++) {
    await click(page, '[data-action="cabinet"]');
    const tool = page.getByRole("dialog", { name: "Caisson" });
    await tool.getByRole("combobox", { name: "Modèle" }).selectOption("base");
    await tool.getByRole("combobox", { name: "Portes" }).selectOption("none");
    await page.waitForTimeout(800);
    await tool.getByRole("button", { name: "Terminer", exact: true }).click();
    await expect(tool).toHaveCount(0);
  }
  const origins = async () => {
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return (project.document.features as { type: string; origin?: number[] }[]).filter((f) => f.type === "cabinet").map((f) => Math.round(f.origin![0]!));
  };
  const [first, second] = await origins();
  expect(second! - first!).toBe(600);

  // Seen from above, the second one chosen: its bar, and the grip that slides it along its width.
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await page.locator('[data-head^="group:"]').filter({ hasText: "Caisson 2" }).first().click();
  const grip = page.getByRole("toolbar", { name: "Caisson sélectionné" }).getByLabel("Déplacer le caisson");
  await expect(grip).toBeVisible();
  const slide = async (dx: number, alt = false) => {
    const box = (await grip.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 12 });
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
    await page.waitForTimeout(900);
    return (await origins())[1]!;
  };

  // To the right, the floor is free: it goes where it is brought.
  const away = await slide(160);
  expect(away).toBeGreaterThan(second! + 100);
  const perPixel = (away - second!) / 160;
  // Back to the left, 150 mm into its neighbour: put beside it, flush.
  expect(await slide(-Math.round((away - second! + 150) / perPixel))).toBe(second);
  // Pushed again into it from there: it stays beside it.
  expect(await slide(-Math.round(200 / perPixel))).toBe(second);
  // Alt: no stop — it is left where it is put, in its neighbour.
  const forced = await slide(-Math.round(200 / perPixel), true);
  expect(forced).toBeLessThan(second! - 100);
  expect(errors).toEqual([]);
});

test("dans une pièce : une cote tapée s'arrête au ras du mur, le caisson agrandi est décalé, il ne traverse pas le mur et ne monte pas dessus", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-caisson-murs");
  // A room 3 × 2,5 m (wall A along x at y = 0, the room towards −y, wall B at x = 3000) and a cabinet against wall A.
  const room = { id: "pc1", type: "room", name: "Pièce 1", height: 2500, thickness: 200, walls: [3000, 2500, 3000, 2500].map((length) => ({ length, angle: 90 })), obstacles: [] };
  const cabinet = { id: "cb1", type: "cabinet", name: "Bas mur", origin: [1200, -560, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const bodyInfo = Object.fromEntries([0, 1, 2, 3].map((i) => [`pc1#${i}`, { room: true }]));
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, bodyInfo }, base_version: now.version, message: "Pièce" }) });
  }, { url: api, features: [room, cabinet] });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const placed = async () => {
    await page.waitForTimeout(900);
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    const c = (project.document.features as { type: string; origin?: number[]; width?: number }[]).find((f) => f.type === "cabinet")!;
    return { x: Math.round(c.origin![0]!), y: Math.round(c.origin![1]!), z: Math.round(c.origin![2]!), width: c.width };
  };
  const choose = () => page.locator('[data-head^="group:"]').filter({ hasText: "Bas mur" }).first().click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  // « Déplacer », the whole cabinet, 3 m typed to the right: it would end beyond wall B — stopped flush against it.
  await choose();
  await click(page, '[data-action="move"]');
  const tool = page.getByRole("dialog", { name: /^Déplacer/ });
  await tool.getByRole("combobox", { name: "Déplacer", exact: true }).selectOption({ label: "Le corps entier" });
  const dx = tool.getByLabel(/^ΔX/);
  await dx.fill("300");
  await dx.press("Tab");
  await expect(page.getByText(/s'arrête au ras/).first()).toBeVisible();
  expect(await placed()).toMatchObject({ x: 2400, y: -560, z: 0 });

  // Following the pointer onto wall A, high up: it keeps its height (it does not climb the wall) and stays out of it.
  await tool.getByRole("button", { name: "Centre", exact: true }).click();
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const [cx, cy] = [view.x + view.width / 2, view.y + view.height / 2];
  await page.mouse.move(cx - 40, cy - 60, { steps: 6 });
  await page.mouse.move(cx - 60, cy - 90, { steps: 6 });
  await page.mouse.click(cx - 60, cy - 90);
  const followed = await placed();
  expect(followed.z).toBe(0);
  expect(followed.y).toBeLessThanOrEqual(-560);
  expect(followed.x).toBeGreaterThanOrEqual(0);
  expect(followed.x).toBeLessThanOrEqual(2400);
  await tool.getByRole("button", { name: /^Terminer/ }).click();
  await expect(tool).toHaveCount(0);

  // Brought back against wall B by its grip, far beyond the wall: it does not pass through — flush, on the room's side.
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await choose();
  const grip = page.getByRole("toolbar", { name: "Caisson sélectionné" }).getByLabel("Déplacer le caisson");
  await expect(grip).toBeVisible();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 900, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  expect((await placed()).x).toBe(2400);

  // Made 20 cm wider from its bar, against wall B: slid back by as much, flush — not into the wall.
  await choose();
  const bar = page.getByRole("toolbar", { name: "Caisson sélectionné" });
  await bar.getByText(/^L /).click();
  await bar.locator("input").fill("80");
  await bar.locator("input").press("Enter");
  await expect(page.getByText(/décalé au ras/).first()).toBeVisible();
  expect(await placed()).toMatchObject({ x: 2200, width: 800 });
  expect(errors).toEqual([]);
});

test("pièce hors d'équerre : un caisson tiré loin vers le mur de biais reste dans la pièce ; une pièce libre s'arrête au mur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-murs-biais");
  // Wall B leans out by 5°; a cabinet against wall A, and a plain block (a sketch pulled) in the middle.
  const room = { id: "pc1", type: "room", name: "Pièce 1", height: 2500, thickness: 200, walls: [[3000, 85], [2500, 95], [3000, 85], [2500, 95]].map(([length, angle]) => ({ length, angle })), obstacles: [] };
  const cabinet = { id: "cb1", type: "cabinet", name: "Bas biais", origin: [1200, -560, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
  const corners = [[1200, -1700], [1500, -1700], [1500, -1400], [1200, -1400]];
  const block = [
    { id: "skb", type: "sketch", name: "Bloc", plane: "XY", offset: 0, points: corners.map(([x, y], i) => ({ id: `pb${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `lb${i}`, kind: "line", p1: `pb${i}`, p2: `pb${(i + 1) % 4}` })), constraints: [] },
    { id: "exb", type: "extrude", name: "Bloc libre", sketch: "skb", distance: 400, operation: "new" },
  ];
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const bodyInfo = Object.fromEntries([0, 1, 2, 3].map((i) => [`pc1#${i}`, { room: true }]));
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, bodyInfo }, base_version: now.version, message: "Pièce" }) });
  }, { url: api, features: [room, cabinet, ...block] });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const saved = async () => {
    await page.waitForTimeout(900);
    await page.keyboard.press("Control+s");
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return project.document.features as { id: string; type: string; origin?: number[]; translate?: number[] }[];
  };
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);

  // The cabinet's grip, dragged far to the right, towards the leaning wall B and well beyond it.
  await page.locator('[data-head^="group:"]').filter({ hasText: "Bas biais" }).first().click();
  const grip = page.getByRole("toolbar", { name: "Caisson sélectionné" }).getByLabel("Déplacer le caisson");
  await expect(grip).toBeVisible();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Slowly, step by step, then far beyond the wall.
  await page.mouse.move(box.x + box.width / 2 + 900, box.y + box.height / 2, { steps: 40 });
  await page.mouse.up();
  const c = (await saved()).find((f) => f.id === "cb1")!;
  // Flush against the leaning wall, on the room's side: at y = −560 wall B stands at x ≈ 2951 (not stopped 17 cm short by
  // the wall's box, not passed behind it), and it runs into no wall.
  expect(c.origin![0]! + 600).toBeGreaterThan(2945);
  expect(c.origin![0]! + 600).toBeLessThanOrEqual(2952);
  expect(roomClashes(room as never, [[c.origin![0]!, c.origin![1]!, 0], [c.origin![0]! + 600, c.origin![1]! + 560, 870]]).hits).toEqual([]);
  // Back into the room, then brought only 6 cm beyond the leaning wall: flush against it again, not 17 cm short.
  const slide = async (px: number) => {
    await page.locator('[data-head^="group:"]').filter({ hasText: "Bas biais" }).first().click();
    const at = (await grip.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + px, at.y + at.height / 2, { steps: 20 });
    await page.mouse.up();
    return (await saved()).find((f) => f.id === "cb1")!.origin![0]!;
  };
  const back = await slide(-200);
  const perPixel = (c.origin![0]! - back) / 200;
  const near = await slide(Math.round((2951 + 60 - (back + 600)) / perPixel));
  expect(near + 600).toBeGreaterThan(2945);
  expect(near + 600).toBeLessThanOrEqual(2952);

  // The plain block, moved by a distance typed 3 m to the left: it stops flush against wall D (out of square too: at
  // y = −1400, the block's nearest corner, it stands at x ≈ −122), inside the room.
  await page.locator('[data-head^="group:"], [data-body]').filter({ hasText: "Bloc libre" }).first().click();
  await click(page, '[data-action="move"]');
  const tool = page.getByRole("dialog", { name: /^Déplacer/ });
  await expect(tool).toBeVisible();
  const dx = tool.getByLabel(/^ΔX/);
  await dx.fill("-300");
  await dx.press("Tab");
  await expect(page.getByText(/La pièce s'arrête au ras/).first()).toBeVisible();
  await tool.getByRole("button", { name: "OK", exact: true }).click();
  const moved = (await saved()).find((f) => f.type === "move");
  const tx = moved!.translate![0]!;
  expect(tx).toBeLessThan(-1300);
  expect(tx).toBeGreaterThan(-1330);
  expect(roomClashes(room as never, [[1200 + tx, -1700, 0], [1500 + tx, -1400, 400]]).hits).toEqual([]);
  expect(errors).toEqual([]);
});

test("Dupliquer une colonne collée à une autre : la copie à côté, la voisine poussée — rien n'entre dans rien", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-dupliquer-pousse");
  const col = (id: string, x: number) => ({ id, type: "cabinet", name: `Colonne ${id}`, origin: [x, -600, 0], rotation: 0, width: 600, height: 2400, depth: 600, thickness: 18, back: "applied", backThickness: 3, shelves: 4, plinth: 100, construction: "sides-through" });
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Colonnes" }) });
  }, { url: api, features: [col("cb1", 0), col("cb2", 600)] });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="fit"]');
  await page.locator('[data-head^="group:"]').filter({ hasText: "Colonne cb1" }).first().click();
  await page.getByRole("toolbar", { name: "Caisson sélectionné" }).getByLabel("Dupliquer le caisson").click();
  await expect(page.getByText(/poussé de 60 cm/).first()).toBeVisible();
  await page.waitForTimeout(900);
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const xs = (project.document.features as { type: string; id: string; origin: number[] }[]).filter((f) => f.type === "cabinet").map((f) => [f.id, Math.round(f.origin[0]!)]);
  expect(Object.fromEntries(xs)).toMatchObject({ cb1: 0, cb2: 1200 });
  expect(xs.map(([, x]) => x).sort((a, b) => (a as number) - (b as number))).toEqual([0, 600, 1200]);
  expect(errors).toEqual([]);
});

test("Dupliquer un caisson collé à une cuisine du Plan : ses meubles sont poussés le long du mur, le plan garde la place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-dupliquer-plan");
  const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, wallUnits: false });
  const units = [newItem([], "base-bas-2-portes", 600)];
  units.push(newItem(units, "base-bas-2-portes", 800));
  const built = withKitchenBuilt(made.doc, made.id, { runs: { A: units } });
  if (typeof built === "string") throw new Error(built);
  const first = built.doc.features.find((f) => f.id === runCabinets(built.doc, made.id, "A")[0]!.cabinet) as CabinetFeature;
  const free: CabinetFeature = { ...first, id: "cbfree", name: "Bas libre", origin: [first.origin[0] - 600, first.origin[1], first.origin[2]] };
  const { features, layers, bodyInfo } = { ...built.doc, features: [...built.doc.features, free] } as CadDocument & { layers?: unknown; bodyInfo?: unknown };
  await page.evaluate(async ({ url, features, layers, bodyInfo }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, ...(layers ? { layers } : {}), ...(bodyInfo ? { bodyInfo } : {}) }, base_version: now.version, message: "Cuisine" }) });
  }, { url: api, features, layers, bodyInfo });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="fit"]');
  await page.locator('[data-head^="group:"]').filter({ hasText: "Bas libre" }).first().click();
  await page.getByRole("toolbar", { name: "Caisson sélectionné" }).getByLabel("Dupliquer le caisson").click();
  await expect(page.getByText(/poussé/).first()).toBeVisible();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
  const doc = project.document as CadDocument;
  // The plan keeps 60 cm free before its first unit, and its units stand there; the copy stands where the first was.
  const plan = doc.features.find((f) => f.id === made.id) as { kitchenPlan: { runs: { A: { model: string; width: number }[] } } };
  expect(plan.kitchenPlan.runs.A[0]).toMatchObject({ model: "space", width: 600 });
  const xs = runCabinets(doc, made.id, "A").map((c) => Math.round((doc.features.find((f) => f.id === c.cabinet) as CabinetFeature).origin[0]));
  expect(xs).toEqual([Math.round(first.origin[0]) + 600, Math.round(first.origin[0]) + 1200]);
  const all = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet").map((c) => Math.round(c.origin[0])).sort((a, b) => a - b);
  expect(all).toEqual([first.origin[0] - 600, first.origin[0], first.origin[0] + 600, first.origin[0] + 1200].map(Math.round));
  expect(errors).toEqual([]);
});

