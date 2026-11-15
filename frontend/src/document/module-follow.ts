/**
 * Les modules programmés dans le document : posés dans des niches, chacun calculé sur la sienne (module-program.ts), et
 * calculés à nouveau quand leur niche change — la Répartition élargie, une niche haussée, une cloison déplacée. La
 * première division d'un tel module garde son programme et les mesures de la niche pour lesquelles il a été calculé ;
 * chaque changement de l'esquisse (sketch-extrusion.ts) les compare à la niche d'à présent et pose le module de nouveau
 * si elle a changé, dans la même annulation. Un module retouché à la main au point de ne plus en être un n'est plus
 * suivi. Pur.
 */
import { withModules, type ModulePick } from "./dressing-modules";
import { moduleAt, withModuleChanged } from "./module-edit";
import { nicheMeasures, resolveProgram, sameNiche, type ModuleProgram, type NicheVariables } from "./module-program";
import { findFeature } from "./operations";
import type { CadDocument, SketchFeature } from "./types";
import { isPartition, isShelves, pathKey } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";

/** What the formulas read in this niche of this Répartition: its free width and height, the depth and thickness of the panels. */
export function nicheVariables(sketch: SketchFeature | undefined, partition: string, box: NicheBox): NicheVariables {
  const record = sketch?.offsets?.find((r) => r.id === partition);
  const step = record && isPartition(record) ? record.step : undefined;
  return { largeur: box.x1 - box.x0, hauteur: box.y1 - box.y0, profondeur: step?.depth ?? 0, epaisseur: step?.input.thickness ?? 0 };
}

const sketchOf = (doc: CadDocument, id: string) => {
  const f = findFeature(doc, id);
  return f?.type === "sketch" ? f : undefined;
};

/** This program in each niche, worked out for each, as one change. A string: the niche and what is wrong. */
export function withProgramModules(base: CadDocument, sketchId: string, picks: ModulePick[], program: ModuleProgram): CadDocument | string {
  let doc = base;
  // Left to right, bottom to top, as withModules numbers them.
  for (const pick of [...picks].sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0)) {
    const at = nicheVariables(sketchOf(doc, sketchId), pick.partition, pick.box);
    const resolved = resolveProgram(program, at);
    if (typeof resolved === "string") return picks.length > 1 ? `Niche de ${nicheMeasures(at)} : ${resolved}` : resolved;
    const made = withModules(doc, sketchId, [pick], resolved.kind, resolved.thickness, resolved.sizes, { program, at });
    if (typeof made === "string") return picks.length > 1 ? `Niche de ${nicheMeasures(at)} : ${made}` : made;
    doc = made;
  }
  return doc;
}

/** Working the modules out again: what that does to the sketch is not followed once more. */
let following = false;

/** The modules programmed of this sketch whose niche changed, worked out and laid again. */
export function withModulesFollowing(base: CadDocument, sketchId: string): CadDocument {
  const sketch = following ? undefined : sketchOf(base, sketchId);
  const programmed = (sketch?.offsets ?? []).flatMap((r) => (r.formula && isShelves(r) ? [{ partition: r.step.of, niche: r.step.niche }] : []));
  if (programmed.length === 0) return base;
  following = true;
  let doc = base;
  try {
    for (const { partition, niche } of programmed) {
      const now = sketchOf(doc, sketchId);
      const record = now?.offsets?.find((r) => r.formula && isShelves(r) && r.step.of === partition && pathKey(r.step.niche) === pathKey(niche));
      const placed = now && record?.formula ? moduleAt(doc, now, partition, niche) : null;
      if (!now || !record?.formula || !placed) continue;
      const at = nicheVariables(now, partition, placed.box);
      if (sameNiche(at, record.formula.at)) continue;
      const { program } = record.formula;
      const resolved = resolveProgram(program, at);
      // Its formulas fail in this niche, or it no longer fits: it stays as it was.
      if (typeof resolved === "string") continue;
      const made = withModuleChanged(doc, sketchId, placed, resolved.kind, resolved.thickness, resolved.sizes, { program, at });
      if (typeof made !== "string") doc = made;
    }
  } finally {
    following = false;
  }
  return doc;
}
