import fs from 'fs';
import path from 'path';
import { buildFieldTree, flattenFieldTree, describeFieldTree, countGroups } from '../lib/templateStructure';
import { extractTemplateVariables, extractRepeaterBlocks, guessInputType } from '../lib/templateParser';

const tree = (code, opts) => buildFieldTree(code, opts);
const desc = (code, opts) => describeFieldTree(tree(code, opts).nodes);

test('verschachtelte section/div mit Titel aus Überschrift', () => {
  const html = `<section class="hero"><h1>Willkommen {{x}}</h1>{{title}}
    <div class="hero-text"><span>{{lead}}</span>{{{body}}}</div><div class="cta">{{button}}{{link}}</div></section>`;
  expect(desc(html)).toBe(
    'section: Willkommen\n  x\n  title\n  div: Hero text\n    lead\n    body\n  div: Cta\n    button\n    link'
  );
});

test('Einzelkind-Wrapper werden aufgelöst, Kind-Gruppe behält Titel', () => {
  const html = '<div class="outer"><div class="inner-card"><h3>Karte</h3>{{a}}{{b}}</div></div>';
  expect(desc(html)).toBe('div: Karte\n  a\n  b');
  // Wrapper mit einem Feld: Feld wandert hoch, keine Gruppe
  const one = tree('<div class="x"><p>{{a}}</p></div>');
  expect(one.hasStructure).toBe(false);
  expect(one.nodes).toEqual([{ kind: 'field', name: 'a' }]);
});

test('semantischer Wrapper + div mit Einzelkind verschmilzt zur semantischen Gruppe', () => {
  const html = '<section id="kontakt"><div class="contact-box">{{a}}{{b}}</div></section>';
  const { nodes } = tree(html);
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({ tag: 'section', semantic: true, label: 'Contact box', labelSource: 'class' });
  // Semantischer äußerer Tag mit Einzelkind-Gruppe, die selbst semantisch ist: innere bleibt
  const two = tree('<section><article data-label="Beitrag">{{a}}{{b}}</article></section>').nodes;
  expect(two[0]).toMatchObject({ tag: 'article', label: 'Beitrag', labelSource: 'data-label' });
});

test('div ohne Klasse bildet Gruppe mit Fallback-Titel', () => {
  const { nodes, hasStructure } = tree('{{top}}<div>{{a}}{{b}}</div>');
  expect(hasStructure).toBe(true);
  expect(nodes[0]).toEqual({ kind: 'field', name: 'top' });
  expect(nodes[1]).toMatchObject({ kind: 'group', tag: 'div', semantic: false, label: 'Gruppe', labelSource: 'fallback', id: null, className: null });
});

test('Titelquellen und Priorität', () => {
  const label = (open) => tree(`<div ${open}>{{a}}{{b}}</div>`).nodes[0];
  expect(label('data-label="Eins" aria-label="Zwei" class="k"')).toMatchObject({ label: 'Eins', labelSource: 'data-label' });
  expect(label('aria-label="Zwei" class="k"')).toMatchObject({ label: 'Zwei', labelSource: 'aria-label' });
  expect(label('class="container wrapper col-md-6 hero-text"')).toMatchObject({ label: 'Hero text', labelSource: 'class' });
  expect(label('class="container row" id="my_id"')).toMatchObject({ label: 'My id', labelSource: 'id', id: 'my_id' });
  expect(label('class="wrapper inner"')).toMatchObject({ label: 'Gruppe', labelSource: 'fallback' });
  const h = tree('<div class="k"><h2>{{t}}</h2><h3>Echt</h3>{{a}}{{b}}</div>').nodes[0];
  expect(h).toMatchObject({ label: 'Echt', labelSource: 'heading' });
  const long = tree(`<div><h2>${'x'.repeat(80)}</h2>{{a}}{{b}}</div>`).nodes[0];
  expect(long.label).toHaveLength(40);
});

test('Bedingungssektionen sind transparent, Reihenfolge bleibt', () => {
  const html = '<div class="a">{{one}}{{#flag}}{{two}}{{/flag}}{{^none}}{{three}}{{/none}}{{#if:cond}}{{four}}{{/if:cond}}</div>';
  // 'flag.two': extractTemplateVariables benennt Felder normaler Sektionen so
  expect(flattenFieldTree(tree(html).nodes)).toEqual(['one', 'flag.two', 'three', 'cond', 'four']);
  expect(desc(html)).toMatch(/^div: A\n {2}one\n {2}flag.two\n/);
  expect(countGroups(tree(html).nodes)).toBe(1);
});

test('Repeater an seiner Position; Unterfelder nicht im Baum', () => {
  const html = '<section><h2>Liste</h2>{{intro}}{{#each:Punkte}}<div><b>{{Titel}}</b><i>{{Text}}</i></div>{{/each:Punkte}}{{outro}}</section>';
  expect(desc(html)).toBe('section: Liste\n  intro\n  repeater: Punkte\n  outro');
  expect(flattenFieldTree(tree(html).nodes)).not.toContain('Titel');
});

