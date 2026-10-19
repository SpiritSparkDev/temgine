// Plugin "Anfrage-Weiterleitung an TNT Manager": Kontaktformular-Hooks, Outbox-Job, Admin-Routen.
// Spezifikation und Abnahmekriterien: docs/specs/. Personendaten stehen nur im verschlüsselten Outbox-Payload.
import { isChecked, processOutbox, cleanupOutbox, retryFailed } from './lib';
import { getForwardingPlan, forwardSubmission, getRuntime, buildView, applyUpdate, testConnection } from './config';

const ADMIN = ['ADMIN'];

// Nur Metadaten, nie Inhalte (kein payload, kein lastError-Freitext).
const LIST_SELECT = { id: true, formId: true, status: true, attempts: true, nextAttemptAt: true, lastStatusCode: true, createdAt: true, deliveredAt: true };

// Antworten enthalten nie Token (nur Maske) oder Personendaten.
const admin = (fn) => ({
  auth: ADMIN,
  handler: async (req, res, ctx) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      return await fn(req, res, ctx);
    } catch {
      return res.status(500).json({ error: 'Interner Fehler' });
    }
  },
});

export default {
  routes: {
    'GET config': admin(async (req, res, ctx) => res.status(200).json(await buildView(ctx))),
    'PUT config': admin(async (req, res, ctx) => {
      const r = await applyUpdate(ctx, req.body);
      if (r.errors) return res.status(422).json({ error: 'Ungültige Eingabe', fields: r.errors });
      return res.status(200).json(r.view);
    }),
    'POST test': admin(async (req, res, ctx) => {
      try {
        return res.status(200).json(await testConnection(ctx));
      } catch {
        return res.status(200).json({ ok: false, status: null, hint: 'Verbindungstest fehlgeschlagen.' });
      }
    }),
    'GET outbox': admin(async (req, res, ctx) => {
      const limit = Math.min(Math.max(parseInt(ctx.query.limit, 10) || 50, 1), 200);
      return res.status(200).json(await ctx.prisma.inquiryOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: LIST_SELECT }));
    }),
    'POST outbox/retry': admin(async (req, res, ctx) => {
      const ok = typeof req.body?.id === 'string' && (await retryFailed(ctx.prisma, req.body.id));
      if (!ok) return res.status(409).json({ error: 'Nur fehlgeschlagene Absendungen mit vorhandenem Inhalt können erneut gesendet werden.' });
      return res.status(200).json({ ok: true });
    }),
  },

  hooks: {
    // Datenschutz-Pflicht, bevor Mail/Speichern passiert. Nur für zugeordnete Formulare.
    // Kein eigenes IP-Limit: hinter einem Proxy/Docker sehen alle Besucher gleich aus; Spam-Schutz = Altcha, Honeypot und das Limit des Kontaktformulars im Kern.
    beforeContactSubmission: async (ctx, { formId, values }) => {
      const plan = await getForwardingPlan(ctx, formId);
      if (!plan) return { ok: true };
      const { privacyField } = plan.mapping;
      if (!isChecked(values?.[privacyField])) {
        return { ok: false, status: 400, errors: { [privacyField]: 'Bitte stimme der Datenschutzerklärung zu.' } };
      }
      return { ok: true };
    },
    // Outbox schreiben, Sendeversuch läuft im Hintergrund (nicht abgewartet): ein TNT-Ausfall bleibt unsichtbar.
    onContactSubmission: async (ctx, { formId, values, submissionId, honeypotTripped }) => {
      if (honeypotTripped) return;
      const plan = await getForwardingPlan(ctx, formId);
      if (plan) await forwardSubmission(ctx, plan, values, submissionId);
    },
  },

  // Retry-Worker. Tick-Raster 30 s: 45 s ergibt einen Lauf etwa je Minute.
  jobs: [{
    id: 'outbox',
    intervalMs: 45_000,
    run: async (ctx) => {
      await cleanupOutbox(ctx.prisma);
      await processOutbox(ctx.prisma, new Date(), await getRuntime(ctx));
    },
  }],
};
