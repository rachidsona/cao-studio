/**
 * Scénarios chronométrés, pour mesurer poly_3D contre les logiciels du métier sur les mêmes projets : chaque scénario
 * compte les gestes de l'utilisateur (clics, saisies) et le temps qu'il faut, du relevé au document remis. Le même
 * scénario refait dans TopSolid'Wood ou Cabinet Vision par quelqu'un qui le maîtrise donne le point de comparaison.
 * BENCH_OUT=<fichier.json> garde les mesures ; sinon elles sont seulement écrites dans le journal.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newProject } from "./helpers";

interface Measure {
  scenario: string;
  gestures: number;
  seconds: number;
  steps: { step: string; seconds: number }[];
}
const measures: Measure[] = [];

/** Counts the user's gestures and times each step of a scenario. */
function bench(page: Page, scenario: string) {
  const m: Measure = { scenario, gestures: 0, seconds: 0, steps: [] };
  const started = Date.now();
  let last = started;
  return {
    /** A gesture of the user: a click, a choice, a text typed. */
    async act(run: () => Promise<unknown>) {
      m.gestures++;
      await run();
    },
    step(name: string) {
      const now = Date.now();
      m.steps.push({ step: name, seconds: (now - last) / 1000 });
      last = now;
    },
    done() {
      m.seconds = (Date.now() - started) / 1000;
      measures.push(m);
      console.log(`BENCH ${scenario} : ${m.gestures} gestes, ${m.seconds.toFixed(1)} s — ${m.steps.map((s) => `${s.step} ${s.seconds.toFixed(1)} s`).join(", ")}`);
    },
    page,
  };
}

const click = (page: Page, selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);

test.afterAll(() => {
  if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify(measures, null, 2));
});

test("cuisine en L : relevé collé, plan sur la pièce, cuisine proposée, dossier PDF", async ({ page }) => {
  await newProject(page, "zz-test-bench-cuisine");
  const b = bench(page, "Cuisine en L, du relevé au dossier client");
  await b.act(() => click(page, '[data-action="room"]'));
  const room = page.getByRole("dialog", { name: "Pièce" });
  await b.act(() => room.getByRole("button", { name: "Coller un relevé…" }).click());
  await b.act(() => room.locator("[data-room-survey]").fill("3,60 m\n2,40 m\n3,60 m\n2,40 m 90,5°"));
  await b.act(() => room.getByRole("button", { name: "Remplacer les murs" }).click());
  await b.act(() => room.getByRole("button", { name: "OK", exact: true }).click());
  b.step("relevé");
  await b.act(() => click(page, '[data-ribbon-tab="kitchen"]'));
  await b.act(() => click(page, '[data-workshop="kitchen-plan"]'));
  const tool = page.getByRole("dialog", { name: "Plan de cuisine" });
  await b.act(() => tool.getByRole("button", { name: "En L à gauche", exact: true }).click());
  await b.act(() => tool.getByLabel("Mur A dans la pièce").selectOption({ index: 1 }));
  await b.act(() => tool.getByRole("button", { name: "Créer le plan" }).click());
  b.step("plan");
  await b.act(() => tool.locator("[data-propose]").click());
  await expect(page.getByText(/Cuisine proposée/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-select^="body:"]').first()).toBeVisible({ timeout: 60_000 });
  b.step("cuisine 3D");
  await b.act(() => tool.locator("[data-kitchen-dossier-open]").click());
  const download = page.waitForEvent("download");
  await b.act(() => page.getByRole("button", { name: "Fichier PDF" }).click());
  expect((await download).suggestedFilename()).toMatch(/dossier de cuisine\.pdf$/);
  b.step("dossier PDF");
  b.done();
});

test("dressing en U : plan, chaque zone répartie, prix du projet", async ({ page }) => {
  await newProject(page, "zz-test-bench-dressing");
  const b = bench(page, "Dressing en U, du plan au prix");
  await b.act(() => click(page, '[data-workshop="dressing-plan"]'));
  const tool = page.getByRole("dialog", { name: "Plan de dressing" });
  await b.act(() => tool.getByRole("button", { name: "En U", exact: true }).click());
  await b.act(() => tool.getByRole("button", { name: "Créer le plan" }).click());
  const zones = tool.getByRole("list", { name: "Zones du plan" });
  await expect(zones).toBeVisible();
  b.step("plan");
  const partition = page.getByRole("dialog", { name: "Répartition" });
  const count = await zones.getByRole("listitem").count();
  for (let i = 0; i < count; i++) {
    await b.act(() => zones.getByRole("listitem").nth(i).getByRole("button", { name: /^(Modifier|Répartition)$/ }).click());
    await b.act(() => partition.getByRole("button", { name: "OK", exact: true }).click());
    // The tool stays open for another: « Terminer » puts it away.
    if (await partition.count()) await b.act(() => partition.getByRole("button", { name: "Terminer" }).click());
    await expect(partition).toHaveCount(0);
    await click(page, '[data-workshop="dressing-plan"]');
    await expect(zones).toBeVisible();
  }
  b.step(`${count} zones réparties`);
  await expect(tool.locator("[data-live-total]")).toHaveText(/TTC/, { timeout: 30_000 });
  b.step("prix");
  b.done();
});
