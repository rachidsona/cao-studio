/** QR codes as SVG (labels, client links); the text is sent as UTF-8 (the library takes one byte per character). */
import qrcode from "qrcode-generator";

export function qrSvg(text: string, cellSize = 2): string {
  const qr = qrcode(0, "M");
  qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 0, scalable: true });
}
