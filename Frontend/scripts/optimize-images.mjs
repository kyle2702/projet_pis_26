/**
 * Optimisation des images statiques (public/) — voir PERF_BASELINE.md 3.2.
 *
 *   npm run optimize:images
 *
 * Deux problèmes corrigés ici, sans toucher au rendu:
 *   - pionniers.png fait 780x780 pour 173 Ko, alors que le manifest déclarait
 *     192x192 et 512x512: Chrome téléchargeait donc 173 Ko pour une icône.
 *     -> génère pionniers-192.png et pionniers-512.png (dimensions réelles).
 *   - pis.png fait 1022x212 pour 62 Ko alors qu'il est affiché à 64 px de haut
 *     (48/40 px en mobile). Lighthouse le classait « image sur-dimensionnée ».
 *     -> génère pis.webp à 128 px de haut (2x l'affichage = net sur Retina).
 *
 * La source haute résolution du logo n'est plus servie par le site: elle est
 * rangée dans assets-src/ (non déployé). Seule la variante pis.png reste dans
 * public/, parce qu'elle sert de repli dans le <picture> du Header.
 *
 * Le redimensionnement est fait par Chrome headless via le DevTools Protocol,
 * comme scripts/runtime-probe.mjs: aucune dépendance supplémentaire.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from 'chrome-launcher';

const PUBLIC = new URL('../public/', import.meta.url);
const ASSETS_SRC = new URL('../assets-src/', import.meta.url);
const spec = (file) => fileURLToPath(new URL(file, PUBLIC));

/** Source: assets-src/ de préférence, public/ en secours (ex: le repli pis.png). */
const readSource = (file) => {
  const fromAssets = fileURLToPath(new URL(file, ASSETS_SRC));
  return readFileSync(existsSync(fromAssets) ? fromAssets : spec(file));
};

/** Image source (PNG) -> variantes à écrire, avec leurs dimensions cibles. */
const JOBS = [
  { name: 'pionniers-192.png', from: 'pionniers.png', width: 192, height: 192, mimeType: 'image/png' },
  { name: 'pionniers-512.png', from: 'pionniers.png', width: 512, height: 512, mimeType: 'image/png' },
  // 1022x212 -> hauteur 128 px, largeur proportionnelle.
  { name: 'pis.webp', from: 'pis.png', width: Math.round((1022 * 128) / 212), height: 128, mimeType: 'image/webp', quality: 0.92 },
];

const inputs = JOBS.map((job) => ({
  ...job,
  base64: readSource(job.from).toString('base64'),
}));

let chrome;
let ws;
try {
  chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const target = await (await fetch(`http://127.0.0.1:${chrome.port}/json/new?about:blank`, { method: 'PUT' })).json();

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
      else p.res(msg.result);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');

  const expression = `(async () => {
    const specs = ${JSON.stringify(inputs)};
    const out = [];
    for (const s of specs) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + s.base64;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s.width, s.height);
      out.push({ name: s.name, dataUrl: canvas.toDataURL(s.mimeType, s.quality) });
    }
    return JSON.stringify(out);
  })()`;

  const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const results = JSON.parse(evaluated.result.value);

  for (const r of results) {
    const base64 = r.dataUrl.slice(r.dataUrl.indexOf(',') + 1);
    const buf = Buffer.from(base64, 'base64');
    writeFileSync(spec(r.name), buf);
    process.stdout.write(`✓ public/${r.name} — ${(buf.length / 1024).toFixed(1)} Ko\n`);
  }
} catch (e) {
  process.stderr.write(`ECHEC: ${e?.message ?? e}\n`);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {
    /* noop */
  }
  try {
    if (chrome) await chrome.kill();
  } catch {
    /* noop */
  }
}
