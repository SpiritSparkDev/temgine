import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Layout-Helfer für PDF-Dokumente (A4, Helvetica/WinAnsi). Koordinaten in pt, Ursprung unten links.

export const A4 = { width: 595.28, height: 841.89 }

/** NBSP & Co. -> normales Leerzeichen, Steuerzeichen raus (Zeilenumbruch bleibt). */
export function normalizeSpaces(str) {
  return String(str ?? '')
    .replace(/[    ]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
}

/** Ersetzt Zeichen, die die Schrift (WinAnsi) nicht kennt, durch '?'. `charSet` = Set von Codepunkten. */
export function toWinAnsi(str, charSet) {
  let out = ''
  for (const ch of normalizeSpaces(str)) {
    out += ch === '\n' || charSet.has(ch.codePointAt(0)) ? ch : '?'
  }
  return out
}

/** Bricht Text (auch bei \n) auf maxWidth um; zu lange Wörter werden zeichenweise getrennt. `measure(text)` -> Breite. */
export function wrapLines(text, measure, maxWidth) {
  const lines = []
  for (const para of String(text).split('\n')) {
    let cur = ''
    for (const word of para.split(' ')) {
      const cand = cur ? `${cur} ${word}` : word
      if (measure(cand) <= maxWidth) { cur = cand; continue }
      if (cur) { lines.push(cur); cur = '' }
      if (measure(word) <= maxWidth) { cur = word; continue }
      for (const ch of word) {
        if (measure(cur + ch) > maxWidth && cur) { lines.push(cur); cur = ch } else cur += ch
      }
    }
    lines.push(cur)
  }
  return lines
}

/**
 * Schreiber mit Seitenverwaltung. `onText({ page, text, x, y, size, bold })` wird bei jedem gezeichneten Text
 * aufgerufen (Test-Schnittstelle: die gezeichneten Texte sind im PDF-Stream nicht zuverlässig lesbar).
 */
export async function createPdfWriter({ onText = null, margin = 50, footerHeight = 70 } = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const charSet = new Set(font.getCharacterSet())
  const pickFont = (b) => (b ? bold : font)
  const w = {
    doc, margin, width: A4.width, height: A4.height,
    top: A4.height - margin, bottom: margin + footerHeight,
    page: null, y: 0, pageIndex: -1,
  }

  w.newPage = () => {
    w.page = doc.addPage([A4.width, A4.height])
    w.pageIndex += 1
    w.y = w.top
    return w.page
  }
  w.clean = (s) => toWinAnsi(s, charSet)
  w.measure = (s, size = 10, b = false) => pickFont(b).widthOfTextAtSize(w.clean(s).replace(/\n/g, ' '), size)
  w.wrap = (s, { size = 10, bold: b = false, maxWidth }) => wrapLines(w.clean(s), (t) => w.measure(t, size, b), maxWidth)

  /** Eine Zeile Text; align 'right' = x ist die rechte Kante. Kürzt nie, der Aufrufer bricht vorher um. */
  w.text = (s, { x, y = w.y, size = 10, bold: b = false, align = 'left', gray = 0 } = {}) => {
    const t = w.clean(s).replace(/\n/g, ' ')
    const width = pickFont(b).widthOfTextAtSize(t, size)
    const px = align === 'right' ? x - width : x
    w.page.drawText(t, { x: px, y, size, font: pickFont(b), color: rgb(gray, gray, gray) })
    if (onText) onText({ page: w.pageIndex, text: t, x: px, y, size, bold: b })
    return width
  }
  w.rule = (x1, x2, y = w.y, thickness = 0.5) => {
    w.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: rgb(0.6, 0.6, 0.6) })
  }
  /** Sorgt für mindestens h pt auf der Seite; sonst neue Seite. true = neue Seite begonnen. */
  w.ensure = (h) => {
    if (w.y - h >= w.bottom) return false
    w.newPage()
    return true
  }
  /** Zeichnet auf jede Seite die Seitenzahl; footerFn(writer, pageNo, pageCount) zeichnet die Fußzeile. */
  w.finish = async (footerFn = null) => {
    const pages = doc.getPages()
    pages.forEach((p, i) => {
      w.page = p
      w.pageIndex = i
      if (footerFn) footerFn(w, i + 1, pages.length)
    })
    return Buffer.from(await doc.save())
  }

  w.newPage()
  return w
}
