#!/usr/bin/env node
/**
 * Phase 0 — Lanceur Lighthouse reproductible.
 *
 * Produire un chiffre AVANT/APRÈS comparable, sans configuration manuelle:
 * Lighthouse est piloté par son API Node (chrome-launcher), donc sans dépendance
 * au shell ni aux guillemets Windows. Prérequis (une seule fois) : `npm i -D lighthouse`.
 *
 *   node scripts/audit.mjs --url=https://mon-projet.web.app       # site en ligne
 *   node scripts/audit.mjs --local                                # build + preview locaux
 *   node scripts/audit.mjs --local --form=both                    # mobile + desktop
 *   node scripts/audit.mjs --url=... --wait=6000                  # laisse le temps aux données Firebase
 *   node scripts/audit.mjs --local --label="phase0-avant"
 *
 * Résultat: audits/lh-<horodatage>-<form>.report.{json,html} + une section
 * ajoutée dans PERF_BASELINE.md (métriques, poids, gaspillages repérés).
 *
 * LIMITE À CONNAÎTRE: sans cookie de session, Lighthouse n'atteint que les pages
 * publiques (accueil, CGV, confidentialité, connexion). Les pages métier
 * (Dashboard/Mission) nécessitent un login: c'est le badge `?diag=1` qui les mesure.
 */

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const REPO = resolve(FRONTEND, '..');
const OUT_DIR = resolve(FRONTEND, 'audits');
const BASELINE = resolve(REPO, 'PERF_BASELINE.md');

const args = process.argv.slice(2);
// Dernier drapeau gagnant : `npm run audit:local -- --form=mobile` doit pouvoir
// écraser le --form=both déjà porté par le script npm (`find` prenait le premier).
const argOf = (name, fallback) => {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i].startsWith(`--${name}=`)) return args[i].slice(name.length + 3);
  }
  return fallback;
};

const FORM = argOf('form', 'mobile');
const FORMS = FORM === 'both' ? ['mobile', 'desktop'] : [FORM];
const WAIT_MS = Number(argOf('wait', '3000'));
const PREVIEW_PORT = Number(argOf('port', '4173'));
const LABEL = argOf('label', '');

const METRIC_AUDITS = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['speed-index', 'Speed Index'],
  ['interactive', 'TTI'],
  ['total-blocking-time', 'Total Blocking Time'],
  ['cumulative-layout-shift', 'CLS'],
];

const WASTE_AUDITS = [
  ['render-blocking-resources', 'Ressources bloquant le rendu'],
  ['unused-javascript', 'JavaScript inutilisé'],
  ['unused-css-rules', 'CSS inutilisé'],
  ['modern-image-formats', 'Images en format moderne'],
  ['offscreen-images', 'Images hors écran'],
  ['uses-rel-preconnect', 'Preconnect manquants'],
  ['font-display', 'Chargement des polices'],
  ['uses-text-compression', 'Compression absente'],
  ['uses-responsive-images', 'Images sur-dimensionnées'],
  ['third-party-summary', 'Tiers'],
];

const kb = (bytes) => Math.round(bytes / 1024) + ' Ko';
const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' Mo';

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) ?? null;
}

async function waitFor(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function buildAndPreview() {
  console.log('› build de production…');
  const build = spawnSync('npm.cmd run build', { cwd: FRONTEND, shell: true, encoding: 'utf8', maxBuffer: 32e6 });
  const out = (build.stdout ?? '') + (build.stderr ?? '');
  if (build.status !== 0) {
    console.error(out.slice(-4000));
    throw new Error('Le build a échoué.');
  }
  const sizes = [...out.matchAll(/dist\/\S+\.(?:js|css)\s+\|\s+[\d.,]+\s\w+/g)].map((m) => m[0]);
  if (sizes.length) console.log('  principaux assets:\n    ' + sizes.slice(-14).join('\n    '));

  console.log(`› vite preview (port ${PREVIEW_PORT})…`);
  // On démarre le binaire vite directement (pas via npm.cmd) : sur Windows, tuer
  // le wrapper npm laissait le serveur vite orphelin sur le port 4173.
  const viteBin = resolve(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(PREVIEW_PORT), '--strictPort'],
    { cwd: FRONTEND, stdio: 'ignore', windowsHide: true },
  );
  const stop = () => {
    if (child.exitCode === null) child.kill('SIGTERM');
  };
  process.on('exit', stop);
  process.on('SIGINT', () => {
    stop();
    process.exit(130);
  });
  return { child, url: `http://localhost:${PREVIEW_PORT}/`, stop };
}