test('Zeilenbildung: nur Text/URL gleichen Typs, max 3, nie über Gruppengrenzen', () => {
  const types = { a: 'text', b: 'text', c: 'text', d: 'text', u1: 'url', u2: 'url', t: 'textarea', t2: 'textarea', img: 'image' };
  const typeOf = (n) => types[n];
  expect(desc('<div>{{a}}{{b}}{{c}}{{d}}{{t}}{{t2}}</div>', { typeOf })).toBe('div: Gruppe\n  row(a, b)\n  row(c, d)\n  t\n  t2');
  expect(desc('<div>{{a}}{{b}}{{c}}{{u1}}{{u2}}{{img}}</div>', { typeOf })).toBe('div: Gruppe\n  row(a, b, c)\n  row(u1, u2)\n  img');
  // Gruppengrenze trennt, einzelnes Feld bleibt Feld
  const html = '<div>{{a}}<div class="in">{{b}}{{c}}</div></div>';
  expect(desc(html, { typeOf })).toBe('div: Gruppe\n  a\n  div: In\n    row(b, c)');
  // ohne typeOf keine Rows
  expect(desc('<div>{{a}}{{b}}</div>')).toBe('div: Gruppe\n  a\n  b');
  // Reihenfolge bleibt trotz Rows
  expect(flattenFieldTree(tree('<div>{{a}}{{b}}{{t}}</div>', { typeOf }).nodes)).toEqual(['a', 'b', 't']);
});

test('Fallback ohne Struktur', () => {
  const r = tree('<p>{{a}}</p><span>{{b}}</span>');
  expect(r.hasStructure).toBe(false);
  expect(flattenFieldTree(r.nodes)).toEqual(['a', 'b']);
  expect(tree('')).toEqual({ nodes: [], hasStructure: false });
});

test('tolerantes Parsen: void, Kommentare, script/style, Attribute, unbalanciert', () => {
  const html = `<!-- {{ghost}} --><style>.a{}</style><script>var x = "<div>{{nope}}";</script>
    <div class="box"><img src="{{pic:image}}"><br>{{a}}<p>{{b}}</div><div class="open">{{c}}{{d}}`;
  expect(desc(html)).toBe('div: Box\n  pic\n  a\n  b\ndiv: Open\n  c\n  d\nghost\nnope');
  // ghost/nope: die bestehende Extraktion ignoriert Kommentare/Script nicht -> Feldmenge identisch, ans Ende gehängt
});

test('Duplikate nur an erster Position, fehlende Felder am Ende', () => {
  const { nodes } = tree('<div>{{a}}{{b}}</div>{{a}}{{{>partial}}}');
  expect(flattenFieldTree(nodes)).toEqual(['a', 'b']);
});

test('explizite Gruppen gewinnen und bündeln an Position des ersten Feldes', () => {
  const html = '<section><h2>Seite</h2>{{x:text|Inhalt}}<div class="d">{{y}}{{z}}</div>{{w:text|Inhalt}}</section>';
  expect(desc(html)).toBe('section: Seite\n  group: Inhalt\n    x\n    w\n  div: D\n    y\n    z');
  const g = tree(html).nodes[0].children[0];
  expect(g).toMatchObject({ kind: 'group', tag: null, semantic: false, labelSource: 'explicit' });
  // explizite Gruppe zieht Feld aus DOM-Gruppe, übrige Einzelkinder lösen sich auf
  expect(desc('<div class="d">{{y:text|G}}{{z}}</div>')).toBe('div: D\n  group: G\n    y\n  z');
});

describe('echte Block-Templates', () => {
  const root = path.join(__dirname, '..', 'public', 'assets', 'template', 'block');
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p);
  });
  walk(root);
  const typeOf = guessInputType;

  test('es gibt Templates', () => expect(files.length).toBeGreaterThan(3));

  // Vollständigkeit: gleiche Feldmenge und Repeater wie die bestehende Extraktion.
  // Reihenfolge: gleich, außer "section.feld"-Felder (extractTemplateVariables hängt sie ans Ende)
  // und explizite Gruppen (werden an Position des ersten Feldes gebündelt) — dort nur Mengengleichheit.
  test.each(files.map((f) => [path.relative(root, f), f]))('%s: vollständig', (_n, f) => {
    const code = fs.readFileSync(f, 'utf8');
    const { nodes } = buildFieldTree(code, { typeOf });
    const flat = flattenFieldTree(nodes);
    const expected = extractTemplateVariables(code);
    expect([...flat].sort()).toEqual([...expected].sort());
    expect(new Set(flat).size).toBe(flat.length);
    const reps = [];
    const find = (l) => l.forEach((n) => { if (n.kind === 'repeater') reps.push(n.name); if (n.children) find(n.children); });
    find(nodes);
    expect(reps.sort()).toEqual(extractRepeaterBlocks(code).map((r) => r.sectionName).sort());
    if (!/\|\w/.test(code) && !expected.some((e) => e.includes('.'))) expect(flat).toEqual(expected);
  });

  test('Hero: Section mit Kontakt-Div, Banner-Feld aus Attribut', () => {
    const code = fs.readFileSync(path.join(root, 'Hero.html'), 'utf8');
    expect(desc(code, { typeOf })).toBe(
      'section: Hero contact\n  row(Adresse, Telefon)\n  row(Email, Oeffnungszeiten)\nBanner Foto'
    );
  });

  test('Studio-Vorstellung: Repeater innerhalb der Gruppe', () => {
    const code = fs.readFileSync(path.join(root, 'Studio-Vorstellung.html'), 'utf8');
    const out = desc(code);
    expect(out).toMatch(/^section: Section\n {2}Titel\n {2}div: Section narrow\n {4}repeater: Merkmale\n {4}Schlusstext/);
  });

  test('Textgrid: nur Repeater → keine Struktur', () => {
    const code = fs.readFileSync(path.join(root, 'Textgrid.html'), 'utf8');
    expect(buildFieldTree(code).hasStructure).toBe(false);
  });
});
