// Server-Registry des Plugin-Systems: eine Import-Zeile pro Plugin, Schlüssel = Plugin-ID
// (= Ordnername unter plugins/). Wert = Default-Export von plugins/<id>/server.js.
// Ohne Manifest plugins/<id>/plugin.json wird ein Eintrag ignoriert.
//
//   import picgine from './picgine/server';
//   export default { picgine };

export default {};
