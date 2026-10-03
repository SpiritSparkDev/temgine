/**
 * @jest-environment jsdom
 */
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

import React from 'react';
import { render, screen } from '@testing-library/react';
import SmartRichTextEditor from '../components/SmartRichTextEditor';

// WysiwygRichTextEditor mounts a real TipTap/ProseMirror editor, which needs
// more DOM APIs than jsdom provides. SmartRichTextEditor's own job is just
// the mode switch, so that's what this test covers — stub out both real
// editors to keep it fast and independent of their internals.
jest.mock('../components/RichTextEditor', () => function StubMarkdownEditor() {
  return <div data-testid="markdown-editor" />;
});
jest.mock('../components/WysiwygRichTextEditor', () => function StubWysiwygEditor() {
  return <div data-testid="wysiwyg-editor" />;
});

describe('SmartRichTextEditor', () => {
  it('renders the markdown editor by default (mode omitted)', () => {
    render(<SmartRichTextEditor value="" onChange={() => {}} />);
    expect(screen.getByTestId('markdown-editor')).toBeTruthy();
    expect(screen.queryByTestId('wysiwyg-editor')).toBeNull();
  });

  it('renders the markdown editor for mode="markdown"', () => {
    render(<SmartRichTextEditor mode="markdown" value="" onChange={() => {}} />);
    expect(screen.getByTestId('markdown-editor')).toBeTruthy();
  });

  it('renders the WYSIWYG editor for mode="wysiwyg"', () => {
    render(<SmartRichTextEditor mode="wysiwyg" value="" onChange={() => {}} />);
    expect(screen.getByTestId('wysiwyg-editor')).toBeTruthy();
    expect(screen.queryByTestId('markdown-editor')).toBeNull();
  });
});
