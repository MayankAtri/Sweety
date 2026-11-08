import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthScreen from '../../src/components/AuthScreen.jsx';
import { api } from '../../src/lib.js';

vi.mock('../../src/lib.js', async importOriginal => ({
  ...await importOriginal(),
  api: vi.fn(),
}));
beforeEach(() => { api.mockReset(); });
function setup() {
  const onAuthenticated = vi.fn();
  render(<AuthScreen onAuthenticated={onAuthenticated} />);
  return { user: userEvent.setup(), onAuthenticated };
}
const submit = label => screen.getAllByRole('button', { name: label, exact: true }).at(-1);

async function fillCredentials(user, password = 'PatientPassword123!') {
  await user.type(screen.getByLabelText('Email address'), 'patient@example.com');
  await user.type(screen.getByLabelText('Password', { exact: true }), password);
}

describe('AuthScreen', () => {
  it('blocks invalid email without calling the API', async () => {
    const { user } = setup();
    await user.click(submit('Log in'));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.');
    expect(api).not.toHaveBeenCalled();
  });

  it('validates signup name and password before submitting trimmed fields', async () => {
    const { user, onAuthenticated } = setup();
    const account = { id: '1', name: 'Patient Name', email: 'patient@example.com' };
    api.mockResolvedValue({ user: account });
    await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
    await user.click(submit('Create account'));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a name');
    await user.type(screen.getByLabelText('Full name'), ' Patient Name ');
    await fillCredentials(user, 'short');
    await user.click(submit('Create account'));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(api).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Password', { exact: true }));
    await user.type(screen.getByLabelText('Password', { exact: true }), 'PatientPassword123!');
    await user.click(submit('Create account'));
    expect(api).toHaveBeenCalledExactlyOnceWith('/auth/register', {
      method: 'POST', body: { name: 'Patient Name', email: 'patient@example.com', password: 'PatientPassword123!' },
    });
    expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith(account);
  });

  it('shows login rejection and retains email for retry without authenticating', async () => {
    const { user, onAuthenticated } = setup();
    api.mockRejectedValueOnce(new Error('Email or password is incorrect.'));
    await fillCredentials(user);
    await user.click(submit('Log in'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Email address')).toHaveValue('patient@example.com');
    expect(submit('Log in')).toBeEnabled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('fills the demo without submitting and supports showing and hiding its password', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Fill demo credentials/ }));
    expect(screen.getByLabelText('Email address')).toHaveValue('demo@sweety.example');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('SweetyDemo123!');
    expect(api).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
  });

  it('disables account switching and duplicate login attempts until the request completes', async () => {
    const { user, onAuthenticated } = setup();
    let finish;
    api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await fillCredentials(user);
    await user.click(submit('Log in'));
    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
    expect(screen.getByLabelText('Email address')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Logging in…' }));
    expect(api).toHaveBeenCalledTimes(1);
    const account = { id: '2', name: 'Patient', email: 'patient@example.com' };
    await act(async () => finish({ user: account }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(account));
  });

  it('clears errors and password visibility when switching account modes', async () => {
    const { user } = setup();
    await user.click(submit('Log in'));
    await user.type(screen.getByLabelText('Password', { exact: true }), 'temporary');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.click(screen.getByRole('button', { name: 'Create account', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
  });
});
