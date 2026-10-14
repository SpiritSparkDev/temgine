jest.disableAutomock()
const mockPrisma = {
  member: { findUnique: jest.fn() },
  shopOrder: { findMany: jest.fn(), findUnique: jest.fn() },
  shopProduct: { findUnique: jest.fn() },
  shopWishlistItem: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
}
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }))
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }))
jest.mock('../../lib/shop/downloads', () => ({ listDownloadsForOrder: jest.fn() }))
jest.mock('../../lib/shop/invoice', () => ({ issueInvoice: jest.fn(), buildInvoicePdf: jest.fn() }))

const { isShopEnabled } = require('../../lib/shop/config')
const { getServerSession } = require('next-auth/next')
const { listDownloadsForOrder } = require('../../lib/shop/downloads')
const { issueInvoice, buildInvoicePdf } = require('../../lib/shop/invoice')
const listH = require('../../pages/api/shop/account/orders').default
const detailH = require('../../pages/api/shop/account/orders/[reference]').default
const invoiceH = require('../../pages/api/shop/account/orders/[reference]/invoice').default
const wishH = require('../../pages/api/shop/account/wishlist').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const call = async (h, { method = 'GET', query = {}, body } = {}) => {
  const res = makeRes()
  await h({ method, query, body, headers: {} }, res)
  return res
}
const asMember = (id = 'm1') => getServerSession.mockResolvedValue({ user: { id, accountType: 'member' } })

beforeEach(() => {
  jest.clearAllMocks()
  Object.values(mockPrisma).forEach((m) => Object.values(m).forEach((f) => f.mockReset()))
  isShopEnabled.mockResolvedValue(true)
  asMember()
  mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', email: 'a@b.de', blocked: false })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('authorization (all account routes)', () => {
  const routes = [
    [listH, {}],
    [detailH, { query: { reference: 'R' } }],
    [invoiceH, { query: { reference: 'R' } }],
    [wishH, {}],
    [wishH, { method: 'POST', body: { productSlug: 'a' } }],
    [wishH, { method: 'DELETE', query: { productSlug: 'a' } }],
  ]
  test.each(routes)('401 LOGIN_REQUIRED without session, admin session, blocked or deleted member', async (h, opts) => {
    const expect401 = async () => {
      const res = await call(h, opts)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LOGIN_REQUIRED' }))
    }
    getServerSession.mockResolvedValue(null)
    await expect401()
    getServerSession.mockResolvedValue({ user: { id: 'a1', accountType: 'admin' } })
    await expect401()
    asMember()
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', blocked: true })
    await expect401()
    mockPrisma.member.findUnique.mockResolvedValue(null)
    await expect401()
    getServerSession.mockRejectedValue(new Error('x'))
    await expect401()
  })
  test('404 when add-on is off', async () => {
    isShopEnabled.mockResolvedValue(false)
    expect((await call(listH)).status).toHaveBeenCalledWith(404)
  })
})

test('order list: only own orders via memberId, flags and tracking only when shipped', async () => {
  mockPrisma.shopOrder.findMany.mockResolvedValue([
    { reference: 'R1', status: 'SHIPPED', totalCents: 100, currency: 'EUR', createdAt: 'd', trackingCarrier: 'DHL', trackingNumber: '1', trackingUrl: null, invoice: { id: 'i' } },
    { reference: 'R2', status: 'PENDING', totalCents: 200, currency: 'EUR', createdAt: 'd', trackingCarrier: 'DHL', trackingNumber: '1', trackingUrl: null, invoice: null },
  ])
  const res = await call(listH)
  const arg = mockPrisma.shopOrder.findMany.mock.calls[0][0]
  expect(arg.where).toEqual({ memberId: 'm1' })
  expect(arg.take).toBe(100)
  expect(arg.orderBy).toEqual({ createdAt: 'desc' })
  const { orders } = res.json.mock.calls[0][0]
  expect(orders[0]).toMatchObject({ paid: true, hasInvoice: true, tracking: { carrier: 'DHL', number: '1', url: null } })
  expect(orders[1]).toMatchObject({ paid: false, hasInvoice: false, tracking: null })
})

