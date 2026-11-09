import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { poolsValue } from '../test/mocks';
import { makePool, renderAt } from '../test/utils';
import { PoolDetail } from './PoolDetail';

// Pools come from a fake context. The home is l1 from the demo data, so useListing finds it.
const pools = vi.hoisted(() => ({ value: {} as ReturnType<typeof import('../test/mocks').poolsValue> }));
vi.mock('../state/PoolsContext', () => ({ usePools: () => pools.value }));

const pool = (over = {}) => makePool({ listingId: 'l1', ...over });
beforeEach(() => { pools.value = poolsValue({ pools: [pool()], meId: 'u1' }); });
const open = (id = 'p1') => renderAt(<PoolDetail />, { route: `/pools/${id}`, path: '/pools/:id' });

describe('PoolDetail', () => {
  test('asks the context to load full detail for this pool', () => {
    open();
    expect(pools.value.loadPool).toHaveBeenCalledWith('p1');
  });

  test('signed out: sign in link back to this pool', () => {
    pools.value = poolsValue({ needsAuth: true });
    open();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Fpools%2Fp1');
  });

  test('unknown pool: not found, or loading while the list loads', () => {
    pools.value = poolsValue({ pools: [] });
    const { unmount } = open('zz');
    expect(screen.getByRole('heading', { name: 'Pool not found' })).toBeInTheDocument();
    unmount();
    pools.value = poolsValue({ pools: [], loading: true });
    open('zz');
    expect(screen.getByText('Loading pool...')).toBeInTheDocument();
  });

  test('member view: shares table marks me, and progress shows the raised total', () => {
    open();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Anita (you)');
    expect(rows[1]).toHaveTextContent('75.0%'); // 600 of 800 paid in
    expect(rows[2]).toHaveTextContent('Kevin');
    expect(screen.getByText('$800')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'You are in this pool' })).toBeInTheDocument();
  });

  test('member who paid in cannot leave, can pay this month', async () => {
    open();
    expect(screen.queryByRole('button', { name: 'Leave pool' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pay this month (demo)' }));
    expect(pools.value.contribute).toHaveBeenCalledWith('p1');
  });

  test('member with nothing paid in can leave', async () => {
    pools.value = poolsValue({ meId: 'u9', pools: [pool({ members: [...pool().members, { id: 'u9', name: 'Me', monthly: 100, contributed: 0, joinedAt: '2026-03-01' }] })] });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Leave pool' }));
    expect(pools.value.leavePool).toHaveBeenCalledWith('p1');
  });

  test('API mode members do not self pay: escrow note instead', () => {
    pools.value = poolsValue({ pools: [pool()], meId: 'u1', canSelfPay: false });
    open();
    expect(screen.queryByRole('button', { name: /Pay this month/ })).not.toBeInTheDocument();
    expect(screen.getByText(/confirmed through escrow/)).toBeInTheDocument();
  });

  test('visitor: open seats and a join with the chosen amount', async () => {
    pools.value = poolsValue({ pools: [pool()], meId: 'stranger' });
    open();
    expect(screen.getByText('2 seats open.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '450' } });
    await userEvent.click(screen.getByRole('button', { name: 'Join pool' }));
    expect(pools.value.joinPool).toHaveBeenCalledWith('p1', 450);
  });

  test('visitor: one seat left uses the singular, a full pool says so', () => {
    pools.value = poolsValue({ pools: [pool({ maxMembers: 3 })], meId: 'stranger' });
    const { unmount } = open();
    expect(screen.getByText('1 seat open.')).toBeInTheDocument();
    unmount();
    pools.value = poolsValue({ pools: [pool({ maxMembers: 2 })], meId: 'stranger' });
    open();
    expect(screen.getByText('This pool is full.')).toBeInTheDocument();
  });

  test('non-member in API mode: names, votes and payments stay private', () => {
    pools.value = poolsValue({
      meId: 'stranger',
      pools: [pool({ members: [], ledger: [], summary: { raised: 900, goal: 1000, memberCount: 3, viewerIsMember: false } })],
    });
    open();
    expect(screen.getByText(/3 of 4 seats taken/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Votes' })).not.toBeInTheDocument();
  });

  test('only members get the New proposal button', () => {
    open();
    expect(screen.getByRole('button', { name: 'New proposal' })).toBeInTheDocument();
    expect(screen.getByText(/No proposals yet. Start one/)).toBeInTheDocument();
  });

  test('admins get the payment panel, others do not', () => {
    const { unmount } = open();
    expect(screen.queryByRole('heading', { name: 'Record a confirmed payment' })).not.toBeInTheDocument();
    unmount();
    pools.value = poolsValue({ pools: [pool()], meId: 'admin', isAdmin: true });
    open();
    expect(screen.getByRole('heading', { name: 'Record a confirmed payment' })).toBeInTheDocument();
  });

  test('errors show in a banner that can be dismissed', async () => {
    pools.value = poolsValue({ pools: [pool()], meId: 'u1', error: 'Vote closed' });
    open();
    expect(screen.getByRole('alert')).toHaveTextContent('Vote closed');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(pools.value.clearError).toHaveBeenCalled();
  });

  test('wiring: votes, new proposals, payments and reversals reach the context with this pool id', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    pools.value = poolsValue({
      meId: 'u1', isAdmin: true,
      pools: [pool({ proposals: [{ id: 'pr1', title: 'Hire a surveyor', detail: '450 USD', votes: {} }] })],
    });
    open();
    await user.click(within(screen.getByRole('article', { name: 'Hire a surveyor' })).getByRole('button', { name: 'Yes' }));
    expect(pools.value.vote).toHaveBeenCalledWith('p1', 'pr1', 'yes');

    await user.click(screen.getAllByRole('button', { name: 'Reverse' })[0]);
    await user.type(screen.getByRole('textbox', { name: 'Reason for reversal' }), 'Bounced payment');
    await user.click(screen.getByRole('button', { name: 'Confirm reversal' }));
    expect(pools.value.reverseContribution).toHaveBeenCalledWith('p1', expect.stringMatching(/^e[12]$/), 'Bounced payment');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Member' }), 'Kevin');
    await user.type(screen.getByRole('textbox', { name: 'Amount (USD)' }), '150');
    await user.type(screen.getByRole('textbox', { name: 'Escrow or bank reference' }), 'ESC-77');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(pools.value.recordContribution).toHaveBeenCalledWith('p1', expect.objectContaining({ userId: 'u2', amount: 150, reference: 'ESC-77' }));
  });

  test('a failed payment record clears the page banner so the panel shows the error itself', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    pools.value = poolsValue({ meId: 'admin', isAdmin: true, pools: [pool()], recordContribution: vi.fn(async () => { throw new Error('Duplicate reference'); }) });
    open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Member' }), 'Kevin');
    await user.type(screen.getByRole('textbox', { name: 'Amount (USD)' }), '150');
    await user.type(screen.getByRole('textbox', { name: 'Escrow or bank reference' }), 'REF-1');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText(/Duplicate reference/)).toBeInTheDocument();
    expect(pools.value.clearError).toHaveBeenCalled();
  });
});
