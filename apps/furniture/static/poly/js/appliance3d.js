/*
 * The fronts of the ovens and microwaves of the room's 3D view (room_editor.js), drawn as the real thing: a brushed
 * steel frame, a black glass control band with its knobs and display, a smoked glass door with its inner window and
 * a steel bar handle. A built-in one (inside a cabinet: `built_in_item_id`, room.py) shows its front only, a little
 * proud of the cabinet's, and the cabinet's doors open around it (`doorSpans`).
 */
import * as THREE from 'three';

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.32, metalness: 0.85 });
const blackGlass = () => new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.08, metalness: 0.25 });
const smokedGlass = () => new THREE.MeshStandardMaterial({ color: 0x1d252e, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 });

function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A knob on the control band, its axis toward the viewer. */
function knob(x, y, z, radius, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 14, 24), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * The front of an oven or a microwave, `width` × `height`, from z = `front` - 18 to a little in front of `front` (the appliance's local frame: x along its width, y up, z toward the viewer).
 */
export function applianceFront(kind, width, height, front) {
  const group = new THREE.Group();
  const w = Math.max(60, width - 6);
  const h = Math.max(60, height - 6);
  const x0 = (width - w) / 2;
  const y0 = (height - h) / 2;
  const frameDepth = 20;
  // The frame stands 2 mm proud of the cabinet's face (no flicker against it), the glass on the frame.
  const zFrame = front - frameDepth / 2 + 2;
  const zFace = front + 4;
  const metal = steel();
  group.add(box(w, h, frameDepth, metal, x0 + w / 2, y0 + h / 2, zFrame));

  if (kind === 'microwave') {
    // A window on the left, the keys on the right.
    const panelWidth = w * 0.3;
    const doorWidth = w - panelWidth - 12;
    group.add(box(doorWidth, h - 16, 4, blackGlass(), x0 + 6 + doorWidth / 2, y0 + h / 2, zFace));
    group.add(box(doorWidth * 0.78, (h - 16) * 0.66, 3, smokedGlass(), x0 + 6 + doorWidth / 2, y0 + h / 2, zFace + 3));
    group.add(box(panelWidth - 6, h - 16, 4, blackGlass(), x0 + w - panelWidth / 2 - 3, y0 + h / 2, zFace));
    const display = box(panelWidth * 0.6, 22, 2, new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 0.6 }), x0 + w - panelWidth / 2 - 3, y0 + h * 0.72, zFace + 3);
    group.add(display);
    group.add(knob(x0 + w - panelWidth / 2 - 3, y0 + h * 0.38, zFace + 8, Math.min(22, panelWidth * 0.22), metal));
    return group;
  }

  // An oven: the control band at the top, the door below it.
  const band = Math.min(110, h * 0.16);
  const bandY = y0 + h - band / 2 - 4;
  group.add(box(w - 12, band - 6, 4, blackGlass(), x0 + w / 2, bandY, zFace));
  const knobRadius = Math.min(20, band * 0.26);
  [0.12, 0.88].forEach((at) => group.add(knob(x0 + w * at, bandY, zFace + 8, knobRadius, metal)));
  const display = box(Math.min(120, w * 0.22), band * 0.34, 2, new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.55 }), x0 + w / 2, bandY, zFace + 3);
  group.add(display);
  const doorHeight = h - band - 10;
  const doorY = y0 + 3 + doorHeight / 2;
  group.add(box(w - 12, doorHeight, 4, blackGlass(), x0 + w / 2, doorY, zFace));
  // The inner window, where the light of the oven would be.
  group.add(box((w - 12) * 0.74, doorHeight * 0.56, 3, smokedGlass(), x0 + w / 2, doorY - doorHeight * 0.06, zFace + 3));
  // The handle: a steel bar across the top of the door, on two posts.
  const handleY = y0 + 3 + doorHeight - Math.min(40, doorHeight * 0.1);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, w * 0.78, 18), metal);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(x0 + w / 2, handleY, zFace + 34);
  bar.castShadow = true;
  group.add(bar);
  [0.14, 0.86].forEach((at) => group.add(box(14, 14, 32, metal, x0 + w * at, handleY, zFace + 18)));
  return group;
}

/**
 * The heights the doors of a cabinet still take when appliances are built into it: the span of the doors
 * (`from` to `to`, local mm from the cabinet's floor) less the ranges of the appliances (with a joint of `gap`).
 */
export function doorSpans(from, to, ranges, gap = 4) {
  let spans = [[from, to]];
  for (const [low, high] of ranges) {
    spans = spans.flatMap(([a, b]) => {
      if (high <= a || low >= b) return [[a, b]];
      return [[a, low - gap], [high + gap, b]].filter(([x, y]) => y - x >= 60);
    });
  }
  return spans;
}
