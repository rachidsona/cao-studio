"""Des GLB pour les tests : un en-tête glTF 2.0 juste, un bloc JSON (avec `extra` pour les distinguer)."""
import json
import struct


def glb(extra: dict | None = None, tag: str = "") -> bytes:
    gltf = {"asset": {"version": "2.0", "generator": f"tests{tag}"}, **(extra or {})}
    chunk = json.dumps(gltf).encode()
    chunk += b" " * (-len(chunk) % 4)
    return b"glTF" + struct.pack("<II", 2, 12 + 8 + len(chunk)) + struct.pack("<II", len(chunk), 0x4E4F534A) + chunk
