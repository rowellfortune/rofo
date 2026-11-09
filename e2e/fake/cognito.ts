/**
 * A fake Cognito user pool and identity pool, enough for everything RoFo uses:
 * sign up, email codes, SRP sign in, TOTP two step sign in, password reset, token refresh,
 * groups, and the admin calls the backend makes. Requests use the real AWS JSON protocol
 * (X-Amz-Target header), so both Amplify in the browser and the AWS SDK in the backend talk to it unchanged.
 *
 * Emails are not sent. Codes land in an outbox the tests read.
 */
import { randomUUID } from 'node:crypto';
import { checkSrp, challengeHex, startSrp, type SrpSession } from './srp';
import { checkTotp, newSecret } from './totp';
import { sign, verify } from './jwt';

export const REGION = 'us-east-1';
export const POOL_ID = `${REGION}_E2EPOOL`;
export const POOL_NAME = POOL_ID.split('_')[1];
export const CLIENT_ID = 'e2eclient';
export const IDENTITY_POOL_ID = `${REGION}:00000000-0000-0000-0000-00000000e2e0`;
const ISS = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`;

export interface User {
  sub: string;
  email: string;
  name: string;
  password: string;
  confirmed: boolean;
  groups: string[];
  /** Secret handed out by AssociateSoftwareToken, waiting for VerifySoftwareToken. */
  pendingTotp?: string;
  /** Verified TOTP secret. */
  totpSecret?: string;
  totpEnabled: boolean;
  /** Refresh tokens issued before this time stop working (AdminUserGlobalSignOut). */
  signedOutAt: number;
}

/** Everything the fake pool remembers. Reset between tests. */
const state = {
  users: new Map<string, User>(), // by sub
  srp: new Map<string, SrpSession & { sub: string; A: string }>(), // by session id
  mfa: new Map<string, string>(), // session id -> sub, waiting for a TOTP code
  outbox: [] as { email: string; code: string; kind: 'signup' | 'reset' }[],
  resetCodes: new Map<string, string>(), // sub -> code
  signupCodes: new Map<string, string>(), // sub -> code
};

export function resetCognito(): void {
  state.users.clear(); state.srp.clear(); state.mfa.clear(); state.outbox.length = 0;
  state.resetCodes.clear(); state.signupCodes.clear();
}

/** Error in the shape the AWS JSON protocol uses. */
class CognitoError extends Error {
  constructor(public type: string, message: string, public status = 400) { super(message); }
}

const byEmail = (email: string) => [...state.users.values()].find((u) => u.email.toLowerCase() === String(email).toLowerCase().trim());
/** Usernames are emails, but Cognito also accepts the sub (the backend's admin calls pass the sub). */
const find = (username: string) => state.users.get(username) ?? byEmail(username);
const code6 = () => String(Math.floor(100000 + Math.random() * 900000));

/** Cognito's default policy, as configured in infra/auth.ts. */
function checkPassword(pw: string) {
  if (pw.length < 10 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    throw new CognitoError('InvalidPasswordException', 'Password did not conform with policy');
  }
}

/** Test helper: create a confirmed user straight away. */
export function addUser(u: { email: string; password: string; name: string; groups?: string[]; totp?: boolean }): User {
  const user: User = {
    sub: randomUUID(), email: u.email, name: u.name, password: u.password, confirmed: true,
    groups: u.groups ?? ['Client'], totpEnabled: Boolean(u.totp), totpSecret: u.totp ? newSecret() : undefined, signedOutAt: 0,
  };
  state.users.set(user.sub, user);
  return user;
}
export const getUser = (emailOrSub: string) => find(emailOrSub);
/** Latest code emailed to this address. */
export const lastCode = (email: string, kind?: 'signup' | 'reset') =>
  [...state.outbox].reverse().find((m) => m.email === email && (!kind || m.kind === kind))?.code;

/** The three tokens Cognito returns. The ID token carries name and email; the access token does not. */
function tokens(u: User, withRefresh = true) {
  const now = Math.floor(Date.now() / 1000);
  const common = { sub: u.sub, iss: ISS, 'cognito:groups': u.groups, iat: now, exp: now + 3600, auth_time: now };
  return {
    AccessToken: sign({ ...common, token_use: 'access', client_id: CLIENT_ID, username: u.sub, scope: 'aws.cognito.signin.user.admin', jti: randomUUID() }),
    IdToken: sign({ ...common, token_use: 'id', aud: CLIENT_ID, email: u.email, email_verified: true, name: u.name, 'cognito:username': u.sub }),
    ...(withRefresh && { RefreshToken: sign({ sub: u.sub, token_use: 'refresh', iat: now, jti: randomUUID() }) }),
    ExpiresIn: 3600,
    TokenType: 'Bearer',
  };
}

/** The user behind an access token (for calls like GetUser and AssociateSoftwareToken). */
function fromAccessToken(token: string): User {
  const c = verify(token);
  const u = c && c.token_use === 'access' ? state.users.get(c.sub) : undefined;
  if (!u) throw new CognitoError('NotAuthorizedException', 'Invalid Access Token');
  return u;
}

/** Fresh access and ID tokens for a refresh token, unless the user was signed out everywhere since. */
function refreshed(refreshToken: string) {
  const c = verify(refreshToken);
  const u = c && c.token_use === 'refresh' ? state.users.get(c.sub) : undefined;
  if (!u || c!.iat * 1000 < u.signedOutAt) throw new CognitoError('NotAuthorizedException', 'Refresh Token has been revoked');
  return tokens(u, false);
}

type Body = Record<string, any>;

/** User pool operations, keyed by the part after "AWSCognitoIdentityProviderService.". */
const userPool: Record<string, (b: Body) => unknown> = {
  SignUp(b) {
    if (byEmail(b.Username)) throw new CognitoError('UsernameExistsException', 'An account with the given email already exists.');
    checkPassword(b.Password);
    const attr = (n: string) => b.UserAttributes?.find((a: { Name: string }) => a.Name === n)?.Value ?? '';
    const user: User = { sub: randomUUID(), email: b.Username, name: attr('name'), password: b.Password, confirmed: false, groups: [], totpEnabled: false, signedOutAt: 0 };
    state.users.set(user.sub, user);
    const code = code6();
    state.signupCodes.set(user.sub, code);
    state.outbox.push({ email: user.email, code, kind: 'signup' });
    return { UserConfirmed: false, UserSub: user.sub, CodeDeliveryDetails: { Destination: user.email, DeliveryMedium: 'EMAIL', AttributeName: 'email' } };
  },
  ResendConfirmationCode(b) {
    const u = find(b.Username);
    if (u && !u.confirmed) {
      const code = code6();
      state.signupCodes.set(u.sub, code);
      state.outbox.push({ email: u.email, code, kind: 'signup' });
    }
    return { CodeDeliveryDetails: { Destination: b.Username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } };
  },
  ConfirmSignUp(b) {
    const u = find(b.Username);
    if (!u || state.signupCodes.get(u.sub) !== b.ConfirmationCode) throw new CognitoError('CodeMismatchException', 'Invalid verification code provided, please try again.');
    u.confirmed = true;
    state.signupCodes.delete(u.sub);
    u.groups = ['Client']; // what backend/auth/postConfirmation.ts does
    return {};
  },
  InitiateAuth(b) {
    if (b.AuthFlow === 'USER_SRP_AUTH') {
      const u = find(b.AuthParameters.USERNAME);
      // Cognito with user existence errors prevented answers the same way for unknown users.
      if (!u) throw new CognitoError('NotAuthorizedException', 'Incorrect username or password.');
      if (!u.confirmed) throw new CognitoError('UserNotConfirmedException', 'User is not confirmed.');
      const s = startSrp(POOL_NAME, u.sub, u.password);
      const session = randomUUID();
      state.srp.set(session, { ...s, sub: u.sub, A: b.AuthParameters.SRP_A }); // the client sends A only here
      return {
        ChallengeName: 'PASSWORD_VERIFIER', Session: session,
        ChallengeParameters: { ...challengeHex(s), SECRET_BLOCK: s.secretBlock, USERNAME: u.sub, USER_ID_FOR_SRP: u.sub },
      };
    }
    if (b.AuthFlow === 'REFRESH_TOKEN_AUTH' || b.AuthFlow === 'REFRESH_TOKEN') {
      return { AuthenticationResult: refreshed(b.AuthParameters.REFRESH_TOKEN), ChallengeParameters: {} };
    }
    throw new CognitoError('InvalidParameterException', `Auth flow ${b.AuthFlow} is not enabled for this client`);
  },
  RespondToAuthChallenge(b) {
    if (b.ChallengeName === 'PASSWORD_VERIFIER') {
      const s = state.srp.get(b.Session);
      state.srp.delete(b.Session);
      const u = s && state.users.get(s.sub);
      const r = b.ChallengeResponses;
      if (!s || !u || !checkSrp(s, POOL_NAME, u.password, s.A, r.TIMESTAMP, r.PASSWORD_CLAIM_SIGNATURE)) {
        throw new CognitoError('NotAuthorizedException', 'Incorrect username or password.');
      }
      if (u.totpEnabled) {
        const session = randomUUID();
        state.mfa.set(session, u.sub);
        return { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: session, ChallengeParameters: { USER_ID_FOR_SRP: u.sub } };
      }
      return { AuthenticationResult: tokens(u), ChallengeParameters: {} };
    }
    if (b.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      const sub = state.mfa.get(b.Session);
      const u = sub ? state.users.get(sub) : undefined;
      if (!u) throw new CognitoError('NotAuthorizedException', 'Invalid session for the user, session is expired.');
      if (!checkTotp(u.totpSecret!, b.ChallengeResponses.SOFTWARE_TOKEN_MFA_CODE)) throw new CognitoError('CodeMismatchException', 'Invalid code received for user');
      state.mfa.delete(b.Session);
      return { AuthenticationResult: tokens(u), ChallengeParameters: {} };
    }
    throw new CognitoError('InvalidParameterException', `Unsupported challenge ${b.ChallengeName}`);
  },
  /** The newer refresh call Amplify uses. New tokens carry the user's current groups. */
  GetTokensFromRefreshToken(b) {
    return { AuthenticationResult: refreshed(b.RefreshToken) };
  },
  ForgotPassword(b) {
    const u = find(b.Username);
    if (u) {
      const code = code6();
      state.resetCodes.set(u.sub, code);
      state.outbox.push({ email: u.email, code, kind: 'reset' });
    }
    return { CodeDeliveryDetails: { Destination: b.Username, DeliveryMedium: 'EMAIL', AttributeName: 'email' } };
  },
  ConfirmForgotPassword(b) {
    const u = find(b.Username);
    if (!u || state.resetCodes.get(u.sub) !== b.ConfirmationCode) throw new CognitoError('CodeMismatchException', 'Invalid verification code provided, please try again.');
    checkPassword(b.Password);
    u.password = b.Password;
    state.resetCodes.delete(u.sub);
    return {};
  },
  GetUser(b) {
    const u = fromAccessToken(b.AccessToken);
    return {
      Username: u.sub,
      UserAttributes: [{ Name: 'sub', Value: u.sub }, { Name: 'email', Value: u.email }, { Name: 'name', Value: u.name }],
      UserMFASettingList: u.totpEnabled ? ['SOFTWARE_TOKEN_MFA'] : [],
      ...(u.totpEnabled && { PreferredMfaSetting: 'SOFTWARE_TOKEN_MFA' }),
    };
  },
  AssociateSoftwareToken(b) {
    const u = fromAccessToken(b.AccessToken);
    u.pendingTotp = newSecret();
    return { SecretCode: u.pendingTotp };
  },
  VerifySoftwareToken(b) {
    const u = fromAccessToken(b.AccessToken);
    if (!u.pendingTotp || !checkTotp(u.pendingTotp, b.UserCode)) throw new CognitoError('EnableSoftwareTokenMFAException', 'Code mismatch');
    u.totpSecret = u.pendingTotp;
    u.pendingTotp = undefined;
    return { Status: 'SUCCESS' };
  },
  SetUserMFAPreference(b) {
    const u = fromAccessToken(b.AccessToken);
    const s = b.SoftwareTokenMfaSettings;
    if (s?.Enabled === true || s?.PreferredMfa === true) {
      if (!u.totpSecret) throw new CognitoError('InvalidParameterException', 'User has not verified software token mfa');
      u.totpEnabled = true;
    }
    if (s?.Enabled === false) u.totpEnabled = false;
    return {};
  },
  GlobalSignOut(b) { fromAccessToken(b.AccessToken).signedOutAt = Date.now(); return {}; },
  RevokeToken() { return {}; },

  // Admin calls made by the backend with the AWS SDK.
  AdminGetUser(b) {
    const u = find(b.Username);
    if (!u) throw new CognitoError('UserNotFoundException', 'User does not exist.');
    return { Username: u.sub, UserMFASettingList: u.totpEnabled ? ['SOFTWARE_TOKEN_MFA'] : [], Enabled: true, UserStatus: 'CONFIRMED' };
  },
  AdminAddUserToGroup(b) {
    const u = find(b.Username);
    if (!u) throw new CognitoError('UserNotFoundException', 'User does not exist.');
    if (!u.groups.includes(b.GroupName)) u.groups.push(b.GroupName);
    return {};
  },
  AdminRemoveUserFromGroup(b) {
    const u = find(b.Username);
    if (!u) throw new CognitoError('UserNotFoundException', 'User does not exist.');
    u.groups = u.groups.filter((g) => g !== b.GroupName);
    return {};
  },
  AdminUserGlobalSignOut(b) {
    const u = find(b.Username);
    if (u) u.signedOutAt = Date.now();
    return {};
  },
};

/** Identity pool: guests and signed in users both get (fake) temporary AWS credentials. */
const identityPool: Record<string, (b: Body) => unknown> = {
  GetId: () => ({ IdentityId: `${REGION}:${randomUUID()}` }),
  GetCredentialsForIdentity: (b) => ({
    IdentityId: b.IdentityId,
    Credentials: { AccessKeyId: 'ASIAE2E', SecretKey: 'e2e-secret', SessionToken: 'e2e-session', Expiration: Math.floor(Date.now() / 1000) + 3600 },
  }),
};

/** Handle one JSON protocol request. Returns status and body. */
export function handleCognito(target: string, body: Body): { status: number; body: unknown; type?: string } {
  const [service, op] = target.split('.');
  const fn = service === 'AWSCognitoIdentityService' ? identityPool[op] : userPool[op];
  try {
    if (!fn) throw new CognitoError('UnknownOperationException', `Fake Cognito does not implement ${target}`);
    return { status: 200, body: fn(body) };
  } catch (e) {
    if (e instanceof CognitoError) return { status: e.status, body: { __type: e.type, message: e.message }, type: e.type };
    throw e;
  }
}
