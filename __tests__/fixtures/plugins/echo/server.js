// Server-Hooks des Test-Plugins: je eine Route pro Kern-Funktion (Spezifikation §3.2, §5).
export default {
  routes: {
    'GET hello/:name': {
      auth: 'public',
      handler: (req, res, ctx) => res.status(200).json({ greeting: ctx.settings.echo_greeting, name: ctx.params.name, query: ctx.query, ip: ctx.clientIp }),
    },
    'POST echo': {
      auth: 'PAGES_EDIT',
      handler: (req, res, ctx) => res.status(200).json({ body: req.body, user: ctx.user.email }),
    },
    'POST webhook': {
      auth: 'public',
      rawBody: true,
      handler: (req, res) => res.status(200).json({ isBuffer: Buffer.isBuffer(req.body), text: req.body.toString('utf8') }),
    },
    'POST limited': {
      auth: 'public',
      rateLimit: { windowMs: 60000, max: 2 },
      handler: (req, res) => res.status(200).json({ ok: true }),
    },
    'GET cookie': {
      auth: 'public',
      handler: (req, res, ctx) => {
        ctx.cookies.set('seen', '1', { maxAge: 60 });
        res.status(200).json({ seen: ctx.cookies.get('seen') ?? null });
      },
    },
    'POST rebuild': {
      auth: ['ADMIN'],
      handler: (req, res, ctx) => {
        ctx.log.info('Snapshot-Neubau angefordert');
        ctx.rebuildSnapshot();
        res.status(202).json({ ok: true });
      },
    },
  },
  test: async (ctx) => ({ ok: !!ctx.settings.echo_token, message: ctx.settings.echo_token ? 'Echo erreichbar' : 'Token fehlt' }),
};
