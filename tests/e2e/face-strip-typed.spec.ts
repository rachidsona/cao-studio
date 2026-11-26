/** Magie extrude : le départ sur un trait ou sur un point, et la distance et la hauteur tapées au clavier. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test("Magie extrude : départ sur un trait, distance tapée puis Entrée, hauteur tapée puis Entrée, et un nouveau corps", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-truelle-tapee");
  // Saved by itself (Ctrl + S would reach the tool: Ctrl swaps one line and a double line).
  const features = async () => {
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
    const project = await page.evaluate(async (url) => (await fetch(url, { headers: { Accept: "application/json" } })).json(), api);
    return project.document.features as { id: string; type: string; name: string; distance?: number; operation?: string }[];
  };
  const before = (await features()).length;
  // The plate (80 × 50 × 10 mm) seen from above.
  await click(page, '[data-action="view"][data-view="top"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await click(page, '[data-action="face-strip"]');
  const tool = page.getByRole("dialog", { name: "Magie extrusion" });
  await expect(tool).toBeVisible();
  // « Magie extrusion »: every trace in one choice — a line from an edge or a corner, or a shape on a face.
  const start = tool.getByRole("combobox", { name: "Tracé" });
  await expect(start).toHaveValue("edge");
  await expect(start.locator("option")).toHaveText(["Trait depuis une arête (parallèle)", "Trait depuis un coin (en travers)", "Trait depuis une face (parallèle)", "Ligne / polyligne", "Rectangle", "Cercle", "Décalage du contour", "Rectangle par le centre", "Rectangle par 3 points (de biais)", "Cercle par 2 points", "Cercle par 3 points", "Arc (centre, départ, fin)", "Arc par 3 points", "Polygone", "Oblong", "Ovale", "Courbe"]);
  const values = page.getByRole("status", { name: "Mesures" });
  await expect(values).toContainText("sur un trait");
  await start.selectOption("corner");
  await expect(values).toContainText("sur un point");
  // From a face: a click on a face no longer pulls it — the line starts from it, to be laid on another face.
  await start.selectOption("face");
  await expect(values).toContainText("sur une face");
  await expect(tool).toContainText("Cliquez une face");
  {
    const box = (await page.locator("canvas.cad-view").boundingBox())!;
    const [x, y] = [box.x + box.width * 0.3, box.y + box.height * 0.38];
    await page.mouse.move(x, y);
    await page.mouse.move(x + 1, y);
    await expect(values).toContainText("le trait part de cette face");
    await page.mouse.click(x + 1, y);
    // Still on the face it starts from: no line of its own plane lies in it.
    await expect(tool).toContainText("Ce départ ne donne pas de trait sur cette face");
    await page.keyboard.press("Escape");
  }
  // A shape on a face: the same tool, its other way to draw, then back to the line from an edge.
  await start.selectOption("rectangle");
  await expect(tool.getByRole("combobox", { name: "Tracé" })).toHaveValue("rectangle");
  await expect(tool).toContainText("Cliquez sur une face d'un corps");
  await expect(page.locator("#editor")).toHaveAttribute("data-tool", "drawOnFace");
  await tool.getByRole("combobox", { name: "Tracé" }).selectOption("edge");
  await expect(tool.getByRole("combobox", { name: "Tracé" })).toHaveValue("edge");
  await expect(page.locator("#editor")).toHaveAttribute("data-tool", "faceStrip");

  // The left edge of the plate, near its top corner: an edge, not the corner (« sur un trait »).
  const view = (await page.locator("canvas.cad-view").boundingBox())!;
  const plate = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.cad-view")!.getBoundingClientRect();
    return { x: canvas.x, y: canvas.y, w: canvas.width, h: canvas.height };
  });
  // The plate is centred and fills most of the view: its left edge is left of the centre.
  /** Hovers an edge of the plate (its faces read the first time) and clicks it once the edge is under the pointer. */
  const startOnEdge = async (near: number) => {
    for (const fx of [0, 0.003, -0.003, 0.006, -0.006, 0.009, 0].map((d) => near + d)) {
      await page.mouse.move(plate.x + plate.w * fx, plate.y + plate.h * 0.42);
      await page.waitForTimeout(400);
      await page.mouse.move(plate.x + plate.w * fx + 1, plate.y + plate.h * 0.42);
      if ((await values.textContent())?.includes("part de cette arête")) {
        if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/truelle-arete-${Math.round(near * 100)}.png` });
        await page.mouse.click(plate.x + plate.w * fx + 1, plate.y + plate.h * 0.42);
        await expect(tool.getByRole("textbox", { name: "Distance" })).toBeVisible();
        return;
      }
    }
    throw new Error("arête non trouvée");
  };
  await startOnEdge(0.044);
  // The distance typed (the project counts in cm): in the value box, then Entrée lays the line.
  await page.mouse.move(view.x + view.width * 0.4, view.y + view.height * 0.45);
  await page.keyboard.type("2");
  await expect(values).toContainText("2▏");
  await page.keyboard.press("Enter");
  await expect(tool.getByRole("textbox", { name: "Hauteur" })).toBeVisible();
  await expect(values).toContainText("Hauteur");
  // The height typed, Entrée: pushed 0,5 cm into the plate (a groove), the tool still there for the next one.
  await page.keyboard.type("-0,5");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Matière enlevée|Matière ajoutée/).first()).toBeVisible();
  const after = await features();
  expect(after.length).toBe(before + 2);
  const made = after.find((f) => f.type === "extrude" && f.name.startsWith("Extrusion") && f.operation === "cut");
  expect(Math.abs(made?.distance ?? 0)).toBeCloseTo(5, 3);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");

  // Again, from the same edge, pulled into a body of its own: « Nouveau corps », the plate left as it is.
  const bodies = await page.locator('[data-select^="body:"]').count();
  // The left edge again, the groove's floor: the trace of the groove, left in front of it, does not hide the edge.
  await startOnEdge(0.066);
  await page.mouse.move(view.x + view.width * 0.4, view.y + view.height * 0.45);
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await tool.getByRole("checkbox", { name: "Nouveau corps" }).check();
  await expect(tool.getByRole("checkbox", { name: /Inverser/ })).toHaveCount(0);
  await page.locator("canvas.cad-view").focus().catch(() => {});
  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nouveau corps créé.").first()).toBeVisible();
  await page.keyboard.press("Escape");
  const last = (await features()).filter((f) => f.type === "extrude").at(-1)!;
  expect(last.operation).toBe("new");
  await expect(page.locator('[data-select^="body:"]')).toHaveCount(bodies + 1);
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur");
  expect(errors).toEqual([]);
});
