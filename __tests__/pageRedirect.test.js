const { getPageRedirect, extractRedirectForSave } = require('../lib/pageRedirect')

describe('getPageRedirect', () => {
  test('returns null when no redirect configured', () => {
    expect(getPageRedirect({ data: {} })).toBeNull()
    expect(getPageRedirect({})).toBeNull()
    expect(getPageRedirect(null)).toBeNull()
  })

  test('normalizes type/target and passes through valid urls', () => {
    expect(getPageRedirect({ data: { redirect: { type: 'permanent', url: '/impressum' } } }))
      .toEqual({ type: 'permanent', url: '/impressum', target: '_self' })
    expect(getPageRedirect({ data: { redirect: { type: 'temporary', url: 'https://example.com/x?a=1&b=2', target: '_blank' } } }))
      .toEqual({ type: 'temporary', url: 'https://example.com/x?a=1&b=2', target: '_blank' })
    // unknown type defaults to temporary, unknown target defaults to _self
    expect(getPageRedirect({ data: { redirect: { url: '/x' } } }))
      .toEqual({ type: 'temporary', url: '/x', target: '_self' })
  })

  test('rejects dangerous or malformed urls', () => {
    expect(getPageRedirect({ data: { redirect: { type: 'permanent', url: 'javascript:alert(1)' } } })).toBeNull()
    expect(getPageRedirect({ data: { redirect: { type: 'permanent', url: '' } } })).toBeNull()
    expect(getPageRedirect({ data: { redirect: { type: 'permanent', url: '   ' } } })).toBeNull()
    expect(getPageRedirect({ data: { redirect: { type: 'permanent', url: 'ftp://example.com' } } })).toBeNull()
  })
})

describe('extractRedirectForSave', () => {
  test('pulls redirect out of data and validates it', () => {
    const { data, redirect } = extractRedirectForSave({ foo: 'bar', redirect: { type: 'permanent', url: '/x?a=1&b=2' } })
    expect(data).toEqual({ foo: 'bar' })
    expect(redirect).toEqual({ type: 'permanent', url: '/x?a=1&b=2', target: '_self' })
  })

  test('returns null redirect when absent or invalid', () => {
    expect(extractRedirectForSave({ foo: 'bar' }).redirect).toBeNull()
    expect(extractRedirectForSave({ redirect: { url: 'javascript:x' } }).redirect).toBeNull()
    expect(extractRedirectForSave(undefined)).toEqual({ data: {}, redirect: null })
  })
})
