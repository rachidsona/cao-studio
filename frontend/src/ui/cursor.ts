/**
 * The cursor of the 3D view: a small cross of very thin lines (one pixel, a dark halo so it reads on any body), its
 * centre on the point that is clicked. The system crosshair stays as the fallback.
 */
const svg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='17' height='17' viewBox='0 0 17 17'>" +
  "<g stroke='rgba(0,0,0,0.55)' stroke-width='3'><path d='M8.5 1v5M8.5 11v5M1 8.5h5M11 8.5h5'/></g>" +
  "<g stroke='white' stroke-width='1'><path d='M8.5 1v5M8.5 11v5M1 8.5h5M11 8.5h5'/></g>" +
  "</svg>";

export const THIN_CROSSHAIR = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 8, crosshair`;
