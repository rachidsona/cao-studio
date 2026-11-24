/** Toutes les fiches de l'aide, dans l'ordre du sommaire : l'écran d'abord, puis le métier, puis le dessin et l'atelier. */
import { CURIC } from "./curic";
import { SCREEN } from "./interface";
import { MODELING } from "./modeling";
import { SKETCH } from "./sketch";
import type { HelpFamily } from "./types";
import { WOODWORKING } from "./woodworking";
import { WORKSHOP } from "./workshop";

export const HELP_FAMILIES: HelpFamily[] = [...SCREEN, ...WOODWORKING, ...MODELING, ...SKETCH, ...CURIC, ...WORKSHOP];
