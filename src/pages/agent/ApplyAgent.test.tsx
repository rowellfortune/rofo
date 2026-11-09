import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { authValue, userWith } from '../../test/mocks';
import { currentUrl, makeApplication, renderAt } from '../../test/utils';
import { ApplyAgent } from './ApplyAgent';

const h = vi.hoisted(() => ({
  auth: {} as ReturnType<typeof import('../../test/mocks').authValue>,
  api: { apiMyApplication: vi.fn(), apiSubmitApplication: vi.fn() },
}));
vi.mock('../../api/applications', () => h.api);
vi.mock('../../state/AuthContext', () => ({ useAuth: () => h.auth }));

beforeEach(() => {
  h.auth = authValue({ user: userWith(['Client']) });
  h.api.apiMyApplication.mockResolvedValue(null);
  h.api.apiSubmitApplication.mockImplementation(async (input: object) => makeApplication({ ...input, status: 'PENDING' }));
});
const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}`));
const open = () => renderAt(<ApplyAgent />, { route: '/agent/apply', path: '/agent/apply' });

describe('ApplyAgent: who sees what', () => {
  test('demo build, loading and signed out', () => {
    h.auth = authValue({ enabled: false });
    const a = open();
    expect(screen.getByText(/Applications open once the backend is connected/)).toBeInTheDocument();
    a.unmount();
    h.auth = authValue({ loading: true });
    const b = open();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    b.unmount();
    h.auth = authValue();
    open();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=/agent/apply');
  });

  test('existing agents are sent to the dashboard', () => {
    h.auth = authValue({ user: userWith(['Agent']) });
    open();
    expect(screen.getByRole('heading', { name: 'You are an agent' })).toBeInTheDocument();
    expect(h.api.apiMyApplication).not.toHaveBeenCalled();
  });

  test('pending application: status card, no form', async () => {
    h.api.apiMyApplication.mockResolvedValue(makeApplication());
    open();
    expect(await screen.findByRole('heading', { name: 'Application received' })).toBeInTheDocument();
    expect(screen.getByText(/Thanks, Alex\. An admin will review Alex Realty/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit application' })).not.toBeInTheDocument();
  });
});

describe('ApplyAgent: the form', () => {
  test('the name is prefilled from the account', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'Submit application' })).toBeInTheDocument();
    expect(field('Full name')).toHaveValue('Me Myself');
  });

  test('invalid fields are flagged before sending', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Submit application' }));
    expect(screen.getByText('Fix the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('Agency needs at least 2 characters')).toBeInTheDocument();
    expect(h.api.apiSubmitApplication).not.toHaveBeenCalled();
    // Typing in a field clears its own error.
    await user.type(field('Agency or business name'), 'Sun Realty');
    expect(screen.queryByText('Agency needs at least 2 characters')).not.toBeInTheDocument();
  });

  test('a valid form is sent and the page switches to the status card', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('button', { name: 'Submit application' });
    await user.type(field('Phone'), '+597 555 0100');
    await user.type(field('Agency or business name'), 'Sun Realty');
    await user.type(field('Registration or licence number'), 'KKF-123');
    await user.type(field('Country'), 'Suriname');
    await user.type(field('Website'), 'https://sun.sr');
    await user.type(field('Tell us about your work'), 'Homes in Paramaribo for twelve years.');
    await user.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(h.api.apiSubmitApplication).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Me Myself', agency: 'Sun Realty', registrationNo: 'KKF-123', country: 'Suriname', website: 'https://sun.sr',
    }));
    expect(await screen.findByRole('heading', { name: 'Application received' })).toBeInTheDocument();
  });

  test('a rejected application can be fixed and sent again, prefilled', async () => {
    h.api.apiMyApplication.mockResolvedValue(makeApplication({ status: 'REJECTED', reviewNote: 'Licence unreadable.' }));
    open();
    expect(await screen.findByRole('status')).toHaveTextContent('Your last application was not approved. Licence unreadable.');
    expect(field('Agency or business name')).toHaveValue('Alex Realty');
    expect(screen.getByRole('button', { name: 'Apply again' })).toBeInTheDocument();
  });

  test('a revoked agent sees why and may apply again', async () => {
    h.api.apiMyApplication.mockResolvedValue(makeApplication({ status: 'REVOKED', reviewNote: 'Fake listings.' }));
    open();
    expect(await screen.findByRole('status')).toHaveTextContent('Your agent access was removed. Fake listings.');
  });

  test('a server error is shown above the form', async () => {
    h.api.apiMyApplication.mockRejectedValue(new Error('Service unavailable'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  });
});

describe('ApplyAgent: after approval', () => {
  beforeEach(() => { h.api.apiMyApplication.mockResolvedValue(makeApplication({ status: 'APPROVED' })); });

  test('activating refreshes the session and opens the dashboard', async () => {
    h.auth.refresh = vi.fn(async () => userWith(['Agent']));
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Activate agent access' }));
    expect(h.auth.refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(currentUrl()).toBe('/agent'));
  });

  test('if the group is not in the token yet, says to try again', async () => {
    h.auth.refresh = vi.fn(async () => userWith(['Client']));
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Activate agent access' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your access is not active yet.');
    expect(currentUrl()).toBe('/agent/apply');
  });
});
