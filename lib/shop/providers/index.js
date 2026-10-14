// Registry der Zahlungsanbieter. Stripe/PayPal kommen in späteren Phasen hinzu.
import * as sumup from './sumup'
import { SHOP_PROVIDERS, providerEnabledKey } from '../keys'

const REGISTRY = { sumup }

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
