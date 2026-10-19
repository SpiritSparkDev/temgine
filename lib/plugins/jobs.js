/**
 * lib/plugins/jobs.js — wiederkehrende Plugin-Jobs (server.js von Plugins: jobs: [{ id, intervalMs, run(ctx) }]).
 *
 * server.js (Kern, CommonJS) kann ESM-Plugin-Code nicht laden. Es ruft deshalb alle 30 s
 * POST /api/plugins/__jobs (Prozess-Secret PLUGIN_CRON_SECRET, wie TNT-/Backup-Timer) auf;
 * runDueJobs() führt dort die fälligen Jobs aktiver Plugins aus. Granularität = 30 s, ein
 * intervalMs unter 30 s wird also effektiv auf den Tick gerundet (Minimum 10 s im Manifest-Check).
 * Zustand (letzter Lauf, laufende Jobs) liegt in global → pro Prozess ein Lauf je Job, nie parallel.
 */
import { getActivePlugins, makePluginCtx } from './registry';

export const MIN_INTERVAL_MS = 10000;
const state = (global.__pluginJobs = global.__pluginJobs || { last: new Map(), running: new Set() });

export function _resetJobState() {
  state.last.clear();
  state.running.clear();
}

// Führt fällige Jobs aus und wartet auf sie. Liefert die Schlüssel "<plugin>:<job>" der gestarteten Jobs.
export async function runDueJobs(now = Date.now()) {
  const started = [];
  for (const plugin of await getActivePlugins()) {
    for (const job of Array.isArray(plugin.server.jobs) ? plugin.server.jobs : []) {
      const key = `${plugin.id}:${job && job.id}`;
      if (!job || !job.id || typeof job.run !== 'function' || !(job.intervalMs >= MIN_INTERVAL_MS)) {
        if (!state.running.has(`bad:${key}`)) console.warn(`[plugin:${plugin.id}] ungültiger Job ${key} (id, run, intervalMs >= ${MIN_INTERVAL_MS} nötig) — ignoriert`);
        state.running.add(`bad:${key}`);
        continue;
      }
      const last = state.last.get(key);
      if (state.running.has(key) || (last !== undefined && now - last < job.intervalMs)) continue;
      state.last.set(key, now);
      state.running.add(key);
      started.push(key);
      try {
        await job.run(await makePluginCtx(plugin));
      } catch (e) {
        console.error(`[plugin:${plugin.id}] Job ${job.id} fehlgeschlagen:`, e?.message);
      } finally {
        state.running.delete(key);
      }
    }
  }
  return started;
}
