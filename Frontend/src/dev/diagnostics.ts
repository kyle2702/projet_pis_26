/**
 * Phase 0 — Sonde de mesure des performances.
 *
 * Objectif: chiffrer l'AVANT avant toute optimisation, sans modifier la logique
 * métier. La sonde observe l'application de l'extérieur:
 *   - Web Vitals natifs (FCP / LCP / CLS / INP / TTFB) via PerformanceObserver
 *   - requêtes réseau vers Firebase (auth, firestore) => prouve les cascades de requêtes
 *   - "long tasks" => preuve des gels d'interface (re-renders, parsing, Firestore)
 *   - poids réel des ressources (JS / CSS / images / polices)
 *   - abonnements Firestore actifs (via l'espion du JobsService) => preuve du N+1 et des fuites
 *
 * Activation: automatique en dev, ou `?diag=1` (persistant), ou `?diag=badge` pour
 * un badge visible sur mobile. Désactivée sinon: aucun observateur n'est créé.
 *
 * NOTE: `esbuild.drop: ['console']` retire les console.* du build de prod
 * (voir vite.config.ts). C'est pourquoi le badge DOM reste la sortie principale
 * et que les données sont aussi exposées sur `window.__diag`.
 */

type Phase = { name: string; t: number; detail?: string };

type RpcStat = {
  count: number;
  transferBytes: number;
  firstStart: number | null;
  lastEnd: number | null;
};

type WebVitals = {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
};

type LongTasks = { count: number; totalMs: number; longestMs: number };

type WeightByType = Record<string, { count: number; bytes: number }>;

export type DiagSummary = {
  url: string;
  nowMs: number;
  vitals: WebVitals;
  longTasks: LongTasks;
  routes: Array<{ from: string; to: string; at: number; paintedInMs: number | null }>;
  phases: Phase[];
  rpc: Record<string, RpcStat>;
  firestoreRpcTotal: number;
  firestoreBytes: number;
  firstFirestoreRpcAt: number | null;
  firstAuthRpcAt: number | null;
  weight: { total: WeightByType; biggest: Array<{ name: string; type: string; bytes: number }> };
  firestoreListeners: { active: number; created: number; released: number; samples: Array<{ at: number; active: number }> };
};

const ENABLE_KEY = 'scout:diag';

let enabled = false;
let vitals: WebVitals = { ttfb: null, fcp: null, lcp: null, cls: null, inp: null };
let longTasks: LongTasks = { count: 0, totalMs: 0, longestMs: 0 };
const phases: Phase[] = [];
const routes: DiagSummary['routes'] = [];
const rpc: Record<string, RpcStat> = {};
const weight: WeightByType = {};
const biggest: Array<{ name: string; type: string; bytes: number }> = [];
const listenerSamples: Array<{ at: number; active: number }> = [];
const listenerStats = { active: 0, created: 0, released: 0 };

let currentRoute = typeof location !== 'undefined' ? location.pathname : '/';
let lcpValue: number | null = null;
let inpValue = 0;

function classifyResource(entry: PerformanceResourceTiming): string {
  const name = entry.name;
  if (/firestore\.googleapis\.com/.test(name)) {
    if (/Listen/i.test(name)) return 'firestore:Listen';
    if (/RunAggregationQuery/i.test(name)) return 'firestore:Aggregate';
    if (/RunQuery/i.test(name)) return 'firestore:RunQuery';
    if (/BatchGet|Commit/i.test(name)) return 'firestore:Write';
    return 'firestore:autre';
  }
  if (/identitytoolkit\.googleapis\.com/.test(name)) return 'auth:identitytoolkit';
  if (/securetoken\.googleapis\.com/.test(name)) return 'auth:token';
  if (/(google-analytics|googletagmanager|analytics)/.test(name)) return 'analytics';
  if (/fonts\.(googleapis|gstatic)\.com/.test(name)) return 'polices';
  switch (entry.initiatorType) {
    case 'script': return 'javascript';
    case 'css': case 'link': return 'css';
    case 'img': case 'image': return 'images';
    case 'xmlhttprequest': case 'fetch': return 'fetch-divers';
    default: return entry.initiatorType || 'autre';
  }
}

