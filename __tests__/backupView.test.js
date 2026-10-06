/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BackupView from '../components/BackupView';
import { BACKUP_CATEGORIES } from '../lib/backupCategories';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ backups: [] }) });
});

describe('BackupView — per-category backup selection', () => {
  it('renders a checkbox for every backup category, checked by default', async () => {
    render(<BackupView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    for (const cat of BACKUP_CATEGORIES) {
      const checkbox = screen.getByText(cat.label).closest('label').querySelector('input[type="checkbox"]');
      expect(checkbox.checked).toBe(true);
    }
  });

  it('unchecking all categories disables the export button', async () => {
    render(<BackupView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const exportButton = screen.getByText('Projekttransfer-ZIP').closest('button');
    expect(exportButton.disabled).toBe(false);

    fireEvent.click(screen.getByText('Keine'));
    expect(exportButton.disabled).toBe(true);
  });

  it('"Alle auswählen" re-checks every category', async () => {
    render(<BackupView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Keine'));
    fireEvent.click(screen.getByText('Alle auswählen'));

    for (const cat of BACKUP_CATEGORIES) {
      const checkbox = screen.getByText(cat.label).closest('label').querySelector('input[type="checkbox"]');
      expect(checkbox.checked).toBe(true);
    }
  });

  it('exports with a categories query param matching the checked boxes', async () => {
    render(<BackupView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Keine'));
    const blogCheckbox = screen.getByText('Blog / News').closest('label').querySelector('input[type="checkbox"]');
    fireEvent.click(blogCheckbox);

    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: null,
      blob: async () => new Blob(['{}']),
    });

    fireEvent.click(screen.getByText('Projekttransfer-ZIP'));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url]) => String(url).includes('/api/admin/export'));
      expect(call).toBeTruthy();
      expect(call[0]).toContain('categories=blog');
    });
  });
});
