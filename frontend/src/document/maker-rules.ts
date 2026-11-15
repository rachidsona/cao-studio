/**
 * Règles des fabricants de quincaillerie, vérifiées sur les modèles choisis pour le projet (hardware-catalog.ts :
 * charnière, coulisse, poignée), en calcul pur :
 * - une porte trop fine pour la cuvette de la charnière : il doit rester CUP_WALL mm de matière sous la cuvette ;
 * - une porte battante plus large que DOOR_WIDTH_MAX : elle se voile et force ses charnières ;
 * - une poignée dont l'entraxe ne tient pas sur la façade (marge de HANDLE_MARGIN à chaque bout) ;
 * - un tiroir plein plus lourd que ce que portent ses coulisses : son poids, plus un contenu de CONTENT_LOAD kg par m²
 *   de fond (vaisselle, casseroles, linge), contre la charge du modèle ; le premier modèle du catalogue qui suffit est
 *   proposé.
 * L'angle d'ouverture de la charnière choisie (110°, 155°…) sert au contrôle des portes qui heurtent en s'ouvrant
 * (app/workshop/fabrication-check.ts). Ce sont des repères courants : la fiche du fabricant fait foi.
 */
import { frontsParts, swingsUp } from "../features/fronts-parts";
import { isGlass } from "../features/glass-door";
import { nichePartsIn } from "../features/niche-parts";
import { partMass } from "../features/stability";
import type { Problem } from "./fabrication-check";
import { chosenHardware, SLIDE_MODELS, type HardwareChoice } from "./hardware-catalog";
import { bodyInfo } from "./materials";
import { bodyLabel } from "./operations";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type Vec3 } from "./types";

/** What must be left of the door under a hinge cup (mm). */
export const CUP_WALL = 3;
/** Wider than this, a hinged door warps and strains its hinges (mm). */
export const DOOR_WIDTH_MAX = 600;
/** Free length at each end of a handle (mm). */
export const HANDLE_MARGIN = 20;
/** What a full drawer holds, by the area of its bottom (kg per m²): dishes, pans, folded linen. */
export const CONTENT_LOAD = 60;

/** A front as the rules see it. */
export interface FrontFacts {
  id: string;
  name: string;
  kind: "door" | "drawer";
  /** Width, height and thickness (mm). */
  width: number;
  height: number;
  thickness: number;
  /** Hung on cup hinges (a glazed door has its own). */
  cupHinges: boolean;
  /** Hinged along its top or its bottom (lift-up, flap): wide by nature. */
  swingsUp: boolean;
  /** The length the handle's holes lie along; null: no handle. */
  handleRun: number | null;
  /** A drawer: what it weighs empty (kg) and the area of its bottom (m²). */
  drawer?: { mass: number; bottom: number };
}

const size = (from: Vec3, to: Vec3) => [0, 1, 2].map((k) => Math.abs(to[k]! - from[k]!)) as Vec3;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The doors and drawer fronts of the project, with what the rules need. */
export function frontFacts(doc: CadDocument): FrontFacts[] {
  const out: FrontFacts[] = [];
  const massOf = (id: string, from: Vec3, to: Vec3) => partMass(size(from, to).reduce((v, s) => v * s, 1), bodyInfo(doc, id).material);
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "fronts") {
      const cabinet = doc.features.find((c): c is CabinetFeature => c.id === f.cabinet && c.type === "cabinet");
      if (!cabinet) continue;
      const parts = frontsParts(f, cabinet);
      const handles = !!f.handles && f.grip !== "gorge";
      const up = swingsUp(f);
      parts.forEach((p, i) => {
        if (p.role?.kind !== "door" && p.role?.kind !== "drawer") return;
        const id = `${f.id}${PART_SEPARATOR}${i}`;
        const [w, t, h] = size(p.from, p.to);
        const facts: FrontFacts = { id, name: bodyLabel(doc, id), kind: p.role.kind, width: w, height: h, thickness: t, cupHinges: p.role.kind === "door" && !!f.hinges && !isGlass(f), swingsUp: up, handleRun: handles ? (p.role.kind === "door" && !up ? h : w) : null };
        if (p.role.kind === "drawer") {
          const k = /(\d+)$/.exec(p.name)?.[1];
          let mass = massOf(id, p.from, p.to);
          let bottom = 0;
          parts.forEach((q, j) => {
            if (!k || !q.name.startsWith(`Tiroir ${k} — `)) return;
            mass += massOf(`${f.id}${PART_SEPARATOR}${j}`, q.from, q.to);
            if (q.name.endsWith("fond")) bottom = (size(q.from, q.to)[0] * size(q.from, q.to)[1]) / 1e6;
          });
          facts.drawer = { mass, bottom };
        }
        out.push(facts);
      });
    } else if (f.type === "niche" && (f.fill === "doors" || f.fill === "door" || f.fill === "drawers")) {
      const parts = nichePartsIn(doc.features, f);
      parts.forEach((p, i) => {
        if (p.role !== "front") return;
        const id = `${f.id}${PART_SEPARATOR}${i}`;
        // In the niche's frame: u across, v up, w out.
        const [w, h, t] = size(p.from, p.to);
        const drawer = f.fill === "drawers";
        const facts: FrontFacts = { id, name: bodyLabel(doc, id), kind: drawer ? "drawer" : "door", width: w, height: h, thickness: t, cupHinges: !drawer && !isGlass(f), swingsUp: false, handleRun: f.handles && !f.inner ? (drawer ? w : h) : null };
        if (drawer) {
          const k = /(\d+)$/.exec(p.name)?.[1];
          let mass = massOf(id, p.from, p.to);
          let bottom = 0;
          parts.forEach((q, j) => {
            if (!k || !q.name.startsWith(`Tiroir ${k} — `)) return;
            mass += massOf(`${f.id}${PART_SEPARATOR}${j}`, q.from, q.to);
            if (q.name.endsWith("fond")) bottom = (size(q.from, q.to)[0] * size(q.from, q.to)[2]) / 1e6;
          });
          facts.drawer = { mass, bottom };
        }
        out.push(facts);
      });
    }
  }
  return out;
}

