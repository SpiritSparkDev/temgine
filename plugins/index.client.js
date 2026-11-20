// generiert von scripts/plugins-sync.js – nicht von Hand ändern (npm run plugins:sync)
// Client-Registry: Schlüssel = Plugin-ID, Wert = Default-Export von plugins/<id>/client.js.
// Landet im Browser-Bundle: nichts mit Secrets, Prisma oder fs importieren (Vertragstest __tests__/plugins.contract.test.js).
import p_designer_api from './designer-api/client';
import p_picgine from './picgine/client';
import p_tnt_inquiries from './tnt-inquiries/client';

export default { 'designer-api': p_designer_api, picgine: p_picgine, 'tnt-inquiries': p_tnt_inquiries };
