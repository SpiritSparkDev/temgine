/**
 * lib/settingsKeys.js
 *
 * Allow-List für PUT /api/settings: nur diese Kern-Keys (plus die Wartungsseiten-Keys
 * maintenance_<seite>_{html,css,js}, siehe lib/maintenanceStore.js) dürfen geschrieben
 * werden. Ermittelt aus allen Aufrufern im Admin (Stand 0.38.0). Status-Keys wie
 * liveRenderLast* oder external_sources schreibt der Server selbst, nicht über PUT.
 * Plugin-Manifeste ergänzen die Liste ab Plugin-System P1.
 */
export const CORE_SETTING_KEYS = [
  // Dashboard
  'maintenance_mode_enabled',
  // Einstellungen → Allgemein / Live-Rendering
  'admin_logo_url',
  'folderDragDropEnabled',
  'revisionRetentionDays',
  'richTextEditorMode',
  'liveRenderMode',
  // Einstellungen → SEO
  'seo_site_name',
  'seo_default_description',
  'seo_default_og_image',
  'seo_twitter_handle',
  'seo_title_template',
  'seo_organization_name',
  'seo_organization_logo',
  'seo_google_site_verification',
  'seo_bing_site_verification',
  'seo_robots_txt_extra_disallow',
  'seo_indexing_enabled',
  // Einstellungen → Matomo
  'matomo_enabled',
  'matomo_url',
  'matomo_site_id',
  'matomo_track_without_cookies',
  'matomo_respect_dnt',
  // Einstellungen → Picgine
  'picgine_url',
  'picgine_api_key',
  // Einstellungen → Externe Quellen
  'external_sources_enabled',
  // Kontaktformulare → SMTP
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_secure',
  'contact_recipient_email',
  'contact_sender_name',
  'contact_sender_email',
  'contact_subject_prefix',
];
