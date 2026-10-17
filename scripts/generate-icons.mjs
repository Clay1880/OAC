// Renders the PWA icons from one plate-and-cutlery glyph (the same motif as the empty states).
// Run with `node scripts/generate-icons.mjs`; the PNGs in public/icons are committed.
// Uses `sharp`, which Next.js already installs for image optimisation.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BRAND = "#c67c4e";
const PAPER = "#ffffff";
const out = fileURLToPath(new URL("../public/icons/", import.meta.url));

// Glyph drawn in a 48x48 box, centred on (24, 24).
const glyph = `
  <g fill="none" stroke="${PAPER}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="24" r="11" />
    <circle cx="24" cy="24" r="6" opacity="0.45" />
    <path d="M6 10v10a3 3 0 0 0 3 3M9 10v14M12 10v10a3 3 0 0 1-3 3M9 24v14" />
    <path d="M42 38V10c-3 2-4 6-4 11v3h4" />
  </g>`;

/** `glyphScale` is how much of the canvas the 48-unit glyph box fills; `radius` rounds the tile. */
const icon = (size, glyphScale, radius) => {
  const box = size * glyphScale;
  const offset = (size - box) / 2;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}" />
      <g transform="translate(${offset} ${offset}) scale(${box / 48})">${glyph}</g>
    </svg>`);
};

const files = [
  ["icon-192.png", 192, 0.72, 192 * 0.22],
  ["icon-512.png", 512, 0.72, 512 * 0.22],
  // Maskable: full bleed, glyph inside the central 80% "safe zone" so no launcher crop clips it.
  ["icon-maskable-512.png", 512, 0.56, 0],
  ["apple-touch-icon.png", 180, 0.72, 0],
];

await mkdir(out, { recursive: true });
for (const [name, size, glyphScale, radius] of files) {
  await sharp(icon(size, glyphScale, radius)).png().toFile(out + name);
  console.log(`wrote public/icons/${name}`);
}
