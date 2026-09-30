/**
 * Sonde runtime SANS navigateur (outil de mesure phase 0 — voir PERF_BASELINE.md §1).
 *
 *   npm run probe:runtime
 *
 * Démarre le serveur de dev Vite sur un port dédié, attend qu'il réponde, ouvre la
 * page d'accueil dans Chrome headless avec ?diag=1, lit `window.__diag.report()` et
 * `window.__probe` par le DevTools Protocol (aucune dépendance : Node 22 expose
 * `WebSocket`), puis écrit le résultat dans `Frontend/probe-runtime.json`.
 *
 * Limite assumée : aucune session n'est possible ici, donc seules les pages
 * publiques sont explorées. Les mesures « après connexion » (cascade d'auth,
 * abonnements de la page Missions) restent à relever dans un navigateur avec
 * `?diag=badge`, comme indiqué dans PERF_BASELINE.md §4.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launch } from 'chrome-launcher';

const PORT = 5199;
const PAGE = `http://localhost:${PORT}/?diag=1`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});

async function waitHttp(url, timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* pas encore prêt */
    }
    await sleep(400);
  }
  throw new Error(`Serveur de dev jamais prêt sur ${url}`);
}

let chrome;
let ws;
try {
  await waitHttp(`http://localhost:${PORT}/`);
  chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--enable-precise-memory-info'] });
  const base = `http://127.0.0.1:${chrome.port}`;
  const target = await (await fetch(`${base}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
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
      msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(9000); // chargement + stabilisation (chaîne d'auth incluse)

  const EXPR = `(() => {
    const d = window.__diag && window.__diag.report ? window.__diag.report() : null;
    const p = window.__probe || null;
    if (!d) return JSON.stringify({ erreur: 'sonde absente' });
    return JSON.stringify({
      url: d.url, nowMs: d.nowMs, vitals: d.vitals, longTasks: d.longTasks,
      firestoreRpcTotal: d.firestoreRpcTotal, firestoreBytes: d.firestoreBytes,
      firstFirestoreRpcAt: d.firstFirestoreRpcAt, firstAuthRpcAt: d.firstAuthRpcAt,
      rpc: d.rpc, phases: d.phases, weightTotal: d.weight.total,
      biggest: d.weight.biggest.slice(0, 8),
      listeners: { created: d.firestoreListeners.created, released: d.firestoreListeners.released, active: d.firestoreListeners.active },
      probe: p ? { patched: p.patched, activeListeners: p.activeListeners, calls: p.calls, heapMB: +((p.heapBytes || 0) / 1048576).toFixed(2) } : null,
    });
  })()`;

  const out = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
  const text = out.result.value ?? JSON.stringify(out);
  writeFileSync(new URL('../probe-runtime.json', import.meta.url), String(text), 'utf8');
  process.stderr.write('OK: probe-runtime.json écrit\n');
} catch (e) {
  process.stderr.write(`ECHEC: ${e?.message ?? e}\n`);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  try {
    if (chrome) await chrome.kill();
  } catch {}
  vite.kill('SIGTERM');
  await sleep(500);
  vite.kill('SIGKILL');
}
