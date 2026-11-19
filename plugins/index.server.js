// generiert von scripts/plugins-sync.js – nicht von Hand ändern (npm run plugins:sync)
// Server-Registry: Schlüssel = Plugin-ID, Wert = Default-Export von plugins/<id>/server.js.
import p_designer_api from './designer-api/server';
import p_picgine from './picgine/server';
import p_tnt_inquiries from './tnt-inquiries/server';

export default { 'designer-api': p_designer_api, picgine: p_picgine, 'tnt-inquiries': p_tnt_inquiries };
