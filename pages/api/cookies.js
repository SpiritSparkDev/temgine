import { requireAuth } from '../../lib/auth';
import {
  getServices,
  saveServices,
  getBannerContent,
  saveBannerField,
  DEFAULT_BANNER_HTML,
  DEFAULT_BANNER_CSS,
  DEFAULT_BANNER_JS,
} from '../../lib/cookieConsentStore';
import { NECESSARY_BASELINE } from '../../lib/cookieCatalog';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      services: [...NECESSARY_BASELINE, ...getServices()],
      banner: getBannerContent(),
      bannerDefaults: { html: DEFAULT_BANNER_HTML, css: DEFAULT_BANNER_CSS, js: DEFAULT_BANNER_JS },
    });
  }

  if (req.method === 'POST') {
    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

    const { services, banner } = req.body || {};

    if (Array.isArray(services)) {
      saveServices(services);
      return res.status(200).json({ success: true });
    }

    if (banner && ['html', 'css', 'js'].includes(banner.field)) {
      saveBannerField(banner.field, banner.content);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Ungültiger Request-Body' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
