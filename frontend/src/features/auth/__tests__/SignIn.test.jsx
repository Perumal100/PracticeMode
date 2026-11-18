// US-01 sign-in and learner accounts. The API is a test double.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import SignIn from '../SignIn.jsx';

function setup(api = {}) {
  const onSignedIn = vi.fn();
  const full = { signIn: vi.fn(), register: vi.fn(), ...api };
  render(<SignIn onSignedIn={onSignedIn} api={full} />);
  return { onSignedIn, api: full };
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const createAccount = () => fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));

describe('SignIn', () => {
  it('AC-01: any role signs in with a username and password', async () => {
    const user = { id: '1', displayName: 'Rita', role: 'FORM_REVIEWER' };
    const { onSignedIn, api } = setup({ signIn: vi.fn().mockResolvedValue(user) });
    type('Username', 'reviewer');
    type('Password', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(user));
    expect(api.signIn).toHaveBeenCalledWith('reviewer', 'secret');
  });

  it('missing sign-in details are caught before calling the server', () => {
    const { api } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your username.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('AC-02: invalid credentials show an error and do not sign in', async () => {
    const { onSignedIn } = setup({ signIn: vi.fn().mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x')) });
    type('Username', 'maya_r');
    type('Password', 'wrong-password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('a learner creates an account with a username, a display name and a password, and no email', async () => {
    const user = { id: '7', displayName: 'Maya', role: 'LEARNER' };
    const { onSignedIn, api } = setup({ register: vi.fn().mockResolvedValue(user) });
    createAccount();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    type('Username', 'maya_r');
    type('Display name', '  Maya ');
    type('Password', 'practise-forms-42');
    type('Confirm password', 'practise-forms-42');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(user));
    expect(api.register).toHaveBeenCalledWith({ username: 'maya_r', displayName: 'Maya', password: 'practise-forms-42' });
  });

  it('account details are checked before calling the server', () => {
    const { api } = setup();
    createAccount();
    type('Username', 'm a');
    type('Password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/Use 3 to 30 letters/)).toBeVisible();
    expect(screen.getByText('Choose a name to show while you practise.')).toBeVisible();
    expect(screen.getByText('Use at least 8 characters.')).toBeVisible();
    type('Password', 'practise-forms-42');
    type('Confirm password', 'practise-forms-41');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('The passwords do not match.')).toBeVisible();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('a taken username or a weak password reported by the server is shown on its field', async () => {
    const register = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, 'USERNAME_TAKEN', 'x'))
      .mockRejectedValueOnce(new ApiError(400, null, 'x', { password: ['This password is too common.'] }));
    setup({ register });
    createAccount();
    type('Username', 'maya_r');
    type('Display name', 'Maya');
    type('Password', 'password1');
    type('Confirm password', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That username is taken. Choose another one.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This password is too common.')).toBeVisible();
  });
});
