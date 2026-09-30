/**
 * Garde-fou de la chaîne de styles (Tailwind v4 + CSS maison).
 *
 *   npm run build && npm run check:css
 *
 * Tailwind v4 ne lit plus `tailwind.config.js` et ne génère QUE les classes
 * qu'il retrouve dans les sources: si un import, un `@source` ou la syntaxe de
 * `src/index.css` casse, le build reste vert et les utilitaires disparaissent
 * silencieusement du CSS compilé (le site « marche » mais perd ses styles).
 *
 * Ce script contrôle la sortie `dist/` déjà produite:
 *
 *   1. chaque classe utilitaire utilisée dans `src/` existe bien dans le CSS
 *      compilé (les classes maison type `home-*` ne sont pas concernées);
 *   2. aucune référence tierce à Google Fonts n'a survécu dans `dist/`;
 *   3. `index.html` pointe bien vers les polices auto-hébergées;
 *   4. `src/index.css` n'est pas retombé en directives v3 (`@tailwind …`).
 *
 * Portée du contrôle 1: `FAMILLES` ci-dessous liste les familles d'utilitaires
 * reconnues. L'étendre quand une nouvelle famille arrive dans le code (sinon
 * elle n'est tout simplement pas vérifiée).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FRONTEND = join(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DIST = join(FRONTEND, 'dist');
const SRC = join(FRONTEND, 'src');

const COLOR =
  'black|white|current|transparent|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}';
const LEN = '(?:[0-9.]+(?:px|rem|em|%|vw|vh)?|px|auto|full|screen|fit|min|max)';

/** Chaque chaîne = une famille d'utilitaires reconnue par le contrôle. */
const FAMILLES = [
  `[wmhp]-(?:${LEN}|[0-9]+/[0-9]+)`,
  `(?:max|min)-(?:w|h)-(?:${LEN}|none|fit-content|screen-(?:sm|md|lg|xl|2xl))`,
  `(?:m|p)[xytrbl]?-(?:${LEN})`,
  `(?:m|p)[xytrbl]`,
  `gap(?:-[xy])?-(?:[0-9.]+|px|auto)`,
  `space-[xy]-(?:[0-9.]+|px|reverse)`,
  `divide-[xy]?-[0-9.]+`,
  `flex(?:-(?:1|auto|initial|none|row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap))?`,
  `grid(?:-(?:cols|rows|flow|col|row))?(?:-[0-9]+)?`,
  `inline(?:-block|-flex|-grid|-table|-flow)?`,
  `table(?:-(?:auto|fixed|inline))?(?:-(?:row|column|cell|group|caption))?(?:-caption)?`,
  `(?:contents|block|hidden)`,
  `items-(?:start|end|center|baseline|stretch)`,
  `justify-(?:start|end|center|between|around|evenly|baseline)`,
  `content-(?:start|end|center|between|around|evenly|baseline|stretch|normal)`,
  `self-(?:auto|start|end|center|stretch|baseline)`,
  `place-(?:items|content|self)-(?:start|end|center|baseline|stretch|around|between|evenly)`,
  `order-(?:first|last|none|[0-9]+)`,
  `(?:row|col)-(?:auto|span-[0-9]+|start-[0-9]+|end-[0-9]+)`,
  `text-(?:xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|start|end|top|middle|bottom|ellipsis|clip|wrap|nowrap|balance|pretty|uppercase|lowercase|capitalize|italic|not-italic|underline|line-through|no-underline|shadow|current|inherit|${COLOR}|[0-9.]+(?:px|rem|em|%)?)`,
  `font-(?:sans|serif|mono|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)`,
  `leading-[a-z0-9.]+`,
  `tracking-[a-z0-9.]+`,
  `whitespace-[a-z-]+`,
  `break-(?:words|normal|all|keep)`,
  `(?:truncate|antialiased|sr-only|not-sr-only)`,
  `bg-(?:${COLOR}|transparent)`,
  `rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|[0-9]+))?(?:-(?:t|b|l|r|tl|tr|bl|br))?(?:-[a-z0-9]+)?`,
  `border(?:-[xytrbl])?(?:-[0-9])?(?:-(?:t|b|l|r))?(?:-(?:${COLOR}))?`,
  `shadow(?:-(?:sm|md|lg|xl|2xl|inner|none))?`,
  `ring(?:-(?:[0-9]|inset|${COLOR}))?`,
  `opacity-[0-9]+`,
  `outline-(?:none|offset-[0-9]+|[0-9])`,
  `transition(?:-(?:none|all|colors|opacity|shadow|transform|translate|scale|rotate))?`,
  `duration-[0-9]+`,
  `delay-[0-9]+`,
  `ease-(?:linear|in|out|in-out)`,
  `animate-[a-z-]+`,
  `(?:scale|rotate|translate)-(?:x|y)?-(?:[0-9.]+|full|left|right|top|bottom)`,
  `transform(?:-(?:gpu|none))?`,
  `z-(?:[0-9]+|auto)`,
  `(?:inset|top|left|right|bottom)(?:-[xy])?-(?:[0-9.]+(?:px|rem|em|%)?|full|auto)`,
  `(?:absolute|relative|fixed|sticky)`,
  `overflow-(?:auto|hidden|visible|scroll|clip|x|y)`,
  `object-(?:contain|cover|fill|none|scale-down|top|center|bottom|left|right)`,
  `(?:cursor|pointer-events|select|appearance|fill|stroke)-[a-z-]+`,
  `resize(?:-(?:x|y))?`,
  `aspect-(?:auto|square|video)`,
  `list-(?:none|disc|decimal|inside|outside|image-none)`,
  `(?:grow|shrink|grow-0|shrink-0)`,
  `basis-(?:${LEN})`,
];

