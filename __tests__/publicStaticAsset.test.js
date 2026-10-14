const path = require('path');

const { isPublicStaticAssetPath, resolvePublicAssetPath, getContentType, parseByteRange } = require('../server');

describe('public static asset routing', () => {
  test('recognizes deployment static asset paths', () => {
    expect(isPublicStaticAssetPath('/extern_css/main.css')).toBe(true);
    expect(isPublicStaticAssetPath('/uploads/images/logo.png')).toBe(true);
    expect(isPublicStaticAssetPath('/assets/site/logo.svg')).toBe(true);
    expect(isPublicStaticAssetPath('/favicon/favicon.ico')).toBe(true);
    expect(isPublicStaticAssetPath('/__live/blog/index.html')).toBe(true); // Live-Snapshot, entsteht erst zur Laufzeit
    expect(isPublicStaticAssetPath('/hello/world')).toBe(false);
  });

  test('resolves asset paths inside the public directory only', () => {
    const publicRoot = path.join(process.cwd(), 'public');

    expect(resolvePublicAssetPath('/extern_css/main.css')).toBe(path.join(publicRoot, 'extern_css', 'main.css'));
    expect(resolvePublicAssetPath('/uploads/images/logo.png')).toBe(path.join(publicRoot, 'uploads', 'images', 'logo.png'));
    expect(() => resolvePublicAssetPath('/../secret.txt')).toThrow();
  });

  test('uses a browser-safe content type for CSS', () => {
    expect(getContentType('/extern_css/main.css')).toBe('text/css; charset=utf-8');
    expect(getContentType('/uploads/images/logo.png')).toBe('image/png');
  });

  test('serves PDFs with application/pdf so browsers display them inline instead of downloading', () => {
    expect(getContentType('/uploads/files/handout.pdf')).toBe('application/pdf');
  });

  test('serves video and audio with their media type (nosniff would block octet-stream)', () => {
    expect(getContentType('/uploads/video/teaser.mp4')).toBe('video/mp4');
    expect(getContentType('/uploads/video/teaser.webm')).toBe('video/webm');
    expect(getContentType('/uploads/audio/track.mp3')).toBe('audio/mpeg');
  });

  test('parses single byte ranges for 206 responses (Safari/iOS video playback)', () => {
    expect(parseByteRange('bytes=0-1023', 5000)).toEqual({ start: 0, end: 1023 });
    expect(parseByteRange('bytes=4000-', 5000)).toEqual({ start: 4000, end: 4999 });
    expect(parseByteRange('bytes=-500', 5000)).toEqual({ start: 4500, end: 4999 });
    expect(parseByteRange('bytes=0-99999', 5000)).toEqual({ start: 0, end: 4999 });
    expect(parseByteRange('bytes=6000-7000', 5000)).toBe('invalid');
    expect(parseByteRange('bytes=0-1,5-9', 5000)).toBeNull();
    expect(parseByteRange(undefined, 5000)).toBeNull();
  });
});
