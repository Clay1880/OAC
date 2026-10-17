// Cuts the JavaGem Figma assets out of the exported panels into public/figma.
// Run once: `node scripts/cut-figma-assets.mjs <dir-with-img_raw1.png-and-ast_raw1.png>`.
// - Photos: the six coffee photos from the "Images" panel, as square JPEGs.
// - Icons: the Iconly 3.0 line icons from the "Assets" panel, turned into black-on-transparent PNG
//   masks so the app can colour them with CSS (see src/components/Icon.tsx).
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/cut-figma-assets.mjs <dir>");
const out = fileURLToPath(new URL("../public/figma/", import.meta.url));
await mkdir(out + "photos", { recursive: true });
await mkdir(out + "icons", { recursive: true });

// Panels are 2666x1980; coordinates below are in that space (4/3 of the 2000px preview).
const K = 4 / 3;
const px = (v) => Math.round(v * K);

// Photos: [name, left, top, width, height] in preview pixels.
const PHOTOS = [
  ["p1", 198, 681, 300, 300],
  ["p2", 558, 681, 300, 300],
  ["p3", 918, 681, 300, 300],
  ["p4", 1278, 681, 300, 300],
  ["p5", 198, 1041, 300, 300],
  ["p6", 558, 1041, 200, 300],
];
for (const [name, l, t, w, h] of PHOTOS) {
  await sharp(`${src}/img_raw1.png`)
    .extract({ left: px(l), top: px(t), width: px(w), height: px(h) })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toFile(`${out}photos/${name}.jpg`);
}

// Icons: [name, centreX, centreY] in preview pixels; each is cut as a 64px-square preview window.
const ICONS = [
  ["search", 264, 747], ["home", 360, 747], ["bell", 456, 747], ["up", 552, 747], ["heart", 648, 747], ["bag", 744, 747], ["more", 840, 747],
  ["filter", 264, 843], ["call", 360, 843], ["discount", 456, 843], ["down", 552, 843], ["left", 648, 843], ["right", 744, 843], ["star", 840, 843],
  ["plus", 564, 1148], ["minus", 660, 1148], ["locate", 879, 1148],
];
const HALF = 34;
for (const [name, cx, cy] of ICONS) {
  const { data, info } = await sharp(`${src}/ast_raw1.png`)
    .extract({ left: px(cx - HALF), top: px(cy - HALF), width: px(HALF * 2), height: px(HALF * 2) })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Ink darkness becomes opacity: black line on the panel colour -> opaque black line on transparent.
  // The panel is off-white, so measure against its own colour (the corner pixel) to leave no tint.
  const bg = data[0];
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i += 1) {
    rgba[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(((bg - data[i]) / bg) * 255 * 1.05)));
  }
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(96, 96)
    .png()
    .toFile(`${out}icons/${name}.png`);
}
console.log(`wrote ${PHOTOS.length} photos and ${ICONS.length} icons to public/figma`);
