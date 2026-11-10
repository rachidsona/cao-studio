"""La forme d'un modèle GLB envoyé pour un lien client, avant de le garder et de le servir au public.

Le GLB est montré au client anonyme par Three.js (GLTFLoader), qui suivrait une adresse écrite dans le modèle
(``images[].uri``, ``buffers[].uri``) : le navigateur du client irait chercher une ressource ailleurs, et dirait son
adresse IP à qui l'a posée. Un GLB fait par l'éditeur (GLTFExporter, binaire) n'en a aucune : tout est dans le fichier.
On lit donc l'en-tête et le bloc JSON (audit de sécurité du 10/11/2026, L4).
"""
from __future__ import annotations

import json
import struct

JSON_CHUNK = 0x4E4F534A  # « JSON », little-endian
MAX_JSON_CHUNK = 4 * 1024 * 1024


def glb_problem(data: bytes) -> str | None:
    """What is wrong with this GLB (to end « Le modèle … »), or None."""
    if len(data) < 20 or data[:4] != b"glTF":
        return "doit être un fichier glTF binaire (GLB)."
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2:
        return "doit être un GLB de version 2."
    if length != len(data):
        return "est tronqué ou mal formé (sa longueur annoncée n'est pas la sienne)."
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != JSON_CHUNK or chunk_length > MAX_JSON_CHUNK or 20 + chunk_length > len(data):
        return "est mal formé (son bloc JSON)."
    try:
        gltf = json.loads(data[20 : 20 + chunk_length].decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return "est mal formé (son bloc JSON est illisible)."
    if not isinstance(gltf, dict):
        return "est mal formé (son bloc JSON n'est pas un objet)."
    for key in ("images", "buffers"):
        items = gltf.get(key) or []
        if not isinstance(items, list):
            return f"est mal formé (« {key} »)."
        for item in items:
            uri = item.get("uri") if isinstance(item, dict) else None
            if isinstance(uri, str) and not uri.startswith("data:"):
                return f"ne doit charger aucune ressource extérieure (une adresse dans « {key} »)."
    return None
