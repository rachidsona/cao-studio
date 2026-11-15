/**
 * Un accessoire intérieur sorti dans la vue (un clic l'ouvre, un autre le referme), comme un tiroir : ce qui bouge et
 * comment, dans le repère de la niche (u en largeur, v vers le haut, w vers l'avant). Les paniers, porte-pantalons,
 * porte-chaussures, tablettes, poubelles, range-bouteilles, porte-cravates et miroirs glissent vers l'avant sur leurs
 * coulisses (les coulisses restent) ; le magic corner sort ses paniers avant, et les paniers arrière prennent leur
 * place ; les demi-lunes pivotent autour de leur montant ; la penderie escamotable descend devant la niche ;
 * l'égouttoir sort son bac de récupération ; un range-couverts posé dans un tiroir sort avec lui (app/drawer-toggle.ts).
 * Les plateaux tournants tournent sur eux-mêmes : rien ne se voit, ils ne bougent pas. Pur.
 */
import type { Vec3 } from "../document/types";
import { accessoryModel, SET_BACK } from "./accessory-parts";
import type { NicheGeometry, NichePart } from "./niche-parts";

/** A group of parts and how it moves: slid by `slide`, or turned about the vertical through `pivot`. */
export interface AccessoryMove {
  parts: number[];
  slide?: Vec3;
  /** Turned by `angle` degrees about the vertical through `pivot`, bringing `free` out in front (the sense is the caller's). */
  turn?: { pivot: Vec3; free: Vec3; angle: number };
}

/** Out by most of its depth: the slides keep a part of it in. */
const REACH = 0.8;
/** How far the pull-down rail comes down. */
const PULL_DOWN = 500;

/** How the parts of this accessory move when it is pulled out (empty: nothing moves). */
export function accessoryMoves(model: string | undefined, parts: readonly NichePart[], n: Pick<NicheGeometry, "box" | "depth">): AccessoryMove[] {
  const m = accessoryModel(model);
  if (!m || !parts.length) return [];
  const all = parts.map((_, i) => i);
  const but = (re: RegExp) => all.filter((i) => !re.test(parts[i]!.name));
  const only = (re: RegExp) => all.filter((i) => re.test(parts[i]!.name));
  const out = (by: number): Vec3 => [0, 0, by];
  const pull = out(m.depth * REACH);
  switch (m.shape) {
    case "drainer":
      return [{ parts: only(/^Bac de récupération$/), slide: out(m.depth * 0.6) }];
    case "carousel":
      return [];
    case "halfmoon": {
      const post = parts.find((p) => p.name === "Montant pivot");
      if (!post) return [];
      const pivot: Vec3 = [(post.from[0] + post.to[0]) / 2, post.from[1], (post.from[2] + post.to[2]) / 2];
      return [{ parts: but(/^Montant pivot$/), turn: { pivot, free: [n.box.x1, pivot[1], pivot[2]], angle: 90 } }];
    }
    case "magic": {
      const front = but(/^(Coulisse|Panier arrière)/);
      const back = only(/^Panier arrière/);
      return [
        { parts: front, slide: pull },
        { parts: back, slide: out(m.depth / 2) },
      ];
    }
    case "pulldown":
      // Down in front of the niche, within reach.
      return [{ parts: all, slide: [0, -PULL_DOWN, n.depth / 2 + 60] }];
    case "bottles":
      return [{ parts: but(/^Coulisse basse$/), slide: pull }];
    case "ties":
    case "mirror":
      return [{ parts: but(/^Coulisse$/), slide: pull }];
    case "tray":
    case "bins":
      return [{ parts: all, slide: pull }];
    default:
      // Basket, trousers, shoes, shelf: on a pair of slides that stay.
      return [{ parts: but(/^Coulisse (gauche|droite)$/), slide: out(Math.min(m.depth, n.depth - SET_BACK) * REACH) }];
  }
}
