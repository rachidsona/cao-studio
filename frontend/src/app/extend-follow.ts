/**
 * Les liaisons de « Prolonger élément » (document/extend-reach.ts) tenues : après chaque modification recalculée, un
 * caisson ou une Répartition dont la face n'est plus sur celle de l'autre élément (élargi, déplacé, une cote changée)
 * y est ramené, dans la même annulation que la modification. Les faces sont retrouvées dans le noyau par leurs
 * références ; une liaison dont l'élément n'existe plus est retirée.
 */
import { bodyLabel } from "../document/operations";
import { extendable } from "../document/extend-element";
import { followLink, linkBodies, withoutLinks, type FacePlane } from "../document/extend-reach";
import type { CadDocument, ExtendLink, Vec3 } from "../document/types";
import type { GeometryClient } from "../geometry/client";
import type { FaceOutline, OutlineEdge } from "../geometry/protocol";

/** A face as the kernel outlines it: its centre, normal and corners. */
export function planeOf(outline: FaceOutline): FacePlane {
  const corners = (e: OutlineEdge): Vec3[] => (e.kind === "line" ? [e.a, e.b] : e.kind === "arc" ? [e.a, e.b, e.mid] : [e.center]);
  return { point: [...outline.center] as Vec3, normal: [...outline.normal] as Vec3, points: outline.edges.flatMap(corners).map((p) => [...p] as Vec3) };
}

interface Host {
  doc(): CadDocument;
  /** A tool's preview is shown: the bodies in the kernel are not the document's. */
  previewing(): boolean;
  geometry(): GeometryClient;
  /** In place of the last undo step. */
  amend(doc: CadDocument): Promise<void>;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** Chains (a cabinet kept on one kept on a wall) settle in a few passes. */
const PASSES = 3;

export class ExtendFollower {
  private busy = false;

  constructor(private readonly host: Host) {}

  /** After a modification is recalculated: the kept elements put back on their faces. */
  async after(): Promise<void> {
    if (this.busy || this.host.previewing() || !this.host.doc().extendLinks?.length) return;
    this.busy = true;
    try {
      for (let pass = 0; pass < PASSES; pass++) {
        const next = await this.settle(this.host.doc());
        if (!next) return;
        await this.host.amend(next);
      }
    } finally {
      this.busy = false;
    }
  }

  /** The document with every link applied once (null: nothing to do). */
  private async settle(doc: CadDocument): Promise<CadDocument | null> {
    let next = doc;
    const gone: string[] = [];
    const said: string[] = [];
    for (const link of doc.extendLinks ?? []) {
      const bodies = linkBodies(next, link);
      if (!bodies) {
        gone.push(link.id);
        continue;
      }
      const faces = await this.faces(link, bodies);
      if (!faces) continue;
      const made = followLink(next, link, faces.from, faces.to);
      const name = extendable(next, bodies.from)?.name ?? bodyLabel(next, bodies.from);
      if (made === null) continue;
      if (typeof made === "string") {
        said.push(`« ${name} » ne peut plus suivre « ${bodyLabel(next, bodies.to)} » : ${made}`);
        continue;
      }
      next = made.doc;
      said.push(`« ${name} » suit « ${bodyLabel(next, bodies.to)} » (${made.by > 0 ? "+" : "−"}${Math.abs(made.by)} mm).`);
    }
    if (gone.length) next = withoutLinks(next, gone);
    if (said.length) this.host.notify(said.join(" "), "info");
    return next === doc ? null : next;
  }

  /** The two faces of a link, as the kernel finds them now; null when one is not found (left for later). */
  private async faces(link: ExtendLink, bodies: { from: string; to: string }): Promise<{ from: FacePlane; to: FacePlane } | null> {
    try {
      const [from, to] = await Promise.all([this.host.geometry().refOutline(bodies.from, link.from.face), this.host.geometry().refOutline(bodies.to, link.to.face)]);
      return from.surface === "PLANE" && to.surface === "PLANE" ? { from: planeOf(from), to: planeOf(to) } : null;
    } catch {
      return null;
    }
  }
}
