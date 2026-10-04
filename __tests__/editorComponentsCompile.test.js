// Guards against orphaned/dead code after a component's closing brace
// (found and fixed in ContentEntryEditor.js: leftover pre-refactor JSX and
// a duplicate <style jsx> block after the real `}` made the whole module
// fail to compile). Nothing else imported these components directly, so
// the break went unnoticed. A plain require() is enough — a syntax error
// anywhere in the module throws before this test body even runs.
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

describe('editor components compile cleanly', () => {
  it.each([
    'SmartRichTextEditor',
    'WysiwygRichTextEditor',
    'RichTextEditor',
    'ContentEntryEditor',
    'BlogPostEditor',
    'PageEditor',
    'GlobalPagesView',
  ])('%s', (name) => {
    expect(() => require(`../components/${name}`)).not.toThrow();
  });
});
