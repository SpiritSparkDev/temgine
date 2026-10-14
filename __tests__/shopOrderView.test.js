jest.disableAutomock();
const { hydrateShop } = require('../lib/shop/client/hydrate');
const order = require('../lib/shop/client/orderView');

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const resp = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ord = (status, o = {}) => ({ reference: 'ORD-2026-000001', status, totalCents: 2990, currency: 'EUR', paid: status === 'PAID', ...o });

let replies;
let ticks;
const setup = (search = '?ref=ORD-2026-000001') => {
  window.history.pushState({}, '', '/bestellung' + search);
  window.localStorage.setItem('temgine_shop_cart', JSON.stringify([{ sku: 'A', qty: 1 }]));
  global.fetch = jest.fn(() => (replies.length > 1 ? replies.shift() : replies[0]));
  document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="order"></div></div>';
  hydrateShop(document.getElementById('r'));
  return document.getElementById('r');
};
const cartLeft = () => JSON.parse(window.localStorage.getItem('temgine_shop_cart'));

beforeEach(() => {
  document.head.innerHTML = '';
  window.localStorage.clear();
  ticks = [];
  jest.spyOn(order.timers, 'set').mockImplementation((fn, ms) => { ticks.push({ fn, ms }); return ticks.length; });
  jest.spyOn(order.timers, 'clear').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('paid: thanks with reference and amount, cart cleared', async () => {
  replies = [resp(200, ord('PAID'))];
  const root = setup();
  await flush();
  expect(fetch).toHaveBeenCalledWith('/api/shop/public/orders/ORD-2026-000001');
  expect(root.textContent).toContain('Vielen Dank');
  expect(root.textContent).toContain('ORD-2026-000001');
  expect(root.textContent).toContain('29,90 €');
  expect(cartLeft()).toEqual([]);
});

test('pending: polls every 3 s up to 5 times, then hint with checkout link', async () => {
  replies = [resp(200, ord('PENDING'))];
  const root = setup();
  await flush();
  expect(root.textContent).toContain('Wir prüfen deine Zahlung…');
  for (let i = 0; i < 5; i++) {
    expect(ticks).toHaveLength(i + 1);
    expect(ticks[i].ms).toBe(3000);
    ticks[i].fn();
    await flush();
  }
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(ticks).toHaveLength(5);
  expect(root.textContent).not.toContain('Wir prüfen');
  expect(root.querySelector('a[href="/kasse"]')).toBeTruthy();
  expect(cartLeft()).toHaveLength(1);
});

test('pending then paid', async () => {
  replies = [resp(200, ord('PENDING')), resp(200, ord('PAID'))];
  const root = setup();
  await flush();
  ticks[0].fn();
  await flush();
  expect(root.textContent).toContain('Vielen Dank');
  expect(ticks).toHaveLength(1);
});

test('stop function cancels polling', async () => {
  replies = [resp(200, ord('PENDING'))];
  document.body.innerHTML = '<div id="x"></div>';
  window.history.pushState({}, '', '/bestellung?ref=ORD-1');
  global.fetch = jest.fn(() => replies[0]);
  const stop = order.hydrateOrder(document.getElementById('x'));
  await flush();
  stop();
  ticks[0].fn();
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(order.timers.clear).toHaveBeenCalled();
});

test.each([
  ['failed', () => resp(200, ord('FAILED')), 'Die Zahlung konnte nicht abgeschlossen werden'],
  ['404', () => resp(404, {}), 'nicht gefunden'],
  ['500', () => resp(500, {}), 'konnte nicht abgerufen werden'],
  ['network', () => Promise.reject(new Error('x')), 'konnte nicht abgerufen werden'],
  ['unknown status', () => resp(200, ord('CANCELLED')), 'Die Zahlung konnte nicht abgeschlossen werden'],
])('%s: message and checkout link, cart kept', async (_n, mk, text) => {
  replies = [mk()];
  const root = setup();
  await flush();
  expect(root.textContent).toContain(text);
  expect(root.querySelector('a[href="/kasse"]')).toBeTruthy();
  expect(cartLeft()).toHaveLength(1);
});

test('missing or malformed ref makes no request', async () => {
  replies = [resp(200, ord('PAID'))];
  let root = setup('');
  await flush();
  expect(fetch).not.toHaveBeenCalled();
  expect(root.textContent).toContain('Keine Bestellung angegeben');
  root = setup('?ref=%3Cscript%3E');
  await flush();
  expect(fetch).not.toHaveBeenCalled();
});

test('output is escaped and shows no personal data', async () => {
  replies = [resp(200, ord('PAID', { reference: '<img src=x>', email: 'a@b.de', billing: { name: 'Max' } }))];
  const root = setup();
  await flush();
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).not.toContain('a@b.de');
  expect(root.textContent).not.toContain('Max');
});
