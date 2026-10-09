// Setting-Schlüssel des Shop-Add-ons (reine Konstanten, ohne Datenbankzugriff).
// Konfiguration liegt wie bei den anderen Add-ons in der Setting-Tabelle; Geheimnisse stehen zusätzlich
// in SHOP_SECRET_KEYS, damit GET /api/settings sie nie herausgibt (siehe pages/api/settings.js).

export const SHOP_ENABLED_KEY = 'shop_enabled'

/** Zahlungsanbieter: getrennt zuschaltbar, je mit eigenen Zugangsdaten. */
export const SHOP_PROVIDERS = {
  sumup: {
    label: 'SumUp',
    requiredKeys: ['shop_sumup_api_key', 'shop_sumup_merchant_code'],
  },
  stripe: {
    label: 'Stripe',
    requiredKeys: ['shop_stripe_secret_key', 'shop_stripe_webhook_secret'],
  },
  paypal: {
    label: 'PayPal',
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
]

/** Alle Schlüssel des Add-ons beginnen mit diesem Präfix; schreiben dürfen sie nur Admins. */
export const SHOP_KEY_PREFIX = 'shop_'
