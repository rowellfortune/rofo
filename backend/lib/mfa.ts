import type { Caller } from '../utils/GraphqlUtil';

/**
 * Admins must have two step verification turned on.
 *
 * Cognito cannot require MFA for one group only, so we check it ourselves on every request an admin makes.
 * An admin with MFA enabled is challenged for a code at every sign in (the pool allows optional MFA and
 * Cognito always challenges a user who has it on). So "MFA is enabled" is the same as "a code was asked for".
 * It is also checked live, so an admin who switches it off loses admin rights within a minute.
 *
 * An admin without it is treated as an ordinary user: the Admin group is removed from the caller before any
 * other code looks at it. That covers every admin check at once, including ones added later.
 */

export const MFA_REQUIRED_MESSAGE = 'Turn on two step verification in your account to use admin tools';
export const MFA_CHECK_FAILED_MESSAGE = 'Could not check two step verification. Try again in a moment.';

/** How long a "yes, MFA is on" answer is trusted. "No" answers are never cached, so enabling MFA works at once. */
export const CACHE_MS = 60_000;

/** What the check needs. Tests replace it. */
export interface MfaDeps {
  /** Does this user have an authenticator app registered and switched on? */
  hasTotp: (userId: string) => Promise<boolean>;
  now: () => number;
}

/** Per container memory of recent yes answers: userId -> time the answer expires. */
const okUntil = new Map<string, number>();

/** Forget cached answers. For tests. */
export const resetMfaCache = (): void => okUntil.clear();

/**
 * Return the caller to use for the rest of the request.
 * Not an admin: returned unchanged, and nothing is looked up.
 * Admin with MFA: returned unchanged.
 * Admin without MFA, or when the check fails: the Admin group is removed and `adminBlocked` says why.
 * Failing closed on errors is deliberate. If we cannot tell, we do not grant admin power.
 */
export async function applyAdminMfaPolicy(caller: Caller, deps: MfaDeps): Promise<Caller> {
  if (!caller.groups.includes('Admin')) return caller;

  const now = deps.now();
  if ((okUntil.get(caller.sub) ?? 0) > now) return caller;

  let enabled: boolean;
  try {
    enabled = await deps.hasTotp(caller.sub);
  } catch (err) {
    console.error('MFA check failed, admin rights withheld', caller.sub, (err as Error).message);
    return { ...caller, groups: caller.groups.filter((g) => g !== 'Admin'), adminBlocked: 'check' };
  }

  if (enabled) {
    okUntil.set(caller.sub, now + CACHE_MS);
    return caller;
  }
  okUntil.delete(caller.sub);
  return { ...caller, groups: caller.groups.filter((g) => g !== 'Admin'), adminBlocked: 'mfa' };
}

/** The message to show when an admin was stripped of their rights. */
export const blockedMessage = (why: 'mfa' | 'check'): string => (why === 'mfa' ? MFA_REQUIRED_MESSAGE : MFA_CHECK_FAILED_MESSAGE);
