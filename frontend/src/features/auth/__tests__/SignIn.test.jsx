// US-01 sign-in screen. The API is a test double.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import SignIn from '../SignIn.jsx';

function setup(api = {}) {
  const onSignedIn = vi.fn();
  const full = { signInLearner: vi.fn(), signInStaff: vi.fn(), ...api };
  render(<SignIn onSignedIn={onSignedIn} api={full} />);
  return { onSignedIn, api: full };
}

describe('SignIn', () => {
  it('AC-01: a learner signs in with a display name only', async () => {
    const user = { id: '7', displayName: 'Alex', role: 'LEARNER' };
    const { onSignedIn, api } = setup({ signInLearner: vi.fn().mockResolvedValue(user) });
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Alex ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(user));
    expect(api.signInLearner).toHaveBeenCalledWith('Alex');
  });

  it('a blank display name is caught before calling the server', () => {
    const { api } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
    expect(api.signInLearner).not.toHaveBeenCalled();
  });

  it('AC-01: staff sign in with a username and password', async () => {
    const user = { id: '1', displayName: 'Rita', role: 'FORM_REVIEWER' };
    const { onSignedIn, api } = setup({ signInStaff: vi.fn().mockResolvedValue(user) });
    fireEvent.click(screen.getByRole('tab', { name: 'Staff sign-in' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'reviewer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(user));
    expect(api.signInStaff).toHaveBeenCalledWith('reviewer', 'secret');
  });

  it('AC-02: invalid credentials show an error and do not sign in', async () => {
    const { onSignedIn } = setup({ signInStaff: vi.fn().mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x')) });
    fireEvent.click(screen.getByRole('tab', { name: 'Staff sign-in' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'reviewer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
