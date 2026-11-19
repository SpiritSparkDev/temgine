// Server-Hooks des Plugins "designer-api". Dieses Plugin läuft innerhalb von Temgine (nach `npm run plugins:sync`),
// deshalb sind relative Importe in den Kern (../../lib/…) hier erlaubt. Die Logik steht in lib/api.js (ohne Kernimporte, testbar).
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createRoutes } from './lib/api';
import { PERMISSIONS } from '../../lib/auth';
import { listTemplates, getTemplateByName, saveTemplate, deleteTemplateByName } from '../../lib/templateStore';
import { validatePreviewSubset } from '../../lib/blogTemplateWorkflow';
import { getUsedTemplateNames } from '../../lib/templateUsage';
import { extractTemplateVariables } from '../../lib/templateParser';
import { renderTemplate } from '../../lib/templateEngine';
import { loadExternFiles, importExternFiles, normalizeExternFilename } from '../../lib/externFiles';
import { listFolderItemsRecursive } from '../../lib/uploadFolder';
import { getSectionProviders } from '../../lib/sections';
import { logAudit } from '../../lib/audit';

const cssDir = () => path.join(process.cwd(), 'public', 'extern_css');
const readVersion = () => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version; } catch (_e) { return null; } };

const core = {
  // Rollenlisten werden pro Anfrage gelesen (Admin-Overrides können sich ändern).
  roles: {
    get view() { return PERMISSIONS.TEMPLATES_VIEW; },
    get edit() { return PERMISSIONS.TEMPLATES_EDIT; },
    get delete() { return PERMISSIONS.TEMPLATES_DELETE; },
    get cssView() { return PERMISSIONS.CSS_VIEW; },
    get cssEdit() { return PERMISSIONS.CSS_EDIT; },
    get cssDelete() { return PERMISSIONS.CSS_DELETE; },
    get filesView() { return PERMISSIONS.FILES_VIEW || PERMISSIONS.TEMPLATES_VIEW; },
  },
  // ponytail: Secret = NEXTAUTH_SECRET (alle Tokens widerrufen = Secret ändern); eigenes Setting, falls das stört.
  secret: () => process.env.NEXTAUTH_SECRET || null,
  now: () => Date.now(),
  version: readVersion(),
  bcrypt,
  store: { listTemplates, getTemplateByName, saveTemplate, deleteTemplateByName },
  validatePreviewSubset,
  getUsedTemplateNames,
  extractTemplateVariables,
  renderTemplate,
  sectionProviders: getSectionProviders,
  externCss: {
    list: () => loadExternFiles('css'),
    normalize: (name) => normalizeExternFilename('css', name),
    write: (filename, content) => importExternFiles('css', [{ filename, content }], 'merge'),
    remove: (filename) => fs.unlinkSync(path.join(cssDir(), filename)),
  },
  listUploads: listFolderItemsRecursive,
  audit: logAudit,
};

export default { routes: createRoutes(core) };
