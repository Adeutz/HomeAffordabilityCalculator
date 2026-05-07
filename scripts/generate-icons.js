// Generates PNG icons for the PWA from the SVG in /public/favicon.svg.
// PWAs need PNG icons (especially for iOS) for the install prompt and home-screen icon.
// Run with: npm run icons (also runs automatically before npm run build).

import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const outDir = path.join(root, 'public', 'icons');

async function main() {
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
  const svg = await readFile(svgPath);

  const sizes = [192, 512];
  for (const size of sizes) {
    const out = path.join(outDir, `icon-${size}.png`);
    const buf = await sharp(svg).resize(size, size).png().toBuffer();
    await writeFile(out, buf);
    console.log(`  Wrote ${out}`);
  }

  // Apple touch icon (iOS uses 180x180)
  const apple = await sharp(svg).resize(180, 180).png().toBuffer();
  await writeFile(path.join(root, 'public', 'apple-touch-icon.png'), apple);
  console.log('  Wrote public/apple-touch-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
