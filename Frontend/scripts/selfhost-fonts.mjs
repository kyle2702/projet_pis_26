/**
 * Auto-hébergement des polices Google — voir PERF_BASELINE.md 1.4 / 3.3.
 *
 *   npm run selfhost:fonts
 *
 * Avant: index.css faisait un `@import url('https://fonts.googleapis.com/...')`,
 * donc le navigateur ne découvrait la feuille de polices qu'APRÈS avoir téléchargé
 * et analysé le CSS de l'app (2 connexions tierces de plus, en série, avant le
 * premier texte) — Lighthouse le classait « ressource bloquant le rendu ».
 *
 * Maintenant: les .woff2 sont servis depuis /fonts (même origine, même connexion
 * HTTP/2 que le reste), avec la feuille @font-face copiée telle quelle depuis
 * Google (mêmes familles, graisses, unicode-range et font-display: swap), donc
 * un rendu strictement identique.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

try {
  await main();
} catch (e) {
  console.error('ECHEC:', e?.stack ?? e);
  process.exitCode = 1;
}

async function main() {
  const FONTS_DIR = new URL('../public/fonts/', import.meta.url);
  const CSS_OUT = new URL('fonts.css', FONTS_DIR);

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const CSS_URL =
    'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap';

  const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts: HTTP ${res.status}`);
  const remoteCss = await res.text();

  mkdirSync(FONTS_DIR, { recursive: true });

  // Tous les sous-ensembles (latin, latin-ext, cyrillic...) sont conservés: c'est
  // l'unicode-range de chaque @font-face qui décide, exactement comme chez Google.
  const urls = [...new Set(remoteCss.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) ?? [])];
  let css = remoteCss;

  for (const url of urls) {
    const name = basename(url);
    const fontRes = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!fontRes.ok) throw new Error(`${url}: HTTP ${fontRes.status}`);
    const buf = Buffer.from(await fontRes.arrayBuffer());
    writeFileSync(new URL(name, FONTS_DIR), buf);
    css = css.replaceAll(url, `/fonts/${name}`);
    console.log(`  ${name} — ${(buf.length / 1024).toFixed(1)} Ko`);
  }

  const header = `/* Généré par scripts/selfhost-fonts.mjs — ne pas éditer à la main.
   Copie conforme de la feuille Google Fonts (Manrope 400..800, Sora 600..800),
   avec les URL pointant vers /fonts/ (auto-hébergé). */\n\n`;
  writeFileSync(CSS_OUT, header + css, 'utf8');
  console.log(`OK: public/fonts/fonts.css (${urls.length} fichiers woff2)`);
}
