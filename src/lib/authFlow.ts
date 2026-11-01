/**
 * Pure helpers for the sign in screens: what to do after a sign in step, plain language errors,
 * and the rules for passwords and codes. No network, so they are easy to test.
 */

/** What the screen should do next after a sign in call. */
export type NextStep = 'done' | 'confirm' | 'totp' | 'unsupported';

/** Seconds a person must wait before asking for another emailed code. */
export const RESEND_SECONDS = 30;

/** Map Amplify's `nextStep.signInStep` to the screen we show. */
export function nextAfterSignIn(step: string | undefined, isSignedIn: boolean): NextStep {
  if (isSignedIn || step === 'DONE') return 'done';
  if (step === 'CONFIRM_SIGN_UP') return 'confirm'; // account exists but the email was never confirmed
  if (step === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') return 'totp'; // authenticator app code needed
  return 'unsupported'; // for example a forced password change. Better to say so than to hang.
}

/**
 * The password rules of the user pool (see infra/auth.ts). Returns a message, or null when the password is fine.
 * Checking here saves a round trip, but the server remains the authority.
 */
export function checkPassword(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/.test(pw)) return 'Add a lower case letter.';
  if (!/[A-Z]/.test(pw)) return 'Add an upper case letter.';
  if (!/\d/.test(pw)) return 'Add a number.';
  return null;
}

/** Codes are pasted with spaces or dashes ("123 456"). Keep the digits only. */
export const normalizeCode = (raw: string): string => raw.replace(/\D/g, '');

/** Emailed codes and authenticator codes both have 6 digits. */
export const isCode = (raw: string): boolean => normalizeCode(raw).length === 6;

/** Show an authenticator secret in groups of four so it is easy to type. */
export const formatSecret = (secret: string): string => secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

/** True when the sign in attempt itself has expired and must be restarted from the password step. */
export const isExpiredSession = (err: unknown): boolean => /session/i.test(String((err as { message?: string })?.message ?? ''));

/**
 * Turn an Amplify or Cognito error into a sentence a person can act on.
 * Sign in and password reset answers stay vague on purpose, so nobody can use them to find out
 * which emails have accounts.
 */
export function friendlyAuthError(err: unknown): string {
  const e = err as { name?: string; message?: string } | undefined;
  const name = e?.name ?? '';
  const msg = e?.message ?? '';
  switch (name) {
    case 'NotAuthorizedException':
      if (/attempts exceeded/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.';
      if (isExpiredSession(err)) return 'That sign in took too long. Start again.';
      if (/refresh token/i.test(msg)) return 'Your session ended. Sign in again.';
      return 'Incorrect email or password.';
    case 'UserNotFoundException':
      return 'Incorrect email or password.';
    case 'UserNotConfirmedException':
      return 'Confirm your email first. We can send you a new code.';
    case 'CodeMismatchException':
    case 'EnableSoftwareTokenMFAException':
      return 'That code is not right. Check it and try again.';
    case 'ExpiredCodeException':
      return 'That code has expired. Ask for a new one.';
    case 'InvalidPasswordException':
      return 'That password is too weak. Use at least 10 characters with upper case, lower case and a number.';
    case 'UsernameExistsException':
      return 'An account with this email already exists. Sign in instead.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'NetworkError':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'InvalidParameterException':
      return /password/i.test(msg) ? 'That password is not allowed. Use at least 10 characters with upper case, lower case and a number.' : 'Check what you entered and try again.';
    default:
      return 'Something went wrong. Try again in a moment.';
  }
}

/** Whether an admin has two step verification on. 'na' = not an admin. 'unknown' = still checking. */
export type AdminMfa = 'na' | 'unknown' | 'ok' | 'missing';

/**
 * What an admin only page should do. The server enforces the same rule, this just explains it
 * instead of showing screens that would fail.
 */
export function adminGate(isAdminUser: boolean, mfa: AdminMfa): 'allow' | 'wait' | 'needs-mfa' | 'deny' {
  if (!isAdminUser) return 'deny';
  if (mfa === 'ok') return 'allow';
  if (mfa === 'missing') return 'needs-mfa';
  return 'wait'; // 'unknown', or 'na' on the first render before the check starts
}