/** Variante éventuelle (`md:`, `hover:`) puis `!` éventuel, tolérés.
 *  Liste fermée et volontaire: sans elle, une déclaration CSS du type
 *  `position:fixed` écrite dans un .tsx passerait pour une classe utilitaire. */
const VARIANTES =
  '(?:(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|max-2xl|hover|focus|focus-visible|focus-within|active|visited|disabled|group-hover|group-focus|peer-checked|first|last|odd|even|dark|print|rtl|ltr|motion-safe|motion-reduce|supports-\\[[^\\]]+\\]):)*';
const UTIL = new RegExp(`^${VARIANTES}!?(?:${FAMILLES.join('|')})$`);

const errors = [];
const notes = [];

if (!existsSync(DIST)) {
  console.error('ECHEC: dist/ introuvable — lancer `npm run build` avant ce contrôle.');
  process.exit(1);
}

/* ---------- 1. classes utilitaires de src/ présentes dans le CSS compilé ---------- */

const distCss = readdirSync(join(DIST, 'assets'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(DIST, 'assets', f), 'utf8'));

if (distCss.length === 0) errors.push('aucun CSS compilé dans dist/assets/');

const srcFiles = readdirSync(SRC, { recursive: true })
  .map(String)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));

const candidates = new Set();
for (const rel of srcFiles) {
  let text = readFileSync(join(SRC, rel), 'utf8');
  // commentaires retirés; les `//` de URLs sont préservés (« : » avant)
  text = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
  for (const m of text.matchAll(/`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g)) {
    for (const raw of m[0].slice(1, -1).split(/[\s${}]+/)) {
      const token = raw.trim();
      if (token && UTIL.test(token)) candidates.add(token);
    }
  }
}

if (candidates.size === 0) {
  errors.push('aucune classe utilitaire détectée dans src/: le scan a probablement cassé');
} else {
  notes.push(`${candidates.size} classes utilitaires repérées dans src/`);
}

const escapeSelector = (t) => '.' + t.replace(/([!:./])/g, '\\$1');
for (const token of [...candidates].sort()) {
  if (!distCss.some((css) => css.includes(escapeSelector(token)))) {
    errors.push(`classe utilisée mais absente du CSS compilé: ${token}`);
  }
}

/* ---------- 2. plus aucune dépendance à Google Fonts dans dist/ ---------- */

const SKIP = /\.(png|jpe?g|gif|webp|avif|woff2?|ttf|otf|svg|ico|map)$/;
for (const rel of readdirSync(DIST, { recursive: true }).map(String)) {
  const file = join(DIST, rel);
  if (SKIP.test(rel) || !existsSync(file) || !statSync(file).isFile()) continue;
  if (/fonts\.(googleapis|gstatic)\.com/.test(readFileSync(file, 'utf8'))) {
    errors.push(`référence Google Fonts résiduelle: ${rel}`);
  }
}

/* ---------- 3. polices auto-hébergées effectivement référencées ---------- */

const html = existsSync(join(DIST, 'index.html')) ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';
if (!html.includes('/fonts/fonts.css')) errors.push('dist/index.html ne référence pas /fonts/fonts.css');
if (html.includes('fonts.googleapis.com')) errors.push('dist/index.html référence encore fonts.googleapis.com');

const fontCssPath = join(DIST, 'fonts', 'fonts.css');
if (!existsSync(fontCssPath)) {
  errors.push('dist/fonts/fonts.css manquant (public/fonts non copié ?)');
} else {
  const fontCss = readFileSync(fontCssPath, 'utf8');
  const faces = (fontCss.match(/@font-face/g) ?? []).length;
  if (faces === 0) errors.push('dist/fonts/fonts.css ne contient aucun @font-face');
  else notes.push(`${faces} @font-face dans dist/fonts/fonts.css`);
  if (/url\(\s*https?:\/\//.test(fontCss)) errors.push('fonts.css pointe encore vers des URL distantes');
}

/* ---------- 4. src/index.css en syntaxe Tailwind v4 ---------- */

// Les commentaires peuvent mentionner `@tailwind base` ou `@import url(...)`
// en guise de documentation: on ne contrôle que le CSS effectivement servi.
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/@tailwind\s+(base|components|utilities)/.test(indexCss)) {
  errors.push("src/index.css contient une directive v3 (@tailwind …): Tailwind v4 l'ignore");
}
if (!/tailwindcss/.test(indexCss)) {
  errors.push("src/index.css n'importe plus tailwindcss: aucun utilitaire ne sera généré");
}
if (/@import\s+url\(/.test(indexCss)) {
  errors.push("src/index.css contient un @import url(...) externe (poids + dépendance tierce)");
}

/* ---------- verdict ---------- */

for (const n of notes) console.log(`  · ${n}`);
if (errors.length === 0) {
  console.log('OK: chaîne de styles intacte (utilitaires, polices auto-hébergées, syntaxe v4).');
} else {
  console.error(`\n${errors.length} problème(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exitCode = 1;
}
