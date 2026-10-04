/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsersViewModern from '../components/UsersViewModern';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { email: 'admin@example.com' } } }),
}));

function mockUsersResponse(users) {
  return Promise.resolve({ ok: true, json: async () => ({ users }) });
}

describe('UsersViewModern — eigenes Passwort ändern', () => {
  it('shows the password-change form for the current user with a password', async () => {
    global.fetch = jest.fn(() => mockUsersResponse([
      { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', hasPassword: true },
    ]));
    render(<UsersViewModern showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    expect(screen.getByLabelText('Aktuelles Passwort')).toBeTruthy();
    expect(screen.getByLabelText('Neues Passwort')).toBeTruthy();
    expect(screen.getByLabelText('Neues Passwort bestätigen')).toBeTruthy();
  });

  it('marks the current user card with a "Du"-badge', async () => {
    global.fetch = jest.fn(() => mockUsersResponse([
      { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', hasPassword: true },
      { id: 'u2', name: 'Other', email: 'other@example.com', role: 'EDITOR', hasPassword: true },
    ]));
    render(<UsersViewModern showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    expect(screen.getByText('Du')).toBeTruthy();
  });

  it('shows a hint instead of the form when the current user has no password (OAuth-only)', async () => {
    global.fetch = jest.fn(() => mockUsersResponse([
      { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', hasPassword: false },
    ]));
    render(<UsersViewModern showToast={() => {}} />);
    await waitFor(() => expect(screen.queryByText('Lade Benutzer...')).toBeNull());

    expect(screen.queryByLabelText('Aktuelles Passwort')).toBeNull();
    expect(screen.getByText(/kein Passwort/i)).toBeTruthy();
  });

  it('rejects mismatched new/confirm passwords without calling the API', async () => {
    global.fetch = jest.fn(() => mockUsersResponse([
      { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', hasPassword: true },
    ]));
    render(<UsersViewModern showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'current123' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'different1' } });

    const callsBefore = global.fetch.mock.calls.length;
    fireEvent.click(screen.getByText('Passwort ändern'));

    expect(await screen.findByText(/stimmen nicht überein/i)).toBeTruthy();
    expect(global.fetch.mock.calls.length).toBe(callsBefore);
  });

  it('submits to /api/users/change-password and shows a success toast', async () => {
    const showToast = jest.fn();
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/api/users/roles')) {
        return mockUsersResponse([{ id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', hasPassword: true }]);
      }
      if (String(url).includes('/api/users/change-password')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<UsersViewModern showToast={showToast} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'current123' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'newpassword1' } });
    fireEvent.click(screen.getByText('Passwort ändern'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Passwort erfolgreich geändert', 'success'));
    const changeCall = global.fetch.mock.calls.find(([url]) => String(url).includes('/api/users/change-password'));
    expect(changeCall).toBeTruthy();
    expect(JSON.parse(changeCall[1].body)).toEqual({ currentPassword: 'current123', newPassword: 'newpassword1' });
  });

  it('shows the server error message when the current password is wrong', async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/api/users/roles')) {
        return mockUsersResponse([{ id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', hasPassword: true }]);
      }
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Aktuelles Passwort ist falsch' }) });
    });
    render(<UsersViewModern showToast={() => {}} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'newpassword1' } });
    fireEvent.click(screen.getByText('Passwort ändern'));

    expect(await screen.findByText('Aktuelles Passwort ist falsch')).toBeTruthy();
  });
});
