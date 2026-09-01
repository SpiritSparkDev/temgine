const path = require('path');

const { isPublicStaticAssetPath, resolvePublicAssetPath, getContentType } = require('../server');

describe('public static asset routing', () => {
  test('recognizes deployment static asset paths', () => {
    expect(isPublicStaticAssetPath('/extern_css/main.css')).toBe(true);
    expect(isPublicStaticAssetPath('/uploads/images/logo.png')).toBe(true);
    expect(isPublicStaticAssetPath('/assets/site/logo.svg')).toBe(true);
    expect(isPublicStaticAssetPath('/favicon/favicon.ico')).toBe(true);
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
});
