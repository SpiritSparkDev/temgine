import React, { useState } from 'react';
import ShopProductsView from './ShopProductsView';
import ShopShippingView from './ShopShippingView';
import ShopPaymentsView from './ShopPaymentsView';
import ShopOrdersView from './ShopOrdersView';
import ShopOverviewView from './ShopOverviewView';
import ShopReturnsView from './ShopReturnsView';
import ShopCouponsView from './ShopCouponsView';

const TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'products', label: 'Produkte' },
  { id: 'orders', label: 'Bestellungen' },
  { id: 'returns', label: 'Rückgaben' },
  { id: 'coupons', label: 'Gutscheine' },
  { id: 'shipping', label: 'Versand & Steuer' },
  { id: 'payments', label: 'Zahlungsarten' },
];

/** Container des Shop-Add-ons im Admin. */
export default function ShopAdminView({ showToast }) {
  const [tab, setTab] = useState('overview');
  return (
    <div style={{ padding: 16 }}>
      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className={`btn ${tab === t.id ? 'btn-primary' : ''}`}
            aria-selected={tab === t.id}
            disabled={t.soon}
            title={t.soon ? 'folgt' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}{t.soon ? ' (folgt)' : ''}
          </button>
        ))}
      </div>
      {tab === 'overview' && <ShopOverviewView showToast={showToast} />}
      {tab === 'products' && <ShopProductsView showToast={showToast} />}
      {tab === 'orders' && <ShopOrdersView showToast={showToast} />}
      {tab === 'returns' && <ShopReturnsView showToast={showToast} />}
      {tab === 'coupons' && <ShopCouponsView showToast={showToast} />}
      {tab === 'shipping' && <ShopShippingView showToast={showToast} />}
      {tab === 'payments' && <ShopPaymentsView showToast={showToast} />}
    </div>
  );
}
