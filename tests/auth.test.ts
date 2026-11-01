/**
 * Sign in helpers: step mapping, error wording, password and code rules.
 * Run: npm run test:frontend
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPassword, formatSecret, friendlyAuthError, isCode, nextAfterSignIn, normalizeCode } from '../src/lib/authFlow';

test('sign in steps lead to the right screen', () => {
  assert.equal(nextAfterSignIn('DONE', true), 'done');
  assert.equal(nextAfterSignIn(undefined, true), 'done');
  assert.equal(nextAfterSignIn('CONFIRM_SIGN_UP', false), 'confirm');
  assert.equal(nextAfterSignIn('CONFIRM_SIGN_IN_WITH_TOTP_CODE', false), 'totp');
  // anything we cannot handle is reported, never treated as success
  for (const step of ['CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED', 'CONFIRM_SIGN_IN_WITH_SMS_CODE', 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP', 'RESET_PASSWORD', 'SOMETHING_NEW', undefined]) {
    assert.equal(nextAfterSignIn(step, false), 'unsupported', String(step));
  }
});

test('password rules match the user pool and name the first problem', () => {
  assert.equal(checkPassword('Sup3rSecret1'), null);
  assert.match(checkPassword('Short1a')!, /10 characters/);
  assert.match(checkPassword('alllowercase1')!, /upper case/);
  assert.match(checkPassword('ALLUPPERCASE1')!, /lower case/);
  assert.match(checkPassword('NoDigitsHereAtAll')!, /number/);
  assert.equal(checkPassword('Exactly10!A1'), null); // symbols are allowed but not required
});

test('codes: digits only, six of them', () => {
  assert.equal(normalizeCode(' 123 456 '), '123456');
  assert.equal(normalizeCode('123-456'), '123456');
  assert.equal(isCode('123 456'), true);
  for (const bad of ['12345', '1234567', 'abcdef', '', '12 34 5']) assert.equal(isCode(bad), false, bad);
  assert.equal(formatSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(formatSecret(' ABCD EFGH '), 'ABCD EFGH'); // already spaced input stays tidy
});

test('error messages are plain, never raw AWS text, and sign in does not reveal which emails exist', () => {
  const e = (name: string, message = '') => friendlyAuthError({ name, message });
  // wrong password and unknown email read the same
  assert.equal(e('NotAuthorizedException', 'Incorrect username or password.'), e('UserNotFoundException', 'User does not exist.'));
  assert.equal(e('NotAuthorizedException', 'Incorrect username or password.'), 'Incorrect email or password.');
  assert.match(e('NotAuthorizedException', 'Password attempts exceeded'), /Too many attempts/);
  assert.match(e('NotAuthorizedException', 'Invalid session for the user, session is expired.'), /took too long/);
  assert.match(e('NotAuthorizedException', 'Invalid Refresh Token'), /session ended/);
  assert.match(e('UserNotConfirmedException'), /Confirm your email/);
  assert.match(e('CodeMismatchException'), /not right/);
  assert.match(e('EnableSoftwareTokenMFAException'), /not right/);
  assert.match(e('ExpiredCodeException'), /expired/);
  assert.match(e('InvalidPasswordException', 'Password did not conform with policy: Password must have uppercase characters'), /too weak/);
  assert.match(e('UsernameExistsException'), /already exists/);
  for (const n of ['LimitExceededException', 'TooManyRequestsException', 'TooManyFailedAttemptsException']) assert.match(e(n), /Too many attempts/);
  assert.match(e('InvalidParameterException', '1 validation error: password'), /not allowed/);
  // unknown errors and odd values never leak internals
  const leaky = friendlyAuthError({ name: 'ResourceNotFoundException', message: 'User pool us-east-1_SECRET does not exist' });
  assert.ok(!leaky.includes('SECRET'));
  for (const odd of [undefined, null, 'text', 42, {}]) assert.match(friendlyAuthError(odd), /Something went wrong/);
});