const full = (o = {}) => ({
  id: 'o1', reference: 'R1', status: 'PAID', memberId: 'm1', currency: 'EUR', createdAt: 'd', paidAt: 'p', shippedAt: null,
  subtotalCents: 1000, discountCents: 100, shippingCents: 400, shippingTaxBp: 1900, totalCents: 1300, refundedCents: 0, couponCode: 'X1',
  taxBreakdown: { 700: 50 }, trackingCarrier: null, trackingNumber: null, trackingUrl: null,
  items: [{ title: 'T', label: 'PDF', sku: 'S', qty: 1, unitCents: 1000, discountCents: 100, taxRateBp: 700, digital: true }],
  ...o,
})

test('order detail: foreign or unknown order gives 404; own paid order has downloads and invoice link', async () => {
  mockPrisma.shopOrder.findUnique.mockResolvedValue(full({ memberId: 'other' }))
  expect((await call(detailH, { query: { reference: 'R1' } })).status).toHaveBeenCalledWith(404)
  mockPrisma.shopOrder.findUnique.mockResolvedValue(full({ memberId: null }))
  expect((await call(detailH, { query: { reference: 'R1' } })).status).toHaveBeenCalledWith(404)
  mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
  expect((await call(detailH, { query: { reference: 'R1' } })).status).toHaveBeenCalledWith(404)

  listDownloadsForOrder.mockResolvedValue([{ filename: 'a.pdf', url: '/api/shop/download/z', expiresAt: 'E', remaining: 3, token: 'secret' }])
  mockPrisma.shopOrder.findUnique.mockResolvedValue(full())
  const { order } = (await call(detailH, { query: { reference: 'R1' } })).json.mock.calls[0][0]
  expect(order.downloads).toEqual([{ filename: 'a.pdf', url: '/api/shop/download/z', expiresAt: 'E', remaining: 3 }])
  expect(order.invoiceUrl).toBe('/api/shop/account/orders/R1/invoice')
  expect(order).toMatchObject({ discountCents: 100, shippingCents: 400, taxBreakdown: { 700: 50 } })
  const select = mockPrisma.shopOrder.findUnique.mock.calls[3][0].select
  for (const k of ['email', 'billing', 'shipping', 'payments', 'accessToken']) expect(select[k]).toBeUndefined()
})

test('order detail: no downloads and no invoice link while PENDING', async () => {
  mockPrisma.shopOrder.findUnique.mockResolvedValue(full({ status: 'PENDING' }))
  const { order } = (await call(detailH, { query: { reference: 'R1' } })).json.mock.calls[0][0]
  expect(order.downloads).toEqual([])
  expect(order.invoiceUrl).toBeNull()
  expect(listDownloadsForOrder).not.toHaveBeenCalled()
})

describe('invoice route', () => {
  const q = { query: { reference: 'R1' } }
  test('foreign order 404, unpaid 409', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1', reference: 'R1', status: 'PAID', memberId: 'other' })
    expect((await call(invoiceH, q)).status).toHaveBeenCalledWith(404)
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1', reference: 'R1', status: 'PENDING', memberId: 'm1' })
    expect((await call(invoiceH, q)).status).toHaveBeenCalledWith(409)
    expect(buildInvoicePdf).not.toHaveBeenCalled()
  })
  test.each(['PAID', 'SHIPPED', 'REFUNDED'])('%s: issues and streams the PDF as attachment', async (status) => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1', reference: 'R1', status, memberId: 'm1' })
    buildInvoicePdf.mockResolvedValue(Buffer.from('%PDF'))
    const res = await call(invoiceH, q)
    expect(issueInvoice).toHaveBeenCalledWith('o1')
    expect(buildInvoicePdf).toHaveBeenCalledWith('o1')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('attachment'))
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF'))
  })
})

