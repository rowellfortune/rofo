/**
 * Stand-ins for the auth and pools contexts, so a component can be tested on its own.
 * Each builder returns every field the real context has, with harmless defaults and spy functions.
 * Tests override only what they care about.
 */
import { vi } from 'vitest';
import type { AuthUser } from '../state/AuthContext';
import type { Pool } from '../types';

/** A signed in user. */
export const userWith = (groups: string[] = ['Client'], over: Partial<AuthUser> = {}): AuthUser => ({
  sub: 'me', email: 'me@rofo.test', name: 'Me Myself', groups, ...over,
});

/** Everything useAuth() returns. */
export function authValue(over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    user: null as AuthUser | null,
    loading: false,
    signIn: vi.fn(async (): Promise<'done' | 'confirm' | 'totp'> => 'done'),
    confirmTotp: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    resendCode: vi.fn(async () => {}),
    forgotPassword: vi.fn(async () => {}),
    resetPassword: vi.fn(async () => {}),
    mfa: {
      isEnabled: vi.fn(async () => false),
      begin: vi.fn(async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/RoFo%20estate:me@rofo.test?secret=JBSWY3DPEHPK3PXP' })),
      finish: vi.fn(async () => {}),
      disable: vi.fn(async () => {}),
    },
    signOut: vi.fn(async () => {}),
    adminMfa: 'na' as 'na' | 'unknown' | 'ok' | 'missing',
    recheckAdminMfa: vi.fn(),
    refresh: vi.fn(async () => null as AuthUser | null),
    ...over,
  };
}

/** Everything usePools() returns. */
export function poolsValue(over: Record<string, unknown> = {}) {
  return {
    pools: [] as Pool[],
    loading: false,
    error: null as string | null,
    clearError: vi.fn(),
    needsAuth: false,
    meId: 'me' as string | null,
    canSelfPay: true,
    isAdmin: false,
    loadPool: vi.fn(async () => {}),
    createPool: vi.fn(async () => 'new-pool'),
    joinPool: vi.fn(async () => {}),
    leavePool: vi.fn(async () => {}),
    contribute: vi.fn(async () => {}),
    vote: vi.fn(async () => {}),
    createProposal: vi.fn(async () => {}),
    recordContribution: vi.fn(async () => {}),
    reverseContribution: vi.fn(async () => {}),
    ...over,
  };
}
