/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import WysiwygRichTextEditor from '../components/WysiwygRichTextEditor';

describe('WysiwygRichTextEditor', () => {
  it('mounts and renders markdown content as formatted text', async () => {
    render(<WysiwygRichTextEditor value={'Hallo **Welt**'} onChange={() => {}} />);
    // TipTap initializes asynchronously (useEffect-driven) — flush it.
    await act(async () => {});
    expect(document.querySelector('.wte-content')).toBeTruthy();
    const strong = document.querySelector('.wte-content strong');
    expect(strong).toBeTruthy();
    expect(strong.textContent).toBe('Welt');
  });

  it('renders only the requested toolbar buttons', async () => {
    render(<WysiwygRichTextEditor value="" onChange={() => {}} toolbar={['bold']} />);
    await act(async () => {});
    expect(screen.getByTitle('Fett')).toBeTruthy();
    expect(screen.queryByTitle('Kursiv')).toBeNull();
    expect(screen.queryByTitle('Link einfügen')).toBeNull();
  });

  it('hides the toolbar entirely when readOnly', async () => {
    render(<WysiwygRichTextEditor value="Text" onChange={() => {}} readOnly />);
    await act(async () => {});
    expect(screen.queryByTitle('Fett')).toBeNull();
  });
});
