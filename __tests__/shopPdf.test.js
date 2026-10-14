/**
 * __tests__/shopPdf.test.js
 * lib/shop/pdf.js: WinAnsi-Ersatz, Umbruch, Seitenverwaltung, Zeichen-Schnittstelle
 *
 * @jest-environment node
 */

jest.disableAutomock()

const { PDFDocument } = require('pdf-lib')
const { toWinAnsi, normalizeSpaces, wrapLines, createPdfWriter } = require('../lib/shop/pdf')

describe('toWinAnsi', () => {
  const set = new Set([...'abc äöüß€ ,.'].map((c) => c.codePointAt(0)))
  test('keeps known characters, replaces unknown by ?', () => {
    expect(toWinAnsi('ä€ ß 日本 😀', set)).toBe('ä€ ß ?? ?')
  })
  test('NBSP becomes a normal space, line breaks stay', () => {
    expect(normalizeSpaces('24,90 €')).toBe('24,90 €')
    expect(toWinAnsi('a\nb', set)).toBe('a\nb')
  })
})

describe('wrapLines', () => {
  const measure = (s) => s.length * 10
  test('wraps at word boundaries and respects newlines', () => {
    expect(wrapLines('aaa bbb ccc', measure, 70)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapLines('a\nb', measure, 100)).toEqual(['a', 'b'])
  })
  test('splits words that are too long', () => {
    expect(wrapLines('abcdefgh', measure, 30)).toEqual(['abc', 'def', 'gh'])
  })
})

describe('createPdfWriter', () => {
  test('reports drawn texts, right alignment and replaced characters', async () => {
    const seen = []
    const w = await createPdfWriter({ onText: (t) => seen.push(t) })
    const width = w.text('Grüße 日', { x: 200, y: 700, align: 'right' })
    expect(seen[0].text).toBe('Grüße ?')
    expect(seen[0].x).toBeCloseTo(200 - width)
  })

  test('ensure starts a new page when space runs out; result loads again', async () => {
    const w = await createPdfWriter()
    w.y = w.bottom + 5
    expect(w.ensure(20)).toBe(true)
    expect(w.y).toBe(w.top)
    expect(w.ensure(20)).toBe(false)
    const buf = await w.finish((wr, n, m) => wr.text(`${n}/${m}`, { x: 50, y: 20 }))
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await PDFDocument.load(buf)).getPageCount()).toBe(2)
  })
})
