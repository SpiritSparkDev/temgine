import { SUPPORTED_VERSIONS, KINDS } from '../common';
import { describeProviders } from '../sectionSchemas';

const FIELD_TYPES = ['text', 'textarea', 'number', 'url', 'image', 'date', 'select', 'color', 'array', 'checkbox'];
const SYSTEM_VARS = ['page.title', 'page.slug', 'page.isChild', 'page.data.*', 'global.*', 'data.*', 'widget.*', 'inner'];
const NAV_VARS = ['nav:main', 'nav:page', 'nav:mobile', 'nav:auto'];

export const features = ['error-list', 'section-schema'];

// kit.features enthält die Funktionen aller Routen-Gruppen (routes/index.js)
export const routes = ({ core, authed, features: all }) => ({
  'GET v1/capabilities': authed('view', (req, res, ctx) => res.status(200).json({
    temgineVersion: core.version,
    apiVersion: ctx.v,
    apiVersions: SUPPORTED_VERSIONS,
    features: all,
    fieldTypes: FIELD_TYPES,
    systemVars: SYSTEM_VARS,
    navVars: NAV_VARS,
    sectionProviders: describeProviders(core.sectionProviders()),
    templateKinds: KINDS,
  })),
});
