/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// lib/templateEngine.js (pulled in for navPlaceholderSlug) requires marked,
// which ships ESM-only — this repo's jest config doesn't transform it (same
// pre-existing gap as __tests__/templateEngine.test.js).
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));
jest.mock('next/dynamic', () => () => function StubCodeEditor({ value, onChange }) {
  return <textarea data-testid="code-editor" value={value || ''} onChange={(e) => onChange?.(e.target.value)} />;
});

const GlobalPagesView = require('../components/GlobalPagesView').default;

function mockFetchImpl(url) {
  if (String(url).startsWith('/api/global-pages')) {
    return Promise.resolve({ ok: true, json: async () => [] });
  }
  if (String(url).startsWith('/api/css')) {
    return Promise.resolve({ ok: true, json: async () => ({ files: [] }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
}

beforeEach(() => {
  global.fetch = jest.fn(mockFetchImpl);
});

describe('GlobalPagesView — Widget role', () => {
  it('renders a Widget tab alongside Footer/Navigation tabs', async () => {
    render(<GlobalPagesView showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText('Widget')).toBeTruthy();
  });

  it('switching to Widget and creating a new one shows the Widget presets, not nav/footer presets', async () => {
    render(<GlobalPagesView showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Widget'));
    fireEvent.click(screen.getByText('Neu'));

    expect(screen.getByText('Info-Box')).toBeTruthy();
    expect(screen.getByText('CTA-Box')).toBeTruthy();
    expect(screen.queryByText('Responsive Combo (Desktop + Mobile)')).toBeNull();
  });

  it('the Widget editor has no navigation.css side panel', async () => {
    render(<GlobalPagesView showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Widget'));
    fireEvent.click(screen.getByText('Neu'));

    expect(screen.queryByText('navigation.css')).toBeNull();
  });

  it('applying a Widget preset fills the editor and uses it as the entry name', async () => {
    render(<GlobalPagesView showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Widget'));
    fireEvent.click(screen.getByText('Neu'));
    fireEvent.click(screen.getByText('Info-Box'));

    const nameInput = screen.getByPlaceholderText('Name dieses Widgets…');
    expect(nameInput.value).toBe('Info-Box');
  });
});
