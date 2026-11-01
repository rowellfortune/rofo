import type { AppSyncResolverEvent } from 'aws-lambda';
import { blockedMessage } from '../lib/mfa';
import { AppError } from './AppError';

/** Every GraphQL resolver returns this envelope. */
export type GraphqlResponse<T> = { success: true; data: T } | { success: false; error: string };

/** Caller identity pulled from the AppSync event (Cognito JWT). */
export interface Caller {
  sub: string;
  email: string;
  name: string;
  groups: string[];
  /** Set when the Admin group was removed because two step verification is off (or could not be checked). */
  adminBlocked?: 'mfa' | 'check';
}

/** Read the caller from a Cognito-authenticated AppSync event. Throws 401 for guests. */
export function getCaller(event: AppSyncResolverEvent<unknown>): Caller {
  const id = event.identity as
    | { sub?: string; groups?: string[] | null; claims?: Record<string, string> }
    | null
    | undefined;
  if (!id?.sub) throw new AppError('Sign in required', 401);
  return {
    sub: id.sub,
    email: id.claims?.email ?? '',
    name: id.claims?.name ?? id.claims?.email ?? 'RoFo agent',
    groups: id.groups ?? [],
  };
}

/** Throw 403 unless the caller is in one of the given groups. */
export function requireGroup(caller: Caller, allowed: string[]): void {
  if (caller.groups.some((g) => allowed.includes(g))) return;
  // An admin who was stripped of admin rights should be told why, not just "Not allowed".
  if (caller.adminBlocked && allowed.includes('Admin')) throw new AppError(blockedMessage(caller.adminBlocked), 403);
  throw new AppError('Not allowed', 403);
}

/**
 * Wrap a resolver so it always returns { success, data } or { success, error }.
 * Known AppErrors show their message. Unknown errors are logged and masked.
 */
function graphqlHandler<TArgs, TData>(
  fn: (event: AppSyncResolverEvent<TArgs>) => Promise<TData>,
) {
  return async (event: AppSyncResolverEvent<TArgs>): Promise<GraphqlResponse<TData>> => {
    try {
      return { success: true, data: await fn(event) };
    } catch (err) {
      if (err instanceof AppError) return { success: false, error: err.message };
      console.error('Unhandled resolver error', err);
      return { success: false, error: 'Internal error' };
    }
  };
}

export const GraphqlUtil = { graphqlHandler, getCaller, requireGroup };
