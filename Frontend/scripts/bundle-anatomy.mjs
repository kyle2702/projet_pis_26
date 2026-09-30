#!/usr/bin/env node
/**
 * Phase 0/3 — Anatomie du bundle, SANS dépendance (rollup-plugin-visualizer non requis).
 *
 * Répond à deux questions qu'on ne peut pas trancher en lisant `vite build`:
 *   1. Quels paquets occupent réellement tel chunk? (attribution par sourcemap)
 *   2. Combien le PREMIER RENDU paie-t-il, une fois les imports statiques suivis
 *      depuis index.html? (un chunk "separate" n'est gratuit que s'il est lazy)
 *
 *   npm run build:sourcemap
 *   node scripts/bundle-anatomy.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(FRONTEND, 'dist', 'assets');

const kb = (b) => (b / 1024).toFixed(1).padStart(8) + ' Ko';

/** Décode le champ `mappings` d'une sourcemap et compte les segments par source. */
function segmentsBySource(map) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const counts = new Map();
  let values = [];
  let buf = 0;
  let shift = 0;
  let srcIdx = 0;

  const flush = () => {
    if (values.length >= 2) {
      srcIdx += values[1];
      const key = map.sources?.[srcIdx];
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    values = [];
  };

  for (const ch of String(map.mappings ?? '')) {
    if (ch === ';' || ch === ',') {
      flush();
      buf = 0;
      shift = 0;
      continue;
    }
    const digit = B64.indexOf(ch);
    if (digit < 0) continue;
    buf += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(buf & 1 ? -(buf >> 1) : buf >> 1);
      buf = 0;
      shift = 0;
    }
  }
  flush();
  return counts;
}

/** Nom lisible d'un paquet depuis un chemin de source sourcemappé. */
function ownerOf(source) {
  const norm = source.replace(/\\/g, '/').split('?')[0].split('#')[0];
  const nm = norm.lastIndexOf('node_modules/');
  if (nm === -1) return "(code de l'app) " + (norm.match(/src\/.*$/) ?? [norm])[0];
  const parts = norm.slice(nm + 'node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] || 'node_modules';
}

function chunkGraph() {
  const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
  const html = readFileSync(resolve(FRONTEND, 'dist', 'index.html'), 'utf8');
  const entry = new Set();
  for (const m of html.matchAll(/(?:src|href)="\/assets\/([\w.-]+\.js)"/g)) entry.add(m[1]);

  // Fermeture transitive des imports STATIQUES: c'est ce que le premier rendu télécharge.
  const eager = new Set();
  const queue = [...entry];
  while (queue.length) {
    const f = queue.pop();
    if (!f || eager.has(f)) continue;
    eager.add(f);
    const code = readFileSync(resolve(ASSETS, f), 'utf8').slice(0, 20000);
    for (const m of code.matchAll(/from"\.\/([\w.-]+\.js)"/g)) queue.push(m[1]);
    for (const m of code.matchAll(/import"\.\/([\w.-]+\.js)"/g)) queue.push(m[1]);
  }
  return { files, eager, entry };
}

function main() {
  if (!existsSync(ASSETS)) {
    console.error('dist/ introuvable — lance d\'abord: npm run build:sourcemap');
    process.exit(1);
  }
  const { files, eager, entry } = chunkGraph();
  let totalEager = 0;
  let totalAll = 0;

  console.log('\nCHARGEMENT INITIAL (imports statiques suivis depuis index.html)');
  console.log('chunk'.padEnd(34), 'taille'.padStart(12), 'gzippé'.padStart(12), '  origine');
  for (const f of files.sort((a, b) => statSync(resolve(ASSETS, b)).size - statSync(resolve(ASSETS, a)).size)) {
    const bytes = statSync(resolve(ASSETS, f)).size;
    totalAll += bytes;
    const gz = gzipSync(readFileSync(resolve(ASSETS, f)), { level: 9 }).length;
    const from = entry.has(f) ? 'index.html' : eager.has(f) ? 'import statique de… ' : 'lazy (chargé à la demande)';
    if (eager.has(f)) totalEager += bytes;
    console.log(basename(f).padEnd(34), kb(bytes), kb(gz), '  ' + from);
  }
  console.log('-'.repeat(72));
  console.log('premier rendu:'.padEnd(34), kb(totalEager), '   total produit:'.padEnd(0), kb(totalAll));

  console.log('\nQUI OCCUPE CHAQUE GROS CHUNK (≥ 40 Ko, estimé via sourcemap)');
  for (const f of files) {
    const jsPath = resolve(ASSETS, f);
    const mapPath = jsPath + '.map';
    if (statSync(jsPath).size < 40 * 1024 || !existsSync(mapPath)) continue;
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    const counts = segmentsBySource(map);
    const bytes = statSync(jsPath).size;
    const total = [...counts.values()].reduce((s, v) => s + v, 0) || 1;
    const byOwner = new Map();
    for (const [src, n] of counts) { const owner = ownerOf(src); byOwner.set(owner, (byOwner.get(owner) ?? 0) + n); }
    const rows = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`\n${basename(f)} — ${kb(bytes)}${eager.has(f) ? '  [CHARGÉ AU DÉMARRAGE]' : '  [lazy]'}`);
    for (const [owner, n] of rows) console.log('  ' + kb((n / total) * bytes).trimStart().padStart(10) + '  ' + owner);
  }
  console.log('');
}

main();
