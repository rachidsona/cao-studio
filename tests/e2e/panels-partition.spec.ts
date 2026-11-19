/** « Panneaux depuis un squelette » dans un vrai navigateur : un squelette de face devient une Répartition. */
import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

test("panneaux : le squelette d'un meuble, de face, devient une Répartition avec ses cases et son étagère", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-squelette-repartition");
  // The outline of a cupboard 100 × 200 on the front plane, a side in the middle, a shelf in the left case.
  const lines = [[0, 0, 1000, 0], [1000, 0, 1000, 2000], [1000, 2000, 0, 2000], [0, 2000, 0, 0], [500, 0, 500, 2000], [0, 1000, 500, 1000]];
  const sketch = {
    id: "sk1", type: "sketch", name: "Squelette", plane: "XZ", offset: 0, constraints: [],
    points: lines.flatMap(([x1, y1, x2, y2], i) => [{ id: `p${2 * i}`, x: x1, y: y1 }, { id: `p${2 * i + 1}`, x: x2, y: y2 }]),
    curves: lines.map((_, i) => ({ id: `l${i}`, kind: "line", p1: `p${2 * i}`, p2: `p${2 * i + 1}` })),
  };
  await page.evaluate(async ({ url, sketch }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features: [sketch] }, base_version: now.version, message: "Squelette" }) });
  }, { url: api, sketch });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="panels"]')?.click());
  const tool = page.getByRole("dialog", { name: "Panneaux depuis un squelette" });
  await expect(tool).toContainText("devient une Répartition", { timeout: 30_000 });
  await tool.getByRole("button", { name: /^OK/ }).first().click();
  await page.keyboard.press("Control+s");
  type Doc = { features: { type: string; hidden?: boolean; id: string; offsets?: { step?: { kind: string } }[] }[] };
  const saved = async () => (await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: Doc }).document, api));
  // A Répartition (its partition and its shelf as steps of a new sketch), its panels extruded; no boards, the skeleton hidden.
  await expect.poll(async () => (await saved()).features.some((f) => f.type === "sketch" && (f.offsets ?? []).some((r) => r.step?.kind === "partition")), { timeout: 30_000 }).toBe(true);
  const doc = await saved();
  const steps = doc.features.flatMap((f) => (f.offsets ?? []).map((r) => r.step?.kind));
  expect(steps).toEqual(["partition", "shelves"]);
  expect(doc.features.some((f) => f.type === "panels")).toBe(false);
  expect(doc.features.find((f) => f.id === "sk1")?.hidden).toBe(true);
  expect(doc.features.filter((f) => f.type === "extrude").length).toBeGreaterThan(4);
  expect(errors).toEqual([]);
});
