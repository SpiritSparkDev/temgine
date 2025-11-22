import fs from 'fs'
import path from 'path'

// Pfad zur JSON-Datei mit den Seiten-Daten
const filePath = path.join(process.cwd(), 'data', 'pages.json')

// Storage-Schicht: kapselt alle Datenzugriffe
// Später kann hier einfach auf eine Datenbank (z.B. Postgres) gewechselt werden
export const storage = {
  // Liest alle Seiten aus der JSON-Datei
  async getPages() {
    const data = await fs.promises.readFile(filePath, 'utf8') // Datei lesen
    return JSON.parse(data) // JSON parsen und zurückgeben
  },
  // Speichert alle Seiten in die JSON-Datei
  async savePages(pages) {
    await fs.promises.writeFile(filePath, JSON.stringify(pages, null, 2), 'utf8') // Datei schreiben
  }
}
