jest.disableAutomock();
const cart = require('../lib/shop/client/cart');

beforeEach(() => { window.localStorage.clear(); });

test('add/setQty/remove/count/clear with clamping and event', () => {
  const fn = jest.fn();
  window.addEventListener('temgine:shop-cart-changed', fn);
  cart.add('A', 2);
  cart.add('A', 1);
  cart.add('B');
  expect(cart.load()).toEqual([{ sku: 'A', qty: 3 }, { sku: 'B', qty: 1 }]);
  expect(cart.count()).toBe(4);
  cart.setQty('A', 500);
  expect(cart.load()[0].qty).toBe(99);
  cart.setQty('A', 0);
  expect(cart.load()[0].qty).toBe(1);
  cart.remove('A');
  expect(cart.load()).toEqual([{ sku: 'B', qty: 1 }]);
  cart.clear();
  expect(cart.count()).toBe(0);
  expect(fn).toHaveBeenCalled();
  window.removeEventListener('temgine:shop-cart-changed', fn);
});

test('stores only sku and qty; ignores corrupt storage', () => {
  window.localStorage.setItem('temgine_shop_cart', '{kaputt');
  expect(cart.load()).toEqual([]);
  window.localStorage.setItem('temgine_shop_cart', JSON.stringify([{ sku: 'A', qty: 2, price: 1 }, { nope: 1 }]));
  cart.add('C');
  expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toEqual([{ sku: 'A', qty: 2 }, { sku: 'C', qty: 1 }]);
});

test('survives throwing storage', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  expect(() => cart.add('A')).not.toThrow();
  spy.mockRestore();
});

test('updates [data-shop-cart-count] elements on change', () => {
  document.body.innerHTML = '<span data-shop-cart-count></span>';
  cart.watchCartCounters();
  cart.add('A', 3);
  expect(document.querySelector('[data-shop-cart-count]').textContent).toBe('3');
});
