/** Pipette de forme : sur une cuisine proposée, la forme d'un meuble bas prise d'un clic et donnée aux autres meubles bas. */
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
type Run = { model: string; width: number }[];
const runsOf = async (page: Page, api: string) =>
  page.evaluate(async (url) => {
    const doc = ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: { type: string; kitchenPlan?: { runs: Record<string, Run> } }[] } }).document;
    return doc.features.find((f) => f.type === "sketch" && f.kitchenPlan)!.kitchenPlan!.runs;
  }, api);

test("la forme d'un meuble de cuisine donnée d'un clic à d'autres, telle quelle, largeur comprise", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-pipette-forme");
  await click(page, '[data-ribbon-tab="kitchen"]');
  await click(page, '[data-workshop="kitchen-plan"]');
  const plan = page.getByRole("dialog", { name: "Plan de cuisine" });
  await plan.getByRole("button", { name: "Droite (I)", exact: true }).click();
  await plan.getByRole("button", { name: "Créer le plan" }).click();
  await plan.locator("[data-propose]").click();
  const confirm = page.getByRole("button", { name: "Proposer", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Plan de travail A").first()).toBeVisible({ timeout: 60_000 });
  await plan.getByRole("button", { name: /^Fermer/ }).first().click();
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1500);
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const before = (await runsOf(page, api)).A!;

  await click(page, '[data-workshop="form-pipette"]');
  const tool = page.getByRole("dialog", { name: "Pipette de forme" });
  const state = tool.locator("[data-form-pipette-state]");
  await expect(state).toContainText("dont vous prenez la forme");
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  // The bottom row of the front view, left to right: the first unit hit gives its form, the others take it.
  let taken = "";
  for (let fx = 0.12; fx < 0.9; fx += 0.04) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * 0.66);
    await page.waitForTimeout(250);
    if (!taken && /prennent la forme/.test((await state.textContent()) ?? "")) taken = (await state.textContent())!;
  }
  expect(taken).toMatch(/Cliquez les éléments qui prennent la forme de « .+ cm »/);
  await page.keyboard.press("Escape");
  await expect(tool).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const after = (await runsOf(page, api)).A!;
  // The base units are of the form taken, its width with it; the appliances keep theirs (a sink, an oven).
  const width = Number(/« .+ (\d+(?:[.,]\d+)?) cm »/.exec(taken)![1]!.replace(",", ".")) * 10;
  const app = (run: Run) => run.filter((i) => i.model.startsWith("app-"));
  expect(app(after)).toEqual(app(before).map((i) => expect.objectContaining({ model: i.model, width: i.width })));
  expect(after.filter((i) => i.model.startsWith("base-")).map((i) => [i.model, i.width])).toEqual(before.filter((i) => i.model.startsWith("base-")).map(() => ["base-bas-3-tiroirs", width]));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/pipette-forme.png` });
  expect(errors).toEqual([]);
});

test("des façades à tiroirs données d'un clic aux façades à porte d'un autre caisson", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await newProject(page, "zz-pipette-forme-facades");
  await page.evaluate(async (url) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    const cabinet = (id: string, x: number) => ({ id, type: "cabinet", name: id, origin: [x, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" });
    const fronts = (id: string, cabinet: string, layout: string) => ({ id, type: "fronts", name: id, cabinet, layout, drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true });
    const features = [cabinet("cb1", 0), cabinet("cb2", 900), { ...fronts("fr1", "cb1", "drawers"), drawers: 4, gap: 4 }, fronts("fr2", "cb2", "door")];
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features }, base_version: now.version, message: "Caissons" }) });
  }, api);
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  await click(page, '[data-action="view"][data-view="front"]');
  await click(page, '[data-action="fit"]');
  await page.waitForTimeout(1200);
  await click(page, '[data-workshop="form-pipette"]');
  const tool = page.getByRole("dialog", { name: "Pipette de forme" });
  const box = (await page.locator("canvas.cad-view").boundingBox())!;
  // Left the drawers (their form taken), right the door (it takes it).
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await expect(tool.locator("[data-form-pipette-state]")).toContainText("prennent la forme de « fr1 »");
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await expect(page.getByText("« fr2 » prend la forme de « fr1 »")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+s");
  await expect(page.locator('[data-ref="status-save"]')).toHaveText("Enregistré", { timeout: 30_000 });
  const fr2 = await page.evaluate(async (url) => ((await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { document: { features: Record<string, unknown>[] } }).document.features.find((f) => f.id === "fr2"), api);
  expect(fr2).toMatchObject({ cabinet: "cb2", layout: "drawers", drawers: 4, gap: 4 });
  expect(errors).toEqual([]);
});
