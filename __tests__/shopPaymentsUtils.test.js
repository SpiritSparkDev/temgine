import { providersToForm, providerPayload, statusLabel, webhookUrl } from '../components/shopPaymentsUtils';

const providers = {
  sumup: {
    enabled: true, configured: false,
    fields: [
      { key: 'k', label: 'K', secret: true, set: true },
      { key: 'm', label: 'M', secret: false, set: true, value: 'MC' },
    ],
  },
};

describe('shopPaymentsUtils', () => {
  it('never prefills secrets', () => {
    expect(providersToForm(providers)).toEqual({ sumup: { enabled: true, values: { k: '', m: 'MC' } } });
  });
  it('builds the payload', () => {
    expect(providerPayload({ enabled: false, values: { k: '' } })).toEqual({ enabled: false, values: { k: '' } });
  });
  it('labels status and webhook url', () => {
    expect(statusLabel({ configured: true })).toBe('konfiguriert');
    expect(statusLabel({ configured: false })).toBe('Zugangsdaten fehlen');
    expect(webhookUrl('https://x.de', 'stripe')).toBe('https://x.de/api/shop/webhooks/stripe');
  });
});
