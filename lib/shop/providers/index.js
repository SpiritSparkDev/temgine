// Registry der Zahlungsanbieter (SumUp, Stripe, PayPal): neue Treiber hier eintragen.
import * as sumup from './sumup'
import * as stripe from './stripe'
import * as paypal from './paypal'
import { SHOP_PROVIDERS, providerEnabledKey } from '../keys'

const REGISTRY = { sumup, stripe, paypal }

/** Treibermodul oder null (nur eigene Schlüssel, kein Prototype-Zugriff). */
export function getProvider(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(REGISTRY, id) ? REGISTRY[id] : null
}

/** true, wenn der Anbieter aktiviert ist und alle requiredKeys gesetzt sind. */
export function isProviderAvailable(id, settings = {}) {
  const def = SHOP_PROVIDERS[id]
  return !!(def && getProvider(id) && settings[providerEnabledKey(id)] === 'true' && def.requiredKeys.every((k) => !!settings[k]))
}

/** [{ id, label }] der verfügbaren Anbieter. */
export function listAvailableProviders(settings = {}) {
  return Object.keys(REGISTRY).filter((id) => isProviderAvailable(id, settings)).map((id) => ({ id, label: SHOP_PROVIDERS[id].label }))
}
