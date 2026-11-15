/**
 * Ouverture rapide d'un projet : à la deuxième ouverture, les corps gardés dans le navigateur s'affichent avant que le
 * noyau ait démarré et recalculé ; le vrai calcul les remplace ensuite. Un document changé n'est pas montré d'après
 * l'ancien calcul. Un projet de test de soixante caissons garnis (environ six cents panneaux) dans la base des tests,
 * jamais un projet réel.
 */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

/** Sixty cabinets side by side, each with four shelves and a back: some six hundred boards. */
function cabinets(width = 600): Record<string, unknown>[] {
  return Array.from({ length: 60 }, (_, i) => ({
    id: `cb${i + 1}`, type: "cabinet", name: `Caisson ${i + 1}`, origin: [i * 600, 0, 0], width: i === 0 ? width : 600, height: 2200, depth: 580,
    thickness: 18, back: "applied", backThickness: 8, shelves: 4, plinth: 100, construction: "sides-through",
  }));
}

async function setFeatures(page: Page, api: string, features: Record<string, unknown>[]): Promise<void> {
  await page.evaluate(async ({ url, features }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Caissons" }) });
  }, { url: api, features });
}

interface Opening { firstImage: number; modelReady: number; kernel: number; cached: boolean; shownBodies: number; exactBodies: number }

/** Opens the project again; the times (ms from the page's start) of its first picture, of the kernel and of the exact model. */
async function open(page: Page): Promise<Opening> {
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName("cao:model-ready").length > 0, null, { timeout: 60_000 });
  await page.waitForFunction(() => performance.getEntriesByName("cao:first-image").length > 0);
  return page.evaluate(() => {
    const mark = (name: string) => performance.getEntriesByName(name)[0] as PerformanceMark | undefined;
    const at = (name: string) => Math.round(mark(name)?.startTime ?? -1);
    const first = mark("cao:first-image")?.detail as { cached: boolean; bodies: number };
    const ready = mark("cao:model-ready")?.detail as { bodies: number };
    return { firstImage: at("cao:first-image"), modelReady: at("cao:model-ready"), kernel: at("cao:kernel-ready"), cached: first.cached, shownBodies: first.bodies, exactBodies: ready.bodies };
  });
}

/** The model of the opening is kept in the browser (app/quick-open.ts). */
const kept = (page: Page) => page.waitForFunction(() => performance.getEntriesByName("cao:model-kept").length > 0, null, { timeout: 30_000 });

const say = (label: string, o: Opening) =>
  console.log(`${label} : première image ${o.firstImage} ms, noyau prêt ${o.kernel} ms, modèle exact ${o.modelReady} ms (${o.cached ? "modèle gardé" : "sans cache"}, ${o.exactBodies} corps)`);

test("ouverture d'un projet de six cents panneaux : le modèle gardé d'abord, le calcul exact ensuite", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-ouverture-rapide");
  await setFeatures(page, api, cabinets());

  const first = await open(page);
  say("Première ouverture", first);
  expect(first.cached).toBe(false);
  expect(first.exactBodies).toBeGreaterThan(400);
  await kept(page);

  const second = await open(page);
  say("Deuxième ouverture", second);
  expect(second.cached).toBe(true);
  // The very bodies of the exact computation, shown before the kernel has even started computing.
  expect(second.shownBodies).toBe(second.exactBodies);
  expect(second.exactBodies).toBe(first.exactBodies);
  expect(second.firstImage).toBeLessThan(second.modelReady);
  if (!process.env.CI) expect(second.firstImage).toBeLessThan(500);
  await expect(page.locator('[data-ref="status-recompute"]')).toHaveText(/^Recalcul \d+ ms$/);

  // The document changed elsewhere: its old model is not shown, the new one is computed and kept.
  await setFeatures(page, api, cabinets(800));
  const changed = await open(page);
  say("Document changé", changed);
  expect(changed.cached).toBe(false);
  await kept(page);
  const again = await open(page);
  say("Ouverture suivante", again);
  expect(again.cached).toBe(true);
  expect(again.shownBodies).toBe(again.exactBodies);
  expect(errors).toEqual([]);
});
