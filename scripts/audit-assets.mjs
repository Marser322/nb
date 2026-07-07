import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const scannedRoots = ["src", "supabase/migrations"];
const fileExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
]);
const assetPattern = /\/(?:images\/|logo|icon|apple-icon|favicon|og-image)[^'"`\s)\]}>,]*(?:\.png|\.jpe?g|\.webp|\.avif|\.svg|\.gif|\.ico)/gi;

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      entries.push(...walk(fullPath));
    } else if (fileExtensions.has(fullPath.slice(fullPath.lastIndexOf(".")))) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const missing = [];
const ogRefs = [];

for (const base of scannedRoots) {
  const absBase = resolve(root, base);
  if (!existsSync(absBase)) continue;

  for (const file of walk(absBase)) {
    const source = readFileSync(file, "utf8");
    const rel = relative(root, file);

    if (source.includes("/og-image.png")) {
      ogRefs.push(rel);
    }

    for (const match of source.matchAll(assetPattern)) {
      const assetPath = match[0];
      if (assetPath.includes("%") || assetPath.includes("*") || assetPath.includes("<")) {
        continue;
      }

      const publicPath = resolve(root, "public", assetPath.replace(/^\//, ""));
      if (!existsSync(publicPath)) {
        missing.push({ file: rel, asset: assetPath });
      }
    }
  }
}

if (missing.length > 0 || ogRefs.length > 0) {
  if (missing.length > 0) {
    console.error("Rutas locales de assets faltantes:");
    for (const item of missing) {
      console.error(`- ${item.file}: ${item.asset}`);
    }
  }

  if (ogRefs.length > 0) {
    console.error("Referencias activas a /og-image.png:");
    for (const file of ogRefs) {
      console.error(`- ${file}`);
    }
  }

  process.exit(1);
}

console.log("Assets auditados: cero rutas locales faltantes y cero referencias activas a /og-image.png.");
