# Changelog

All notable changes to **Temgine CMS** are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.8.0] – 2026-04-07

### Added
- Alpha tab functionality for Content Models and Importer views
- New template editor with improved UI and visual structure
- Anchor ID input field per block in PageEditor
- Block template selection dropdown directly in block header

### Changed
- Block title row layout refactored to flexbox for consistency
- Block movement controls (Up/Down/Indent/Outdent) improved
- Template engine cleaned up: removed unused template code references

### Fixed
- Build error: missing `@babel/runtime` dependency added explicitly (`next-auth` peer dep)

---

## [0.7.0] – Project Rename & UI Overhaul

### Changed
- **Project renamed from TempHelix to Temgine CMS** – updated all configs, README, and branding
- Admin navbar updated with new logo image link
- Favicon and site logo metadata added
- Global UI styles revised for improved consistency and accessibility
- Page block list layout improved with flexbox

### Added
- Live preview panel in PageEditor (rendered HTML preview, unsaved state)
- Toggle published/draft status for page tree nodes
- Fallback logic: fetch homepage with drafts if published version not found

---

## [0.6.0] – Deployment, Setup & Auth

### Added
- Setup page with initial admin creation endpoint (`/setup`, `/api/setup/create-admin`)
- Auto database migration on server startup for Plesk deployments
- Diagnostic script for checking environment variables (`scripts/check-env.js`)
- Migration helper scripts for Plesk (`scripts/migrate.js`)
- Improved error handling in setup process and database interactions
- `server.js` for custom startup with auto-migration support

### Changed
- Authentication logic refactored and login instructions updated
- Prisma 5.x compatibility: dependencies updated (`360cd83`)

---

## [0.5.0] – Import, Backup & Snippet System

### Added
- **Backup feature**: full page and data backup/restore via BackupView
- HTML Importer: import external HTML into page blocks (`lib/htmlImporter.js`)
- Template Matcher: match imported HTML blocks to existing templates (`lib/templateMatcher.js`)
- Database export and import functionality with toast notifications
- Snippet label system: dynamic field labels editable per template variable

### Changed
- Snippet handling overhauled: type metadata, handler support, unescaped HTML output
- Template parsing refactored: improved variable extraction and snippet binding

---

## [0.4.0] – Template Engine & PageEditor

### Added
- Structure preview component (`TemplateStructurePreview`) for page block hierarchy
- Block slots: dynamic slot assignment for page blocks
- Field selection in PageEditor with scroll-to-field and focus management
- `guessInputType()` for automatic field widget selection (text, textarea, URL, ...)
- Search functionality in SnippetsView and TemplatesViewModern
- CodeEditor: dark mode support and segmented template selection

### Changed
- Template engine: removed navigation placeholders, simplified rendering logic
- Block rendering enhanced to support nested children insertion
- PageEditor: field references (`fieldNodeRefs`) for targeted scrolling and focus

---

## [0.3.0] – CSS Manager, Nested Blocks & Content Models

### Added
- CSS Manager View: upload and manage external CSS files
- Content Models View (`ContentModelsView`) with state management and editing
- PageEditor: nested block support (indent/outdent, child blocks, recursive rendering)
- Anchor navigation with dynamic loading and template integration
- Dynamic heading snippets
- HTML sanitization for page and snippet content (`lib/htmlSanitize.js`)
- PageTreeEditor: improved slug generation, prevent self-reference in template buttons

### Changed
- Navigation rendering refactored in template engine (annotated hierarchical pages)
- Upsert logic in pages API limited to top-level nodes only
- Admin page converted to client-only component (prevent SSR errors)
- Error boundary added to Admin component
- Dynamic imports for all heavy Admin components (lazy loading, no SSR)

---

## [0.2.0] – Core CMS Features

### Added
- `isHomepage` field on pages; homepage rendering logic
- `PageEditor` with block-based editing, text blocks, gallery blocks
- Template variable parsing from HTML (`lib/templateParser.js`, `lib/templateFields.js`)
- Snippets: heading, custom HTML, bound snippets in templates
- Navigation system with `PageTreeEditor`
- Prisma schema: `Page`, `Template`, `Snippet`, `Navigation`, `ContentModel` models
- Database migration scripts (`scripts/migrate-json-to-db.js`, etc.)
- Audit log (`lib/audit.js`)
- User invitation system (`UserInvitationsView`, invite token flow)

### Changed
- Template engine: supports `{{VAR}}` placeholder replacement, slot-based block rendering
- Tabbed editing interface in Admin (`AdminPageClient`)

---

## [0.1.0] – Foundation

### Added
- Initial project scaffold (Next.js 14, Prisma, NextAuth)
- Base template engine (`lib/templateEngine.js`)
- JSON-based data storage as starting point (`data/pages.json`, `data/templates.json`, etc.)
- `[...slug].js` catch-all routing for page rendering
- Basic admin panel skeleton
- Init data: default pages, templates, snippets, navigations (`init/`)
