// Läuft vor jeder Testdatei (jest.config.cjs → setupFiles).
//
// jsdom (Standard-Testumgebung) kennt kein setImmediate. Lädt ein Test
// Next-Serverinterna, merkt sich Next beim Laden das "originale" setImmediate
// der Umgebung – hier undefined – und ersetzt danach setImmediate im Node-Modul
// `timers`. Dieses Modul teilen sich alle Testdateien eines Jest-Workers: jeder
// spätere React-Test im selben Worker ruft in act() das gepatchte setImmediate
// auf und stürzt mit "Cannot read properties of undefined (reading 'apply')" ab.
// Je nach Verteilung der Dateien auf die Worker traf das mal appExternJs, mal
// wysiwygRichTextEditor. Mit dem echten setImmediate aus Node merkt sich Next
// nie undefined.
if (typeof globalThis.setImmediate !== 'function') {
  const timers = require('timers');
  globalThis.setImmediate = timers.setImmediate;
  globalThis.clearImmediate = timers.clearImmediate;
}