describe('wishlist', () => {
  const post = (slug) => call(wishH, { method: 'POST', body: { productSlug: slug } })
  test('GET filters inactive in the query, maps title/image/fromPrice, en title', async () => {
    mockPrisma.shopWishlistItem.findMany.mockResolvedValue([
      { createdAt: 'd', product: { slug: 'a', title: 'Titel', images: ['/uploads/x.webp'], translations: { en: { title: 'Title' } }, formats: [{ priceCents: 900, taxRateBp: 700, stock: null }, { priceCents: 500, taxRateBp: 700, stock: 0 }, { priceCents: 700, taxRateBp: 700, stock: 2 }] } },
    ])
    const res = await call(wishH, { query: { lang: 'en' } })
    expect(mockPrisma.shopWishlistItem.findMany.mock.calls[0][0].where).toEqual({ memberId: 'm1', product: { active: true } })
    expect(res.json).toHaveBeenCalledWith({ items: [{ slug: 'a', title: 'Title', image: '/uploads/x.webp', fromPriceCents: 700, createdAt: 'd' }] })
  })
  test('POST: unknown/inactive 404, invalid 422, adds, is idempotent', async () => {
    mockPrisma.shopProduct.findUnique.mockResolvedValue(null)
    expect((await post('a')).status).toHaveBeenCalledWith(404)
    mockPrisma.shopProduct.findUnique.mockResolvedValue({ id: 'p1', active: false })
    expect((await post('a')).status).toHaveBeenCalledWith(404)
    expect((await post('')).status).toHaveBeenCalledWith(422)
    expect((await post('x'.repeat(81))).status).toHaveBeenCalledWith(422)
    mockPrisma.shopProduct.findUnique.mockResolvedValue({ id: 'p1', active: true })
    mockPrisma.shopWishlistItem.findUnique.mockResolvedValue(null)
    mockPrisma.shopWishlistItem.count.mockResolvedValue(3)
    expect((await post('a')).status).toHaveBeenCalledWith(200)
    expect(mockPrisma.shopWishlistItem.upsert).toHaveBeenCalledTimes(1)
    mockPrisma.shopWishlistItem.findUnique.mockResolvedValue({ memberId: 'm1' })
    expect((await post('a')).status).toHaveBeenCalledWith(200)
    expect(mockPrisma.shopWishlistItem.upsert).toHaveBeenCalledTimes(1)
  })
  test('POST: 200 entries limit reached', async () => {
    mockPrisma.shopProduct.findUnique.mockResolvedValue({ id: 'p1', active: true })
    mockPrisma.shopWishlistItem.findUnique.mockResolvedValue(null)
    mockPrisma.shopWishlistItem.count.mockResolvedValue(200)
    const res = await post('a')
    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'WISHLIST_FULL' }))
    expect(mockPrisma.shopWishlistItem.upsert).not.toHaveBeenCalled()
  })
  test('DELETE is idempotent and scoped to the member', async () => {
    mockPrisma.shopWishlistItem.deleteMany.mockResolvedValue({ count: 0 })
    const res = await call(wishH, { method: 'DELETE', query: { productSlug: 'a' } })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockPrisma.shopWishlistItem.deleteMany).toHaveBeenCalledWith({ where: { memberId: 'm1', product: { slug: 'a' } } })
  })
  test('405 for other methods; 429 after 60 writes per minute per member', async () => {
    expect((await call(wishH, { method: 'PUT' })).status).toHaveBeenCalledWith(405)
    asMember('m-rate')
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm-rate', email: 'r@b.de', blocked: false })
    mockPrisma.shopWishlistItem.deleteMany.mockResolvedValue({ count: 0 })
    let last
    for (let i = 0; i < 61; i++) last = await call(wishH, { method: 'DELETE', query: { productSlug: 'a' } })
    expect(last.status).toHaveBeenCalledWith(429)
  })
})