function observeResources(): void {
  // Le PerformanceObserver `buffered: true` rejoue les entrées déjà lues via
  // getEntriesByType : sans ce garde-fou, chaque ressource est comptée deux fois
  // (poids et nombre de requêtes doublés, liste « plus grosses réponses » dupliquée).
  const seen = new Set<string>();
  const record = (entry: PerformanceResourceTiming) => {
    const key = `${entry.name}@${Math.round(entry.startTime)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const kind = classifyResource(entry);
    const bytes = entry.transferSize || entry.encodedBodySize || 0;
    const start = entry.startTime;
    const end = entry.responseEnd || entry.startTime + entry.duration;

    const bucket = rpc[kind] ?? (rpc[kind] = { count: 0, transferBytes: 0, firstStart: null, lastEnd: null });
    bucket.count += 1;
    bucket.transferBytes += bytes;
    if (bucket.firstStart === null || start < bucket.firstStart) bucket.firstStart = start;
    if (bucket.lastEnd === null || end > bucket.lastEnd) bucket.lastEnd = end;

    const w = weight[kind] ?? (weight[kind] = { count: 0, bytes: 0 });
    w.count += 1;
    w.bytes += bytes;

    if (bytes > 50_000) {
      biggest.push({ name: shortName(entry.name), type: kind, bytes });
      biggest.sort((a, b) => b.bytes - a.bytes);
      biggest.length = Math.min(biggest.length, 12);
    }
  };

  // Les entrées déjà existantes (le module est importé tôt mais pas garanti).
  performance.getEntriesByType('resource').forEach((e) => record(e as PerformanceResourceTiming));

  const po = new PerformanceObserver((list) => list.getEntries().forEach((e) => record(e as PerformanceResourceTiming)));
  po.observe({ type: 'resource', buffered: true });
}

function shortName(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 46 ? '…' + u.pathname.slice(-44) : u.pathname;
    return u.hostname.replace(/\.(googleapis|google|gstatic)\.com$/, '.$1') + path;
  } catch {
    return url.slice(0, 60);
  }
}

/* ------------------------------------------------------------------ Web Vitals */

let clsSessionValue = 0;
let clsSessionStart = 0;
let clsLastTime = 0;
let clsBest = 0;

function observeVitals(): void {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (nav) vitals.ttfb = Math.round(nav.responseStart);

  const paintPo = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.name === 'first-contentful-paint') vitals.fcp = Math.round(e.startTime);
    }
  });
  paintPo.observe({ type: 'paint', buffered: true } as PerformanceObserverInit);

  const lcpPo = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last) {
      lcpValue = Math.round(last.startTime);
      vitals.lcp = lcpValue;
    }
  });
  lcpPo.observe({ type: 'largest-contentful-paint', buffered: true } as PerformanceObserverInit);

  // CLS "session window" (fenêtre de 1s, nouvelle fenêtre si trou > 500ms) — algo W3C.
  const clsPo = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
      if (entry.hadRecentInput || typeof entry.value !== 'number') continue;
      if (entry.startTime - clsSessionStart > 1000 || entry.startTime - clsLastTime > 500) {
        clsSessionValue = 0;
        clsSessionStart = entry.startTime;
      }
      clsSessionValue += entry.value;
      clsLastTime = entry.startTime;
      if (clsSessionValue > clsBest) {
        clsBest = clsSessionValue;
        vitals.cls = Number(clsBest.toFixed(4));
      }
    }
  });
  clsPo.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);

  // INP = pire temps de traitement d'un évènement observé.
  const inpPo = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      if (entry.duration > inpValue) {
        inpValue = entry.duration;
        vitals.inp = Math.round(inpValue);
      }
    }
  });
  inpPo.observe({ type: 'event', durationThreshold: 40, buffered: true } as PerformanceObserverInit);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && lcpValue !== null) vitals.lcp = lcpValue;
  });
}

/* --------------------------------------------------------------- Long tasks */

function observeLongTasks(): void {
  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks.count += 1;
      longTasks.totalMs += entry.duration;
      if (entry.duration > longTasks.longestMs) longTasks.longestMs = Math.round(entry.duration);
    }
  });
  po.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
}

/* ----------------------------------------------------- Navigation entre pages */

type RouteMark = DiagSummary['routes'][number];

function observeRoutes(): void {
  const patch = (method: 'pushState' | 'replaceState') => {
    const original = history[method] as History[typeof method] & ((...a: unknown[]) => void);
    const wrapped = (...args: unknown[]) => {
      const raw = String(args[2] ?? location.pathname);
      const to = raw.split('?')[0];
      if (to !== currentRoute) {
        mark('route:' + to);
        const entry: RouteMark = { from: currentRoute, to, at: Math.round(performance.now()), paintedInMs: null };
        routes.push(entry);
        currentRoute = to;
        timeToNextPaint(entry);
      }
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    history[method] = wrapped as History[typeof method];
  };
  patch('pushState');
  patch('replaceState');

  window.addEventListener('popstate', () => {
    const to = location.pathname;
    if (to !== currentRoute) {
      const entry: RouteMark = { from: currentRoute, to, at: Math.round(performance.now()), paintedInMs: null };
      routes.push(entry);
      currentRoute = to;
      timeToNextPaint(entry);
    }
  });
}

/** Temps mis par le navigateur pour repeindre après un changement de route. */
function timeToNextPaint(route: RouteMark): void {
  let best = Number.POSITIVE_INFINITY;
  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.startTime >= route.at) best = Math.min(best, e.startTime - route.at);
    }
  });
  try {
    po.observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  } catch {
    po.disconnect();
    return;
  }
  setTimeout(() => {
    if (route.paintedInMs === null) {
      route.paintedInMs = Number.isFinite(best) ? Math.round(best) : 0;
    }
    po.disconnect();
  }, 2500);
}

/* ---------------------------------------------------- Abonnements Firestore */

/** Compteur alimenté par src/dev/jobsListenerProbe.ts (espion du JobsService). */
export function recordListenerDelta(delta: 1 | -1): void {
  listenerStats.active += delta;
  if (delta > 0) listenerStats.created += 1;
  else listenerStats.released += 1;
}

export function mark(name: string, detail?: string): void {
  if (!enabled) return;
  phases.push({ name, t: Math.round(performance.now()), detail });
}

/* ---------------------------------------------------------------- Rapportage */

const kb = (bytes: number) => Math.round(bytes / 1024);

function fmtKb(bytes: number): string {
  return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(2) + ' Mo' : kb(bytes) + ' Ko';
}

function summarize(): DiagSummary {
  let firestoreRpcTotal = 0;
  let firestoreBytes = 0;
  let firstFirestoreRpcAt: number | null = null;
  let firstAuthRpcAt: number | null = null;

  for (const [kind, stat] of Object.entries(rpc)) {
    if (kind.startsWith('firestore:')) {
      firestoreRpcTotal += stat.count;
      firestoreBytes += stat.transferBytes;
      if (stat.firstStart !== null && (firstFirestoreRpcAt === null || stat.firstStart < firstFirestoreRpcAt)) {
        firstFirestoreRpcAt = Math.round(stat.firstStart);
      }
    }
    if (kind.startsWith('auth:') && stat.firstStart !== null && (firstAuthRpcAt === null || stat.firstStart < firstAuthRpcAt)) {
      firstAuthRpcAt = Math.round(stat.firstStart);
    }
  }

  return {
    url: location.pathname,
    nowMs: Math.round(performance.now()),
    vitals: { ...vitals },
    longTasks: { ...longTasks, totalMs: Math.round(longTasks.totalMs) },
    routes: routes.map((r) => ({ ...r })),
    phases: [...phases],
    rpc: Object.fromEntries(Object.entries(rpc).map(([k, v]) => [k, { ...v }])),
    firestoreRpcTotal,
    firestoreBytes,
    firstFirestoreRpcAt,
    firstAuthRpcAt,
    weight: {
      total: Object.fromEntries(Object.entries(weight).map(([k, v]) => [k, { ...v }])),
      biggest: biggest.map((b) => ({ ...b })),
    },
    firestoreListeners: { ...listenerStats, samples: listenerSamples.map((s) => ({ ...s })) },
  };
}

function renderBadge(): string {
  const s = summarize();
  const v = s.vitals;
  return [
    `FCP ${v.fcp ?? '–'}ms · LCP ${v.lcp ?? '–'}ms`,
    `INP ${v.inp ?? '–'}ms · CLS ${v.cls ?? '–'}`,
    `gels: ${s.longTasks.count} (${s.longTasks.totalMs}ms, max ${s.longTasks.longestMs}ms)`,
    `Firestore: ${s.firestoreRpcTotal} req · ${fmtKb(s.firestoreBytes)}`,
    `abonnements actifs: ${s.firestoreListeners.active} (créés ${s.firestoreListeners.created})`,
    `1ʳᵉ req auth: ${s.firstAuthRpcAt ?? '–'}ms · 1ʳᵉ req Firestore: ${s.firstFirestoreRpcAt ?? '–'}ms`,
  ].join('\n');
}

let badgeEl: HTMLDivElement | null = null;

function mountBadge(): void {
  badgeEl = document.createElement('div');
  badgeEl.setAttribute('data-diag-badge', '');
  badgeEl.style.cssText = [
    'position:fixed', 'left:8px', 'bottom:8px', 'z-index:2147483647',
    'background:rgba(15,23,42,.92)', 'color:#e2e8f0', 'font:11px/1.5 ui-monospace,Consolas,monospace',
    'padding:8px 10px', 'border-radius:8px', 'max-width:min(92vw,420px)', 'white-space:pre-wrap',
    'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'cursor:pointer',
  ].join(';');
  badgeEl.title = 'Clic = console.table détaillée';
  badgeEl.textContent = renderBadge();
  badgeEl.addEventListener('click', () => {
    const s = summarize();
    console.table(s.rpc);
    console.table(s.weight.total);
    console.table(s.routes);
    console.log('[diag] résumé', s);
  });
  document.body.appendChild(badgeEl);
  setInterval(() => {
    if (badgeEl) badgeEl.textContent = renderBadge();
  }, 1000);
}

/* ---------------------------------------------------------------------- Init */

declare global {
  interface Window {
    __diag: {
      enabled: boolean;
      mark: typeof mark;
      report: () => DiagSummary;
      table: () => void;
      reset: () => void;
      copy: () => string;
    };
  }
}

function readFlag(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('diag');
    if (q === '0') {
      localStorage.removeItem(ENABLE_KEY);
      return false;
    }
    if (q === '1' || q === 'badge') {
      localStorage.setItem(ENABLE_KEY, q);
      return true;
    }
    return localStorage.getItem(ENABLE_KEY) !== null;
  } catch {
    return false;
  }
}

export function initDiagnostics(): void {
  enabled = Boolean(import.meta.env.DEV) || readFlag();
  if (!enabled) return;

  mark('sonde:ready');
  observeResources();
  observeVitals();
  observeLongTasks();
  observeRoutes();

  if (window.localStorage?.getItem(ENABLE_KEY) === 'badge') mountBadge();

  // Espion du JobsService: chargé après le premier rendu pour ne rien perturber.
  setTimeout(() => {
    import('./jobsListenerProbe')
      .then((m) => m.patchJobsService())
      .catch(() => undefined);
  }, 0);

  // Une fuite d'abonnements se voit dans la pente, pas dans un instantané.
  setInterval(() => {
    listenerSamples.push({ at: Math.round(performance.now()), active: listenerStats.active });
    if (listenerSamples.length > 240) listenerSamples.shift();
  }, 5000);

  window.__diag = {
    enabled: true,
    mark,
    report: summarize,
    table: () => {
      const s = summarize();
      console.table(s.rpc);
      console.table(s.weight.total);
      console.table(s.routes);
      console.log('[diag] résumé complet', s);
    },
    reset: () => {
      vitals = { ttfb: null, fcp: null, lcp: null, cls: null, inp: null };
      longTasks = { count: 0, totalMs: 0, longestMs: 0 };
      phases.length = 0;
      routes.length = 0;
      for (const k of Object.keys(rpc)) delete rpc[k];
      for (const k of Object.keys(weight)) delete weight[k];
      biggest.length = 0;
      listenerSamples.length = 0;
      listenerStats.active = listenerStats.created = listenerStats.released = 0;
      mark('sonde:reset');
    },
    copy: () => JSON.stringify(summarize(), null, 2),
  };

  window.addEventListener('beforeunload', () => {
    try {
      sessionStorage.setItem('scout:diag:last', JSON.stringify(summarize()));
    } catch {
      /* quota atteint: ignorer */
    }
  });

  setTimeout(() => {
    const s = summarize();
    console.log('%c[diag] état à +12s', 'font-weight:bold', s);
    console.table(s.rpc);
  }, 12000);
}



