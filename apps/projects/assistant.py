"""Modelling assistant: Claude (Anthropic API) turns a request in plain French into actions on the document.

- POST /api/projects/<uuid>/assistant/  JSON {message, history?: [{role, content}], context: {...}}
  → {reply: str, actions: [...]}   (the editor shows the actions; the user applies them)

The API key stays on the server (``ANTHROPIC_API_KEY``); without it the endpoint answers 503. Claude's answer is
constrained by a JSON schema (structured outputs) to a closed set of actions, which the editor validates again
(frontend/src/document/assistant-actions.ts) before anything changes. Requests are rate-limited per user.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

import anthropic
from django.core.cache import cache
from django.http import JsonResponse

from .api import _get_owned_project
from .http import ApiError, api_view, json_error, read_json_body

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"
MESSAGE_MAX = 4000
HISTORY_MAX = 20
CONTEXT_MAX_BYTES = 60_000
# Requests per user per hour.
RATE_LIMIT = 40
RATE_WINDOW = 3600

# Ids of the material catalogue (frontend/src/document/materials.ts).
MATERIALS = [
    "melamine-white", "melamine-oak", "melamine-walnut", "melamine-anthracite", "mdf",
    "lacquer-white", "birch-plywood", "solid-oak", "hdf",
]

SYSTEM = """Tu es l'assistant de modélisation de CAO Studio, un logiciel de conception de meubles (ébénisterie, \
agencement, cuisines). L'utilisateur, un menuisier ou un agenceur, te demande en français de créer ou modifier son \
modèle. Tu réponds en français, brièvement, et tu proposes des actions que l'éditeur lui montrera avant de les \
appliquer.

Repère et unités : les actions sont en millimètres, Z vers le haut ; dans reply, donne les cotes dans l'unité de \
l'utilisateur (display_unit du contexte : cm le plus souvent), et lis ses cotes dans cette unité s'il n'en précise \
pas. Un caisson a son origine (x, y, z) au coin avant gauche en bas ; il \
s'étend vers +X (largeur), +Y (profondeur, le fond est vers +Y) et +Z (hauteur). Sa face avant regarde −Y ; rotation \
(degrés, autour de la verticale passant par l'origine) : 90 la tourne vers +X, 180 vers +Y, 270 vers −X. La hauteur \
d'un caisson comprend son socle (plinth). Pour poser un caisson à côté d'un autre, ajoute la largeur de l'autre à \
son x.

Repères du métier : bas de cuisine 600 de large, 870 de haut socle de 150 compris, 560 de profondeur ; haut de \
cuisine 700 de haut, 350 de profondeur, posé à 1450 du sol ; colonne 2200 ; penderie 2400 × 600 de profondeur ; \
largeurs du commerce 300, 400, 450, 500, 600, 800, 900. Panneaux de 18 mm, façades de 19 mm.

Actions :
- add_cabinet : un caisson (côtés, dessus, dessous, fond, étagères).
- update_cabinet : changer des cotes ou la position d'un caisson existant ; null garde la valeur actuelle.
- add_fronts : une porte, deux portes ou des tiroirs (1 à 8) sur un caisson.
- add_kitchen : une cuisine entière le long d'un mur (I) ou de deux murs en angle (L) : meubles bas et hauts, \
façades, plan de travail, fileurs et murs. Le mur A part de l'origine vers +X, les meubles devant lui (Y < 0) ; en L, \
le mur B va de l'origine vers −Y. length_b est ignoré en I (mets 0).
- set_material : la matière d'un caisson, de façades (seulement les façades visibles) ou d'un corps extrudé.
- set_parameter : créer ou changer un paramètre nommé (les cotes liées suivent).
- rename, delete : renommer ou supprimer une opération.

