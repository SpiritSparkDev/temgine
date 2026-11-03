const { parseCssOutline } = require('../lib/cssOutline');

test('Selektoren, @-Regeln und Variablen mit Zeilennummer', () => {
  const css = [
    '/* .hidden { } */',
    ':root { --brand: #f00; }',
    '',
    '.a,',
    '.b > .c:not(.d, .e) { content: "{"; color: red }',
    '@media (max-width: 600px) {',
    '  .a { margin: 0 }',
    '}',
  ].join('\n');
  expect(parseCssOutline(css).map(e => `${e.line}:${e.kind}:${e.name}`)).toEqual([
    '2:selector::root',
    '2:var:--brand',
    '4:selector:.a',
    '5:selector:.b > .c:not(.d, .e)',
    '6:at:@media (max-width: 600px)',
    '7:selector:.a',
  ]);
});
