/**
 * La bande et la 3D se montrent le même meuble : survoler un meuble de la bande du linéaire ouvert éclaire son caisson
 * et ses façades dans la 3D ; survoler un caisson du linéaire dans la 3D cerne son meuble sur la bande.
 */
import { pieceItemOf, runCabinets } from "../../document/kitchen-plan-add";
import { bodyOrigin } from "../../document/operations";
import { featureOfBody } from "../../document/types";
import type { Viewport } from "../../viewport/viewport";
import { cabinetBodies } from "../cabinet-drag";
import type { Editor } from "../editor";
import { kitchenRunOpen } from "./kitchen-plan-tool";

const GLOW = "drop-shadow(0 0 6px rgb(14 165 233))";

export function bindStripHover(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  // From the strip to the 3D: the bodies of the unit under the pointer, lit as a hover.
  let lit = false;
  root.addEventListener("pointerover", (event) => {
    const item = event.target instanceof Element ? event.target.closest<SVGElement>("[data-run-strip] [data-item]")?.dataset.item : undefined;
    const open = kitchenRunOpen();
    const cabinets = item && open ? runCabinets(editor.doc, open.plan, open.run).filter((c) => c.item === item) : [];
    const bodies = cabinets.flatMap((c) => cabinetBodies(editor.doc, viewport.displayedBodies, c.cabinet));
    if (!bodies.length && !lit) return;
    viewport.setHoverHighlight(bodies.length ? { bodies } : null);
    lit = bodies.length > 0;
  });

  // From the 3D to the strip: the unit of the body under the pointer, ringed on the strip of its run.
  let ringed: SVGElement | null = null;
  let frame = 0;
  const ring = (node: SVGElement | null) => {
    if (node === ringed) return;
    if (ringed) ringed.style.filter = "";
    if (node) node.style.filter = GLOW;
    ringed = node;
  };
  const canvas = viewport.renderer.domElement;
  canvas.addEventListener("pointermove", (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const open = kitchenRunOpen();
      const target = open && event.buttons === 0 ? viewport.hoverTarget(event) : null;
      const owner = target?.kind === "body" ? pieceItemOf(editor.doc, featureOfBody(bodyOrigin(editor.doc, target.id))) : null;
      const strip = owner?.item && owner.plan === open?.plan ? root.querySelector(`[data-run-strip="${CSS.escape(owner.run)}"]`) : null;
      ring(strip?.querySelector<SVGElement>(`[data-item="${CSS.escape(owner!.item!)}"]`) ?? null);
    });
  });
  canvas.addEventListener("pointerleave", () => (cancelAnimationFrame(frame), ring(null)));
}
