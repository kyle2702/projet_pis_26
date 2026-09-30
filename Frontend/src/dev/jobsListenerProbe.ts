/**
 * Phase 0 — Espion du JobsService.
 *
 * Mesure SANS toucher au code métier: on remplace les méthodes sur le prototype
 * du singleton `jobsService` par des jumeaux qui comptent. Cela rend visible ce
 * que la console Firebase met des heures à montrer:
 *
 *   - combien d'abonnements sont CRÉÉS pour afficher la liste des jobs
 *     (c'est la preuve du N+1: ~3 par job, voir useJobs.ts:94-127)
 *   - combien sont LIBÉRÉS (created - active > 0 après navigation = fuite)
 *   - la durée de chaque appel (getDocs/getDoc) et le nombre d'erreurs
 *   - l'évolution du tas JS, seul signal visible des abonnements orphelins
 *     laissés par jobs.service.ts:316-332 (le onSnapshot interne n'est jamais
 *     désabonné, et le SDK Firestore multiplexe tout sur un seul flux réseau:
 *     le compte de requêtes ne le montre donc PAS).
 *
 * N'est chargé que si la sonde est activée (voir diagnostics.ts).
 */

import { jobsService } from '../api/jobs.service';
import { recordListenerDelta } from './diagnostics';

type UnknownFn = (...args: unknown[]) => unknown;

type MethodStat = { calls: number; errors: number; totalMs: number; maxMs: number };

export type ProbeStats = {
  patched: boolean;
  methods: Record<string, MethodStat>;
  activeListeners: number;
  createdListeners: number;
  releasedListeners: number;
  heapBytes: number | null;
  heapSamples: Array<{ at: number; heapBytes: number | null; activeListeners: number }>;
};

/** Méthodes qui retournent une fonction de désabonnement. */
const SUBSCRIBE_METHODS = new Set(['subscribeToJobs', 'subscribeToApplications', 'subscribeToUserApplication']);

const stats: ProbeStats = {
  patched: false,
  methods: {},
  activeListeners: 0,
  createdListeners: 0,
  releasedListeners: 0,
  heapBytes: null,
  heapSamples: [],
};

function stat(name: string): MethodStat {
  return (stats.methods[name] ??= { calls: 0, errors: 0, totalMs: 0, maxMs: 0 });
}

function heap(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? mem.usedJSHeapSize : null;
}

/** Enregistre une durée pour une méthode. */
function record(name: string, durationMs: number, isError = false): void {
  const s = stat(name);
  s.calls += 1;
  s.totalMs += durationMs;
  if (durationMs > s.maxMs) s.maxMs = durationMs;
  if (isError) s.errors += 1;
}

function isThenable(v: unknown): v is Promise<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

export function patchJobsService(): ProbeStats {
  if (stats.patched) return stats;

  const proto = Object.getPrototypeOf(jobsService) as Record<string, unknown>;
  const patched: string[] = [];

  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const original = proto[name];
    if (typeof original !== 'function') continue;
    const fn = original as UnknownFn;

    if (SUBSCRIBE_METHODS.has(name)) {
      proto[name] = function (this: unknown, ...args: unknown[]): unknown {
        stats.createdListeners += 1;
        stats.activeListeners += 1;
        recordListenerDelta(1);
        const startedAt = performance.now();
        const result = fn.apply(this, args) as unknown;
        stat(name).calls += 1;

        if (typeof result !== 'function') {
          // Pas de désabonneurs retourné: l'abonnement ne peut plus être fermé.
          return result;
        }
        const unsub = result as UnknownFn;
        let done = false;
        return (...unsubArgs: unknown[]) => {
          if (!done) {
            done = true;
            stats.activeListeners -= 1;
            stats.releasedListeners += 1;
            recordListenerDelta(-1);
            const s = stat(name + ':durée-vie');
            const life = performance.now() - startedAt;
            s.calls += 1;
            s.totalMs += life;
            if (life > s.maxMs) s.maxMs = life;
          }
          return unsub(...unsubArgs);
        };
      };
      patched.push(name);
      continue;
    }

    proto[name] = function (this: unknown, ...args: unknown[]): unknown {
      const t0 = performance.now();
      let out: unknown;
      try {
        out = fn.apply(this, args);
      } catch (e) {
        record(name, performance.now() - t0, true);
        console.warn(`[probe] ${name} a échoué:`, e);
        throw e;
      }
      if (isThenable(out)) {
        // La durée utile d'un getDocs/getDoc = l'aller-retour Firestore complet.
        return out.then(
          (v) => {
            record(name, performance.now() - t0);
            return v;
          },
          (e: unknown) => {
            record(name, performance.now() - t0, true);
            console.warn(`[probe] ${name} a échoué:`, e);
            throw e;
          },
        );
      }
      record(name, performance.now() - t0);
      return out;
    };
    patched.push(name);
  }

  stats.patched = true;

  // Le tas ne baisse jamais si des listeners restent accrochés: on suit la pente.
  const sample = () => {
    stats.heapBytes = heap();
    stats.heapSamples.push({ at: Math.round(performance.now()), heapBytes: stats.heapBytes, activeListeners: stats.activeListeners });
    if (stats.heapSamples.length > 240) stats.heapSamples.shift();
  };
  sample();
  setInterval(sample, 5000);

  window.__probe = stats;
  console.log(
    `[probe] JobsService espionné (${patched.length} méthodes). ` +
      `window.__probe pour lire les compteurs, window.__diag.report() pour le reste.`,
  );
  return stats;
}

declare global {
  interface Window {
    __probe?: ProbeStats;
  }
}
