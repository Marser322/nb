// Script one-off: recorta public/logo.png con una máscara circular para dejar
// alfa transparente fuera del aro del logo (el original tiene fondo negro sólido).
// El círculo fue detectado analizando brillo de píxeles: centro ~(548, 422),
// radio ~385px sobre una imagen de 995x871. Se deja ~2px de margen hacia adentro
// para no incluir artefactos de antialiasing del fondo negro original.
//
// Uso: node scripts/make-logo-transparent.mjs
// Requiere `sharp` (devDependency).

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SRC = path.join(root, "public", "logo.png");

// Centro y radio del círculo detectados por escaneo de brillo (ver briefs/FASE_15).
const CENTER = { x: 548, y: 422 };
const RADIUS = 385;

async function makeCircularMask(width, height, cx, cy, r) {
  // Fondo transparente (sin <rect>) + círculo blanco opaco: con blend "dest-in"
  // sharp usa el canal alfa de esta máscara, así que solo el círculo debe ser opaco.
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function run() {
  const meta = await sharp(SRC).metadata();
  const { width, height } = meta;

  const mask = await makeCircularMask(width, height, CENTER.x, CENTER.y, RADIUS);

  const masked = await sharp(SRC)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Full-size transparent circular logo, recortado al bounding box del círculo.
  const left = Math.max(0, Math.round(CENTER.x - RADIUS));
  const top = Math.max(0, Math.round(CENTER.y - RADIUS));
  const cropSize = RADIUS * 2;

  const fullOut = path.join(root, "public", "logo-transparent.png");
  await sharp(masked)
    .extract({ left, top, width: cropSize, height: cropSize })
    .png()
    .toFile(fullOut);
  console.log("Generado:", fullOut, `(${cropSize}x${cropSize})`);

  const smallOut = path.join(root, "public", "logo-transparent-512.png");
  await sharp(fullOut).resize(512, 512).png().toFile(smallOut);
  console.log("Generado:", smallOut, "(512x512)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