Désigne une opération existante par son id ou son nom exact tels qu'ils figurent dans le contexte ; une opération \
créée dans la même réponse se désigne par le nom que tu lui donnes (donne des noms uniques). N'invente jamais d'id. \
Les actions s'appliquent dans l'ordre. Si la demande ne peut pas s'exprimer avec ces actions, ou si elle est \
ambiguë, n'invente rien : explique dans reply ce que l'utilisateur peut faire avec les outils de l'éditeur, ou pose \
une question, avec une liste d'actions vide. Une question sur le métier (cotes, quincaillerie, assemblage) appelle \
une réponse dans reply, sans action."""


def _nullable(kind: str) -> dict[str, Any]:
    return {"type": [kind, "null"]}


def _action(name: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"type": {"const": name}, **properties},
        "required": ["type", *properties],
        "additionalProperties": False,
    }


ROTATION = {"enum": [0, 90, 180, 270]}
NUMBER = {"type": "number"}

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "actions": {
            "type": "array",
            "items": {
                "anyOf": [
                    _action("add_cabinet", {
                        "name": {"type": "string"}, "width": NUMBER, "height": NUMBER, "depth": NUMBER,
                        "shelves": {"type": "integer"}, "plinth": NUMBER, "back": {"enum": ["applied", "inset", "none"]},
                        "x": NUMBER, "y": NUMBER, "z": NUMBER, "rotation": ROTATION,
                    }),
                    _action("update_cabinet", {
                        "ref": {"type": "string"}, "width": _nullable("number"), "height": _nullable("number"),
                        "depth": _nullable("number"), "shelves": _nullable("integer"), "plinth": _nullable("number"),
                        "x": _nullable("number"), "y": _nullable("number"), "z": _nullable("number"),
                        "rotation": {"enum": [0, 90, 180, 270, None]},
                    }),
                    _action("add_fronts", {
                        "cabinet": {"type": "string"}, "layout": {"enum": ["door", "doors", "drawers"]},
                        "drawers": {"type": "integer"}, "mount": {"enum": ["overlay", "inset"]}, "handles": {"type": "boolean"},
                    }),
                    _action("add_kitchen", {
                        "layout": {"enum": ["I", "L"]}, "length_a": NUMBER, "length_b": NUMBER, "base_height": NUMBER,
                        "depth": NUMBER, "fronts": {"enum": ["mixed", "drawers", "doors"]}, "wall_units": {"type": "boolean"},
                        "front_material": {"enum": MATERIALS}, "worktop_material": {"enum": MATERIALS},
                    }),
                    _action("set_material", {"ref": {"type": "string"}, "material": {"enum": MATERIALS}}),
                    _action("set_parameter", {"name": {"type": "string"}, "value": NUMBER}),
                    _action("rename", {"ref": {"type": "string"}, "name": {"type": "string"}}),
                    _action("delete", {"ref": {"type": "string"}}),
                ]
            },
        },
    },
    "required": ["reply", "actions"],
    "additionalProperties": False,
}


def _clean_history(value: Any) -> list[dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ApiError(400, "Historique invalide.")
    turns = []
    for turn in value[-HISTORY_MAX:]:
        if (
            not isinstance(turn, dict)
            or turn.get("role") not in ("user", "assistant")
            or not isinstance(turn.get("content"), str)
            or not turn["content"].strip()
        ):
            raise ApiError(400, "Historique invalide.", ["Chaque tour : {role: user|assistant, content: texte}."])
        turns.append({"role": turn["role"], "content": turn["content"][:MESSAGE_MAX]})
    # The conversation starts with the user.
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    return turns


def ask_claude(messages: list[dict[str, Any]], client: anthropic.Anthropic | None = None) -> dict[str, Any]:
    """One request to Claude; the reply and actions, or ApiError."""
    client = client or anthropic.Anthropic(max_retries=2, timeout=120.0)
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        cache_control={"type": "ephemeral"},
        system=SYSTEM,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=messages,
    )
    if response.stop_reason == "refusal":
        raise ApiError(422, "L'assistant ne peut pas répondre à cette demande. Reformulez-la autrement.")
    if response.stop_reason == "max_tokens":
        raise ApiError(502, "La réponse de l'assistant a été coupée : demandez moins de choses à la fois.")
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        data = json.loads(text)
    except ValueError:
        raise ApiError(502, "Réponse de l'assistant illisible. Réessayez.") from None
    return {"reply": str(data.get("reply", "")), "actions": list(data.get("actions", []))}


@api_view(("POST",))
def assistant(request, project_id):
    _get_owned_project(request, project_id)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return json_error(503, "L'assistant n'est pas configuré : définissez la variable d'environnement ANTHROPIC_API_KEY sur le serveur.")
    data = read_json_body(request)
    if not isinstance(data, dict):
        raise ApiError(400, "Requête invalide.")
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ApiError(400, "Message vide.")
    if len(message) > MESSAGE_MAX:
        raise ApiError(400, "Message trop long.", [f"{MESSAGE_MAX} caractères au plus."])
    context = data.get("context") or {}
    if not isinstance(context, dict):
        raise ApiError(400, "Contexte invalide.")
    context_text = json.dumps(context, ensure_ascii=False, separators=(",", ":"))
    if len(context_text.encode()) > CONTEXT_MAX_BYTES:
        raise ApiError(400, "Modèle trop grand pour l'assistant.", ["Le résumé du modèle dépasse 60 ko."])
    history = _clean_history(data.get("history"))

    key = f"assistant:{request.user.pk}"
    count = cache.get(key, 0)
    if count >= RATE_LIMIT:
        return json_error(429, "Beaucoup de demandes à l'assistant en peu de temps : réessayez dans un moment.")
    cache.set(key, count + 1, RATE_WINDOW)

    messages = [
        *history,
        {"role": "user", "content": f"<modele>\n{context_text}\n</modele>\n\n{message.strip()}"},
    ]
    try:
        answer = ask_claude(messages)
    except ApiError as exc:
        return exc.response()
    except anthropic.AuthenticationError:
        logger.error("Assistant: clé API Anthropic refusée.")
        return json_error(502, "La clé API Anthropic du serveur est refusée.")
    except anthropic.RateLimitError:
        return json_error(429, "Le service Claude est saturé pour ce compte : réessayez dans un moment.")
    except anthropic.APIStatusError as exc:
        logger.warning("Assistant: erreur de l'API Anthropic %s (%s)", exc.status_code, getattr(exc, "request_id", ""))
        return json_error(502, "Le service Claude a répondu une erreur. Réessayez.")
    except anthropic.APIConnectionError:
        return json_error(502, "Le service Claude est injoignable. Réessayez.")
    return JsonResponse(answer)