/** Charge Lighthouse + chrome-launcher, avec un message d'aide explicite. */
async function loadLighthouse() {
  try {
    const lh = await import('lighthouse');
    const cl = await import('chrome-launcher');
    if (!lh.default || typeof cl.launch !== 'function') throw new Error('imports partiels');
    return {
      lighthouse: lh.default,
      launch: cl.launch,
      getChromePath: cl.getChromePath,
      defaultConfig: lh.defaultConfig,
      desktopConfig: lh.desktopConfig,
    };
  } catch {
    throw new Error(
      'Lighthouse est introuvable dans le projet. Installe-le une fois :  npm i -D lighthouse',
    );
  }
}

async function runLighthouse(url, form, stamp) {
  const { lighthouse, launch, getChromePath, defaultConfig, desktopConfig } = await loadLighthouse();
  const jsonPath = resolve(OUT_DIR, `lh-${stamp}-${form}.report.json`);
  const htmlPath = resolve(OUT_DIR, `lh-${stamp}-${form}.report.html`);
  let chromePath = findChrome();
  if (!chromePath) {
    try {
      chromePath = getChromePath();
    } catch {
      /* chrome-launcher n'a pas trouvé non plus */
    }
  }
  if (!chromePath) throw new Error("Chrome/Edge introuvable. Renseigne CHROME_PATH=<chemin de l'exécutable>.");

  // defaultConfig = profil mobile officiel (4G simulé, 412x823, CPU x4)
  // desktopConfig = profil bureau officiel (10 Mb/s, 1350x940, CPU x1)
  const base = form === 'desktop' ? desktopConfig : defaultConfig;
  const config = { ...base, settings: { ...base.settings, onlyCategories: ['performance'] } };

  console.log(`› lighthouse (${form}) sur ${url} — ~1 min…`);
  const chrome = await launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars'],
  });
  try {
    const res = await lighthouse(url, {
      port: chrome.port,
      output: 'html',
      maxWaitForLoad: WAIT_MS + 25000,
      logLevel: 'error',
    }, config);
    if (!res?.lhr) throw new Error('Rapport Lighthouse vide.');
    writeFileSync(jsonPath, JSON.stringify(res.lhr), 'utf8');
    // L'API Node ne rend PAS l'écriture par `outputPath` (réservé au CLI) :
    // sans cette ligne, aucun rapport HTML n'était produit malgré le message affiché.
    if (typeof res.report === 'string' && res.report.length) writeFileSync(htmlPath, res.report, 'utf8');
    return res.lhr;
  } finally {
    // chrome-launcher : kill() est synchrone (LaunchedChrome.kill: () => void)
    try {
      chrome.kill();
    } catch {
      /* déjà fermé */
    }
  }
}

