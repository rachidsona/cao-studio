/**
 * Les finitions d'un caisson qui bouge (« Finitions » : joues, fileurs, bandeau, plinthe, pieds) le suivent : celles qui
 * n'habillent que lui sont déplacées et tournées avec lui ; sa largeur changée, ce qui est à sa droite suit son côté
 * droit et ce qui court le long de lui s'allonge ou se raccourcit d'autant. Leur face avant tourne avec lui, et elles
 * habillent ses nouveaux corps quand on les rouvre. Pur.
 */
import { bodyOrigin } from "./operations";
import { featureOfBody, type CadDocument, type SketchFeature, type TrimFeature, type Vec3 } from "./types";
import { frameOf } from "../sketcher/frame";

type Frame = ReturnType<typeof frameOf>;

/** What a caisson was, or is: its frame, its width, its own bodies' features. */
export interface CaissonPose {
  frame: Frame;
  width: number;
  /** The features of its bodies: its boards, its doors, drawers and back. */
  features: Set<string>;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const EDGE = 0.5;

/** Its pose in a document: the sketch's frame, the width of its Répartition, its features. */
export function caissonPose(doc: CadDocument, sketch: SketchFeature, width: number): CaissonPose {
  const features = new Set(doc.features.filter((f) => (f.type === "extrude" || f.type === "niche") && f.sketch === sketch.id).map((f) => f.id));
  return { frame: frameOf(sketch), width, features };
}

/** A point of the old caisson's world where the new one has it: along its width, what is past its right side follows it. */
function mapPoint(p: Vec3, from: CaissonPose, to: CaissonPose): Vec3 {
  const d = sub(p, from.frame.origin);
  let a = dot(d, from.frame.u);
  const b = dot(d, from.frame.v);
  const c = dot(d, from.frame.normal);
  if (a >= from.width - EDGE) a += to.width - from.width;
  else if (a > EDGE) a *= to.width / from.width;
  const f = to.frame;
  return [0, 1, 2].map((i) => f.origin[i]! + f.u[i]! * a + f.v[i]! * b + f.normal[i]! * c) as Vec3;
}

/** A direction turned as the caisson turned. */
function mapDirection(e: Vec3, from: CaissonPose, to: CaissonPose): Vec3 {
  const [a, b, c] = [dot(e, from.frame.u), dot(e, from.frame.v), dot(e, from.frame.normal)];
  return [0, 1, 2].map((i) => to.frame.u[i]! * a + to.frame.v[i]! * b + to.frame.normal[i]! * c) as Vec3;
}

/** Whether a finishing dresses this caisson alone: every body it was given is one of its own. */
const dressesOnly = (doc: CadDocument, trim: TrimFeature, pose: CaissonPose) =>
  !!trim.source?.length && trim.source.every((id) => pose.features.has(featureOfBody(bodyOrigin(doc, id))) || pose.features.has(featureOfBody(id)));

/**
 * The finishings of the caisson `before` (taken in `base`, before it moved) carried to where it is in `doc` (`after`):
 * their boards moved, turned and stretched, their front turned, their bodies those of the caisson now.
 */
export function withTrimsFollowing(base: CadDocument, doc: CadDocument, before: CaissonPose, after: CaissonPose): CadDocument {
  const own = base.features.filter((f): f is TrimFeature => f.type === "trim" && dressesOnly(base, f, before)).map((f) => f.id);
  if (!own.length) return doc;
  const gone = (id: string) => before.features.has(featureOfBody(id)) && !after.features.has(featureOfBody(id));
  const boards = [...after.features].filter((id) => doc.features.find((f) => f.id === id)?.type === "extrude");
  return {
    ...doc,
    features: doc.features.map((f) => {
      if (f.type !== "trim" || !own.includes(f.id)) return f;
      const parts = f.parts.map((p) => {
        const [from, to] = [mapPoint(p.from, before, after), mapPoint(p.to, before, after)];
        // A foot stands from its bottom up; a board is a box, its corners in order again.
        if (p.radius) return { ...p, from, to };
        return { ...p, from: [0, 1, 2].map((i) => Math.min(from[i]!, to[i]!)) as Vec3, to: [0, 1, 2].map((i) => Math.max(from[i]!, to[i]!)) as Vec3 };
      });
      let settings = f.settings;
      if (settings) {
        const e: Vec3 = settings.front.axis === 0 ? [settings.front.sign, 0, 0] : [0, settings.front.sign, 0];
        const [x, y] = mapDirection(e, before, after);
        settings = { ...settings, front: Math.abs(x) >= Math.abs(y) ? { axis: 0, sign: x < 0 ? -1 : 1 } : { axis: 1, sign: y < 0 ? -1 : 1 } };
      }
      // Its boards made again have new ids: the finishing dresses the new ones.
      const kept = (f.source ?? []).filter((id) => !gone(featureOfBody(bodyOrigin(base, id))) && !gone(id));
      const source = kept.length === f.source?.length ? f.source : [...new Set([...kept, ...boards])];
      return { ...f, parts, ...(settings ? { settings } : {}), ...(source ? { source } : {}) };
    }),
  };
}
