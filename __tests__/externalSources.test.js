jest.disableAutomock();
jest.mock('../lib/prisma', () => ({ prisma: {} }));

const { cleanRel, safeSegment, parsePropfind } = require('../lib/externalSources');

test('cleanRel entfernt .. und doppelte Slashes', () => {
  expect(cleanRel('/a/../b//c/')).toBe('a/b/c');
  expect(cleanRel('..\\..\\x')).toBe('x');
});

test('safeSegment normalisiert Namen wie der Datei-Upload', () => {
  expect(safeSegment('Schöne Größe.jpg')).toBe('Schoene_Groesse.jpg');
});

test('parsePropfind überspringt den Ordner selbst und erkennt Ordner/Dateien', () => {
  const xml = `<d:multistatus xmlns:d="DAV:">
    <d:response><d:href>/remote.php/dav/files/u/Fotos/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
    <d:response><d:href>/remote.php/dav/files/u/Fotos/Urlaub%202024/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
    <d:response><d:href>/remote.php/dav/files/u/Fotos/a.jpg</d:href><d:propstat><d:prop><d:getcontentlength>1234</d:getcontentlength><d:resourcetype/></d:prop></d:propstat></d:response>
  </d:multistatus>`;
  expect(parsePropfind(xml)).toEqual([
    { name: 'Urlaub 2024', isDir: true, size: 0 },
    { name: 'a.jpg', isDir: false, size: 1234 },
  ]);
});