function extract(report, form, url) {
  const a = report.audits ?? {};
  const metrics = {};
  for (const [id, label] of METRIC_AUDITS) {
    const audit = a[id];
    if (audit && typeof audit.numericValue === 'number') {
      metrics[label] = { value: audit.numericValue, display: audit.displayValue ?? String(Math.round(audit.numericValue)) };
    }
  }

  const waste = [];
  for (const [id, label] of WASTE_AUDITS) {
    const audit = a[id];
    if (!audit || audit.scoreDisplayMode === 'notApplicable') continue;
    const items = audit.details?.items ?? [];
    if (!items.length) continue;
    const savedBytes = items.reduce((s, it) => s + (typeof it.wastedBytes === 'number' ? it.wastedBytes : 0), 0);
    waste.push({
      label,
      count: items.length,
      saving: audit.details?.overallSavingsMs ? `${Math.round(audit.details.overallSavingsMs)} ms` : savedBytes ? kb(savedBytes) : '',
      detail: items
        .slice(0, 2)
        .map((it) => String(it.url ?? it.reason ?? it.source ?? '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 52))
        .filter(Boolean)
        .join(' · '),
    });
  }

  // Lighthouse >= v10 : les lignes sont { label, requestCount, transferSize } (avant : { type })
  const typeOf = (it) => it.label ?? it.type ?? '?';
  const summaryItems = a['resource-summary']?.details?.items ?? [];
  const weights = summaryItems
    .filter((it) => !/^total$/i.test(typeOf(it)))
    .map((it) => ({ type: typeOf(it), requests: it.requestCount, bytes: it.transferSize }));
  const total = summaryItems.find((it) => /^total$/i.test(typeOf(it))) ?? { requestCount: 0, transferSize: 0 };

  const biggest = (a['network-requests']?.details?.items ?? [])
    .filter((r) => typeof r.transferSize === 'number' && r.transferSize > 30000)
    .sort((x, y) => y.transferSize - x.transferSize)
    .slice(0, 8)
    .map((r) => ({ url: String(r.url ?? '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), bytes: r.transferSize }));

  return {
    form,
    url,
    score: Math.round((report.categories?.performance?.score ?? 0) * 100),
    metrics,
    waste,
    weights,
    totalRequests: total.requestCount,
    totalBytes: total.transferSize,
    biggest,
  };
}

function toMarkdown(runs, stamp) {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const L = ['', '---', ''];
  L.push(`## Mesure ${LABEL ? `\`${LABEL}\` — ` : ''}${stamp} (${when})`, '');
  for (const r of runs) {
    L.push(`### ${r.form} — score ${r.score}/100 · ${r.url}`, '');
    L.push('| Métrique | Valeur |', '| --- | --- |');
    for (const [label, m] of Object.entries(r.metrics)) L.push(`| ${label} | ${m.display} |`);
    L.push(`| **Requêtes** | **${r.totalRequests}** |`, `| **Poids transféré** | **${mb(r.totalBytes)}** |`, '');

    if (r.weights.length) {
      L.push('<details><summary>Poids par type de ressource</summary>', '');
      L.push('| Type | Requêtes | Transféré |', '| --- | --- | --- |');
      for (const w of r.weights) L.push(`| ${w.type} | ${w.requests} | ${kb(w.bytes)} |`);
      L.push('', '</details>', '');
    }
    if (r.biggest.length) {
      L.push('<details><summary>Plus grosses réponses (&gt;30 Ko)</summary>', '');
      L.push('| Ressource | Transféré |', '| --- | --- |');
      for (const b of r.biggest) L.push(`| ${b.url} | ${kb(b.bytes)} |`);
      L.push('', '</details>', '');
    }
    if (r.waste.length) {
      L.push('**Gaspillages repérés par Lighthouse**', '');
      L.push('| Audit | Occurrences | Économie estimée | Exemples |', '| --- | --- | --- | --- |');
      for (const w of r.waste) L.push(`| ${w.label} | ${w.count} | ${w.saving || '–'} | ${w.detail || '–'} |`);
      L.push('');
    }
  }
  L.push(`> Rapports HTML complets: \`Frontend/audits/lh-${stamp}-*.report.html\``, '');
  return L.join('\n');
}

async function main() {
  const urlArg = argOf('url');
  mkdirSync(OUT_DIR, { recursive: true });

  let preview = null;
  let target = urlArg;
  if (!target) {
    if (!args.includes('--local')) {
      console.log(
        'Usage: node scripts/audit.mjs --url=<adresse>   ou   node scripts/audit.mjs --local [--form=both]\n' +
          'Options: --wait=<ms> --label=<nom> --port=<port> --form=mobile|desktop|both',
      );
      process.exit(1);
    }
    preview = buildAndPreview();
    const up = await waitFor(preview.url);
    if (!up) {
      preview.stop();
      throw new Error('vite preview ne répond pas sur ' + preview.url);
    }
    target = preview.url;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runs = [];
  try {
    for (const form of FORMS) runs.push(extract(await runLighthouse(target, form, stamp), form, target));
  } finally {
    preview?.stop();
  }

  const md = toMarkdown(runs, stamp);
  appendFileSync(BASELINE, md, 'utf8');
  console.log('\n' + md);
  console.log(`\n✓ ajouté dans ${BASELINE}`);
  console.log('  Pour les pages métier (login requis), complète avec window.__diag.copy() et window.__probe.');
}

main().catch((e) => {
  console.error('\n✗ ' + e.message);
  process.exit(1);
});
