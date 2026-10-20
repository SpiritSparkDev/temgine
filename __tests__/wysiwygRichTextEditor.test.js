/**
 * @jest-environment jsdom
 */
jest.mock('marked', () => ({ marked: { parse: (s) => `<p>${s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>` } }));

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

  it('speichert HTML und behält Leerzeilen, Überschriften und Trennlinien', async () => {
    const onChange = jest.fn();
    render(<WysiwygRichTextEditor value={'<h2>Titel</h2><p>a</p><p><br></p><hr><p>b</p>'} onChange={onChange} />);
    await act(async () => {});
    expect(document.querySelector('.wte-content h2').textContent).toBe('Titel');
    expect(document.querySelector('.wte-content hr')).toBeTruthy();
    expect(document.querySelectorAll('.wte-content p').length).toBe(3);
  });

  it('zeigt Werkzeugleiste mit Ansichten und Tabellen-/Codeblock-Befehlen', async () => {
    render(<WysiwygRichTextEditor value="" onChange={() => {}} />);
    await act(async () => {});
    ['Fett', 'Unterstrichen', 'Überschrift 5', 'Codeblock', 'Tabelle einfügen', 'Link einfügen', 'Markdown-Ansicht', 'Split-Ansicht'].forEach((t) => {
      expect(screen.getByTitle(t)).toBeTruthy();
    });
  });

  it('Markdown-Ansicht zeigt Quelltext, Leerzeilen als <br>-Zeile', async () => {
    localStorage.setItem('temgine.richText.v1', JSON.stringify({ view: 'md' }));
    render(<WysiwygRichTextEditor value={'<p>a</p><p><br></p><p>b</p>'} onChange={() => {}} />);
    await act(async () => {});
    const src = document.querySelector('textarea');
    expect(src.value).toBe(['a', '', '<br>', '', 'b'].join('\n'));
    localStorage.clear();
  });

  it('behält target, rel und title an Links', async () => {
    render(<WysiwygRichTextEditor value={'<p><a href="/x" target="_blank" rel="noopener noreferrer nofollow" title="T">L</a></p>'} onChange={() => {}} />);
    await act(async () => {});
    const a = document.querySelector('.wte-content a');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(a.getAttribute('title')).toBe('T');
  });

  it('hides the toolbar entirely when readOnly', async () => {
    render(<WysiwygRichTextEditor value="Text" onChange={() => {}} readOnly />);
    await act(async () => {});
    expect(screen.queryByTitle('Fett')).toBeNull();
  });
});
