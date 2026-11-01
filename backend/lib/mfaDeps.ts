import { AdminGetUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { applyAdminMfaPolicy, type MfaDeps } from './mfa';
import type { Caller } from '../utils/GraphqlUtil';

const cognito = new CognitoIdentityProviderClient({});

/**
 * Real dependencies for the admin MFA check. An object, not a constant, so tests can swap `hasTotp`.
 * Needs cognito-idp:AdminGetUser on the user pool and USER_POOL_ID in the environment.
 */
export const mfaDeps: MfaDeps = {
  now: () => Date.now(),
  hasTotp: async (userId) => {
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: userId }));
    return Boolean(user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA'));
  },
};

/** Apply the admin MFA rule with the real dependencies. Use this at every entry point. */
export const enforceAdminMfa = (caller: Caller): Promise<Caller> => applyAdminMfaPolicy(caller, mfaDeps);
