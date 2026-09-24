-- Templates, navigations and footers now live as files under
-- public/assets/template/... (see lib/templateStore.js, lib/navigationStore.js,
-- lib/footerStore.js) instead of DB rows. maintenance_* content moved from the
-- Setting table into public/assets/template/maintenance/ (see lib/maintenanceStore.js).
--
-- Run scripts/migrate-navigation-footer-maintenance-to-files.js BEFORE this
-- migration in any environment that still has live Navigation/Footer/
-- maintenance_* data — it reads from these tables and must run first.
--
-- The Template/TemplateRevision tables were already dead (block templates were
-- migrated to files earlier, see scripts/migrate-templates-to-files.js) —
-- dropped here as cleanup.

DROP TABLE IF EXISTS "TemplateRevision";
DROP TABLE IF EXISTS "Template";
DROP TABLE IF EXISTS "Navigation";
DROP TABLE IF EXISTS "Footer";

DROP TYPE IF EXISTS "NavType";
DROP TYPE IF EXISTS "TemplateType";

DELETE FROM "Setting" WHERE "key" LIKE 'maintenance_%';
