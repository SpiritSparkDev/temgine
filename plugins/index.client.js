// Client-Registry des Plugin-Systems: eine Import-Zeile pro Plugin, Schlüssel = Plugin-ID.
// Wert = Default-Export von plugins/<id>/client.js — landet im Browser-Bundle, darf also
// nichts mit Secrets, Prisma oder fs importieren (Vertragstest __tests__/plugins.contract.test.js).
//
//   import picgine from './picgine/client';
//   export default { picgine };

export default {};
