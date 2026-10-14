// Setting-Schlüssel des Shop-Add-ons (reine Konstanten, ohne Datenbankzugriff).
// Konfiguration liegt wie bei den anderen Add-ons in der Setting-Tabelle; Geheimnisse stehen zusätzlich
// in SHOP_SECRET_KEYS, damit GET /api/settings sie nie herausgibt (siehe pages/api/settings.js).

export const SHOP_ENABLED_KEY = 'shop_enabled'

/**
 * Zahlungsanbieter: getrennt zuschaltbar, je mit eigenen Zugangsdaten.
 * fields = Eingabefelder der Admin-Oberfläche; requiredKeys = nötig, damit der Anbieter verfügbar ist.
 */
export const SHOP_PROVIDERS = {
  sumup: {
    label: 'SumUp',
    fields: [
      { key: 'shop_sumup_api_key', label: 'API-Key (Sandbox oder Live)', secret: true },
      { key: 'shop_sumup_merchant_code', label: 'Merchant-Code', secret: false },
    ],
    requiredKeys: ['shop_sumup_api_key', 'shop_sumup_merchant_code'],
  },
  stripe: {
    label: 'Stripe',
    fields: [
      { key: 'shop_stripe_secret_key', label: 'Geheimer Schlüssel (sk_test_… / sk_live_…)', secret: true },
      { key: 'shop_stripe_webhook_secret', label: 'Webhook-Signaturgeheimnis (whsec_…)', secret: true },
    ],
    requiredKeys: ['shop_stripe_secret_key', 'shop_stripe_webhook_secret'],
  },
  paypal: {
    label: 'PayPal',
    fields: [
      { key: 'shop_paypal_client_id', label: 'Client-ID', secret: false },
      { key: 'shop_paypal_client_secret', label: 'Client-Secret', secret: true },
      { key: 'shop_paypal_webhook_id', label: 'Webhook-ID', secret: true },
      { key: 'shop_paypal_mode', label: 'Modus', secret: false, options: ['sandbox', 'live'] },
    ],
    requiredKeys: ['shop_paypal_client_id', 'shop_paypal_client_secret', 'shop_paypal_webhook_id'],
  },
}

export const providerEnabledKey = (id) => `shop_${id}_enabled`

/** Nie an den Browser ausliefern (GET /api/settings ersetzt sie durch "<key>_set"). */
export const SHOP_SECRET_KEYS = [
  'shop_sumup_api_key',
  'shop_stripe_secret_key',
  'shop_stripe_webhook_secret',
  'shop_paypal_client_secret',
  'shop_paypal_webhook_id',
  'shop_cron_token',
  'shop_notify_email',
]

/** Alle Schlüssel des Add-ons beginnen mit diesem Präfix; schreiben dürfen sie nur Admins. */
export const SHOP_KEY_PREFIX = 'shop_'

/** Versandkonfiguration (JSON: Länder, Zonen, Gewichtsstufen). */
export const SHOP_SHIPPING_KEY = 'shop_shipping'

/** Präfix der Bestellnummer, Standard "ORD". */
export const SHOP_ORDER_PREFIX_KEY = 'shop_order_prefix'

/** Empfänger der Benachrichtigung über neue bezahlte Bestellungen (leer = keine). */
export const SHOP_NOTIFY_EMAIL_KEY = 'shop_notify_email'

/** Erlaubte Shop-Währungen (alle mit 2 Nachkommastellen) und Sprachen. */
export const SHOP_CURRENCIES = ['EUR', 'CHF', 'GBP', 'USD', 'SEK', 'DKK', 'PLN', 'CZK']
export const SHOP_LOCALES = ['de', 'en']

/** Optionaler gemeinsamer Schlüssel für den Zeitplan-Aufruf (POST /api/shop/cron, Header x-shop-cron). */
export const SHOP_CRON_TOKEN_KEY = 'shop_cron_token'

/**
 * Einstellungen ohne Wert in der Datenbank. Nur Betriebswerte haben Standardwerte; rechtliche Angaben
 * (Absenderdaten, Rückgabefrist, Steuernummern) bleiben leer und werden nie erfunden.
 */
export const SHOP_SETTING_DEFAULTS = {
  shop_invoice_prefix: 'RE',
  shop_currency: 'EUR',
  shop_default_locale: 'de',
  shop_reservation_minutes: 30,
  shop_pending_cleanup_days: 3,
  shop_download_days: 30,
  shop_download_max: 5,
}

/** Nicht geheime Einstellungen, die die Shop-Verwaltung lesen und schreiben darf (Schlüssel -> Typ). */
export const SHOP_SETTING_FIELDS = {
  shop_seller_name: 'text',
  shop_seller_address: 'multiline',
  shop_seller_vat_id: 'text',
  shop_seller_tax_number: 'text',
  shop_seller_email: 'email',
  shop_seller_phone: 'text',
  shop_seller_bank: 'multiline',
  shop_seller_footer: 'multiline',
  shop_invoice_prefix: 'prefix',
  shop_currency: 'currency',
  shop_default_locale: 'locale',
  shop_low_stock_threshold: 'int',
  shop_reservation_minutes: 'int',
  shop_pending_cleanup_days: 'int',
  shop_download_days: 'int',
  shop_download_max: 'int',
  shop_return_days: 'int',
}
