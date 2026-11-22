/** Un tiroir entier pris par une de ses pièces, sa façade séparée en cadre comprise ; son dossier dans le Navigateur. */
import { describe, expect, it } from "vitest";
import { drawerBodies, drawerOf } from "../../frontend/src/document/drawer-pick";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { groupByDrawer } from "../../frontend/src/ui/body-kinds";
import type { BodyEntry } from "../../frontend/src/ui/browser";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function chest(): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400);
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [record] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk9", type: "sketch", name: "Mur", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base = createReferencePlate();
  return {
    ...base,
    features: [
      ...base.features,
      sketch,
      { id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk9", partition: "of1", niche: [0], fill: "drawers", drawers: 2, gap: 3, thickness: 18, handles: true },
      // The front of the first drawer split into its sides.
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "td1#0", faces: [], thickness: 0, sides: "separate", joint: "miter" },
    ] as CadDocument["features"],
  };
}

describe("un tiroir entier", () => {
  const doc = chest();
  const td = doc.features.find((f): f is NicheFeature => f.id === "td1")!;
  const parts = nichePartsIn(doc.features, td);
  const of = (n: number) => parts.flatMap((p, i) => (new RegExp(`tiroir ${n}\\b`, "i").test(p.name) ? [`td1#${i}`] : []));
  // Shown: every piece but the first front (split into the frame sh1#0..2).
  const shown = [...parts.map((_, i) => `td1#${i}`).filter((b) => b !== "td1#0"), "sh1#0", "sh1#1", "sh1#2"];

  it("chaque pièce dit son tiroir, le cadre de sa façade aussi", () => {
    expect(parts[0]!.name).toBe("Façade tiroir 1");
    expect(drawerOf(doc, "sh1#1")).toEqual({ feature: "td1", n: 1 });
    expect(drawerOf(doc, of(2)[1]!)).toEqual({ feature: "td1", n: 2 });
    expect(drawerOf(doc, "sk9#0")).toBeNull();
  });

  it("le tiroir entier : ses pièces montrées et le cadre de sa façade, pas l'autre tiroir", () => {
    const whole = drawerBodies(doc, "sh1#0", shown);
    expect(whole).toEqual([...of(1).filter((b) => b !== "td1#0"), "sh1#0", "sh1#1", "sh1#2"]);
    expect(whole.some((b) => of(2).includes(b))).toBe(false);
  });

  it("dans le Navigateur, un dossier par tiroir, le cadre rangé dedans", () => {
    const row = (id: string) => ({ body: { item: { id, name: id }, label: id, history: [] } }) as unknown as BodyEntry;
    const entries: BodyEntry[] = [
      { group: { id: "td1", name: "Tiroirs 1", entries: shown.filter((b) => b.startsWith("td1")).map(row) } } as BodyEntry,
      { group: { id: "sh1", name: "Côtés séparés 1", entries: ["sh1#0", "sh1#1", "sh1#2"].map(row) } } as BodyEntry,
      row("sk9#0"),
    ];
    const key = (b: string) => {
      const d = drawerOf(doc, b);
      return d ? { key: `${d.feature}:${d.n}`, name: `Tiroir ${d.n}` } : null;
    };
    const tree = groupByDrawer(entries, key);
    // The frame's own folder is emptied into the drawer's; the panel stays where it was.
    expect(tree.map((e) => ("group" in e ? e.group.name : e.body.item.id))).toEqual(["Tiroirs 1", "sk9#0"]);
    const inside = (tree[0] as { group: { entries: BodyEntry[] } }).group.entries.filter((e) => "group" in e) as { group: { name: string; entries: BodyEntry[] } }[];
    expect(inside.map((g) => g.group.name)).toEqual(["Tiroir 1", "Tiroir 2"]);
    expect(inside[0]!.group.entries.map((e) => ("body" in e ? e.body.item.id : ""))).toContain("sh1#2");
  });
});
