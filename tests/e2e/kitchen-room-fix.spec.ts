/** « À vérifier » : une cuisine aux cotes tapées qui entre dans les murs de la Pièce, posée sur la pièce d'un clic. */
import { expect, test } from "@playwright/test";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import { setBodyInfo } from "../../frontend/src/document/materials";
import { createReferencePlate, type CadDocument, type RoomFeature } from "../../frontend/src/document/types";
import { newProject } from "./helpers";

const room: RoomFeature = {
  id: "pc1", type: "room", name: "Pièce 1", height: 2500, thickness: 200,
  walls: [{ length: 3000, angle: 90 }, { length: 2500, angle: 90 }, { length: 3000, angle: 90 }, { length: 2500, angle: 90 }],
  obstacles: [],
};

test("une cuisine de 3,6 m dans une pièce de 3 m : « Corriger » la pose sur la pièce, plus rien n'entre dans un mur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  const api = await newProject(page, "zz-cuisine-murs");
  const typed = { ...KITCHEN_PLAN, model: "U" as const, lengthA: 3600, lengthB: 2400, lengthC: 2400 };
  // The room as the Pièce tool leaves it: its four walls are the room, not furniture.
  const surveyed = setBodyInfo({ ...createReferencePlate(), features: [room] } as CadDocument, [0, 1, 2, 3].map((i) => `pc1#${i}`), { room: true });
  const { doc, id } = withKitchenPlan(surveyed, typed);
  const built = withKitchenBuilt(doc, id, proposeKitchen(typed, undefined));
  if (typeof built === "string") throw new Error(built);
  const { features, layers, bodyInfo } = built.doc as CadDocument & { layers?: unknown; bodyInfo?: unknown };
  await page.evaluate(async ({ url, features, layers, bodyInfo }) => {
    const csrf = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "");
    const now = (await (await fetch(url, { headers: { Accept: "application/json" } })).json()) as { version: number; document: Record<string, unknown> };
    await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify({ document: { ...now.document, features, ...(layers ? { layers } : {}), ...(bodyInfo ? { bodyInfo } : {}) }, base_version: now.version, message: "Cuisine tapée" }) });
  }, { url: api, features, layers, bodyInfo });
  await page.reload();
  await expect(page.locator('[data-ref="loading"]')).toHaveCount(0, { timeout: 60_000 });
  const status = page.locator("[data-live-problems]");
  await expect(status).toBeVisible({ timeout: 60_000 });
  await status.click();
  const dialog = page.getByRole("dialog", { name: "Contrôle avant fabrication" });
  await expect(dialog).toContainText("entre dans le mur", { timeout: 30_000 });
  const fix = dialog.locator("[data-fix-kitchen-room]");
  await expect(fix).toContainText("Poser la cuisine sur Pièce 1");
  await fix.click();
  // What no longer fits in 3 m is said before anything changes.
  const confirm = page.getByRole("button", { name: "Corriger", exact: true });
  if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('[data-ref="status-recompute"]')).not.toContainText("erreur", { timeout: 60_000 });
  // Checked again: nothing runs into a wall any more.
  await expect(async () => {
    if (await status.isVisible()) {
      await status.click();
      await expect(page.getByRole("dialog", { name: "Contrôle avant fabrication" })).not.toContainText("entre dans le mur", { timeout: 5_000 });
      await page.getByRole("dialog", { name: "Contrôle avant fabrication" }).getByRole("button", { name: "Fermer", exact: true }).last().click();
    }
  }).toPass({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
