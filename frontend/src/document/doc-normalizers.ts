/**
 * What a document passes through before it becomes the project's, at each change (Editor.change): the rules that keep
 * two things in step, in a fixed order, here in the document rather than registered by the screens that use them
 * (audit of 11/11/2026: they depended on which panel was bound first). Each gets the document before the change and the
 * one after.
 *
 * - A cabinet moved, by hand or by the kitchen made again, takes its appliances along — before the plan follows, so the
 *   plan keeps their cut-outs where they went, and again after (document/appliance-follow.ts).
 * - A unit the Plan de cuisine made, changed or deleted in the 3D: the plan follows it, in the same undo
 *   (document/kitchen-sync.ts, kitchen-delete-sync.ts).
 */
import { appliancesFollow } from "./appliance-follow";
import { withDeletedFreed } from "./kitchen-delete-sync";
import { syncKitchenPlans } from "./kitchen-sync";
import type { CadDocument } from "./types";

type Normalizer = (prev: CadDocument, next: CadDocument) => CadDocument;

const NORMALIZERS: readonly Normalizer[] = [
  (prev, next) => appliancesFollow(prev, next),
  (prev, next) => syncKitchenPlans(prev, withDeletedFreed(prev, next)),
  (prev, next) => appliancesFollow(prev, next, false),
];

export function normalizeDoc(prev: CadDocument, next: CadDocument): CadDocument {
  return NORMALIZERS.reduce((doc, f) => f(prev, doc), next);
}
