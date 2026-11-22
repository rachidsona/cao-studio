/** « Orientation : Parallèle à une face » : cliquer une étagère tournée (vue de face, son dessus caché) la fait suivre. */
import { expect, test, type Page } from "@playwright/test";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { withRecipe } from "../../frontend/src/document/niche-recipe";
import type { CadDocument } from "../../frontend/src/document/types";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

type F = { id: string; type: string; host?: unknown; lean?: number[]; offsets?: { id: string; step?: { kind: string; input?: { inside?: boolean; lean?: number[]; vertical?: boolean } } }[] };

for (const kind of ["Étagères", "Cloisons"] as const) {
  test(`${kind} parallèles à une étagère tournée cliquée dans la vue`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1400, height: 900 });
    const api = await newProject(page, `zz-parallele-${kind === "Étagères" ? "etagere" : "cloison"}`);
    // 600 × 400, 720 high, open at the top and the bottom: seen from above, its shelves show their ends only.
    const features = [
      { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
      { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
    ];
    const put = (document: unknown, message: string) =>
      page.evaluate(async ({ url, document, message }) => {
        const csrf = decodeURIComponent(window.document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
        const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
        await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: document ?? now.document, base_version: now.version, message }) });
      }, { url: api, document, message });
    const saved = () => page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: CadDocument }).document, api);
    const base = await saved();
    await put({ ...base, features }, "Cadre");
    await page.reload();
    await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
    await click(page, '[data-action="view"][data-view="top"]');
    await click(page, '[data-action="fit"]');
    await page.waitForTimeout(1200);
    const view = (await page.locator("canvas.cad-view").boundingBox())!;
    const [cx, cy] = [view.x + view.width / 2, view.y + view.height / 2];
    const save = async () => {
      await page.keyboard.press("Control+s");
      await expect(page.locator('[data-ref="status-save"]')).toHaveText(/Enregistré|Aucune modification/, { timeout: 30_000 });
    };

    // Furnished, then one shelf turned in it (climbing 150 over 600), put in the document as the tool would.
    const bodyMenu = page.getByRole("menu", { name: "Menu du corps" });
    for (let k = 10; k < 120 && !(await bodyMenu.isVisible()); k++) {
      await page.keyboard.press("Escape");
      await page.mouse.click(cx, cy + k * 4, { button: "right" });
      await page.waitForTimeout(80);
    }
    await bodyMenu.getByRole("menuitem", { name: "Aménager ce corps" }).click();
    await expect.poll(async () => (await save(), ((await saved()).features as F[]).some((f) => f.offsets?.some((r) => r.step?.kind === "partition" && r.step.input?.inside))), { timeout: 30_000 }).toBe(true);
    const doc = await saved();
    const sketch = (doc.features as F[]).find((f) => f.offsets?.some((r) => r.step?.kind === "partition"))!;
    const partition = sketch.offsets!.find((r) => r.step?.kind === "partition")!.id;
    const turned = withRecipe(doc, { sketch: sketch.id, partition, path: [0] }, { steps: [{ at: [], input: { count: 1, thickness: 18, mode: "equal", fixed: 0, lean: [600, 150, 0] } }], equipment: [] });
    if (typeof turned === "string") throw new Error(turned);
    await put(turned, "Étagère tournée");
    await page.reload();
    await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 30_000 });
    await click(page, '[data-action="view"][data-view="top"]');
    await click(page, '[data-action="fit"]');
    await page.waitForTimeout(1500);

    // The niche over it: the tool, « Parallèle à une face », then a click on the turned shelf (its end, face on).
    await page.mouse.click(cx - 60, cy - 70, { button: "right" });
    await page.getByRole("menu", { name: "Menu de la niche" }).getByRole("menuitem", { name: kind }).click();
    const tool = page.getByRole("dialog", { name: kind });
    await expect(tool).toContainText("Niche choisie");
    await tool.getByLabel("Orientation").selectOption("parallel");
    await page.mouse.click(cx, cy);
    await tool.getByRole("button", { name: "OK", exact: true }).click();
    await tool.getByRole("button", { name: "Terminer" }).click();
    await save();
    // The new pieces run along the shelf clicked: 150 over 600, either way.
    await expect
      .poll(async () => {
        const steps = ((await saved()).features as F[]).flatMap((f) => f.offsets ?? []).filter((r) => r.step?.kind === "shelves" && !!r.step.input?.vertical === (kind === "Cloisons"));
        const lean = steps.at(-1)?.step?.input?.lean;
        return lean ? Math.round((1000 * lean[1]!) / lean[0]!) : null;
      }, { timeout: 30_000 })
      .toBe(250);
    expect(errors).toEqual([]);
  });
}