/** What a full drawer weighs (kg): itself, and what its bottom holds. */
export const drawerLoad = (d: { mass: number; bottom: number }) => d.mass + d.bottom * CONTENT_LOAD;

/** The fronts that break a rule of the chosen hardware's makers. */
export function makerProblems(fronts: readonly FrontFacts[], hw: HardwareChoice): Problem[] {
  const problems: Problem[] = [];
  const warn = (f: FrontFacts, message: string, severity: Problem["severity"] = "warning") => problems.push({ kind: "maker", severity, message: `${f.name} : ${message}`, bodies: [f.id] });
  const { hinge, slide, handle } = hw;
  for (const f of fronts) {
    if (f.kind === "door" && f.cupHinges && f.thickness - hinge.cup.depth < CUP_WALL - 1e-6) {
      const left = r1(f.thickness - hinge.cup.depth);
      warn(f, `${r1(f.thickness)} mm d'épaisseur pour la cuvette de ${hinge.cup.depth} mm de « ${hinge.label} » : il resterait ${left > 0 ? `${left} mm` : "moins que rien"} sous elle, il en faut ${CUP_WALL}. Prenez une porte de ${Math.ceil(hinge.cup.depth + CUP_WALL)} mm au moins, ou une charnière à petit boîtier.`, "error");
    }
    if (f.kind === "door" && !f.swingsUp && f.width > DOOR_WIDTH_MAX + 0.5) {
      warn(f, `porte battante de ${Math.round(f.width)} mm de large : au-delà de ${DOOR_WIDTH_MAX} mm, elle se voile et force ses charnières. Partagez-la en deux portes.`);
    }
    if (f.handleRun !== null && handle.spacing > 0 && handle.spacing + 2 * HANDLE_MARGIN > f.handleRun + 0.5) {
      warn(f, `la poignée « ${handle.label} » (entraxe ${handle.spacing} mm) ne tient pas sur ${Math.round(f.handleRun)} mm de façade. Prenez un entraxe de ${Math.max(0, Math.floor((f.handleRun - 2 * HANDLE_MARGIN) / 32) * 32) || "—"} mm au plus, ou un bouton.`);
    }
    if (f.drawer) {
      const load = drawerLoad(f.drawer);
      if (load > slide.load + 1e-6) {
        const better = [...SLIDE_MODELS].filter((m) => m.load >= load).sort((a, b) => a.load - b.load || a.price - b.price)[0];
        warn(f, `tiroir plein d'environ ${Math.round(load)} kg (${r1(f.drawer.mass)} kg de tiroir et ${Math.round(f.drawer.bottom * CONTENT_LOAD)} kg de contenu) pour des coulisses de ${slide.load} kg (« ${slide.label} »). ${better ? `Prenez par exemple « ${better.label} » (${better.load} kg).` : "Aucune coulisse du catalogue n'y suffit : réduisez le tiroir."}`);
      }
    }
  }
  return problems;
}

/** The problems of the project with its chosen hardware. */
export const projectMakerProblems = (doc: CadDocument): Problem[] => makerProblems(frontFacts(doc), chosenHardware(doc));
