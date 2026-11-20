// Liste aller Routen-Gruppen. Neues Paket: Datei `lib/routes/<gruppe>.js` anlegen und hier eintragen.
// Jede Datei exportiert `features` (Namen für GET /capabilities) und `routes(kit)` (Schlüssel wie 'GET v1/…').
import * as auth from './auth';
import * as templates from './templates';
import * as css from './css';
import * as assets from './assets';
import * as uploads from './uploads';
import * as preview from './preview';
import * as site from './site';
import * as capabilities from './capabilities';
import * as pairing from './pairing';
import * as usage from './usage';
import * as admin from './admin';
import * as context from './context';
import * as pagepreview from './pagepreview';
import * as bulk from './bulk';

export default [auth, templates, css, assets, uploads, preview, site, capabilities, pairing, usage, admin, context, pagepreview, bulk];
