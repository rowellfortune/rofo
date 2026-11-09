/**
 * Accounts, end to end: sign up with an emailed code, sign in (real SRP), wrong passwords,
 * password reset, two step verification with an authenticator app, and sign out.
 */
import { apiTest as test, backend, codeFor, expect, PASSWORD, signIn } from '../support';

test('sign up, confirm the emailed code, and land signed in as a buyer', async ({ page }) => {
  await page.goto('/login?next=/account');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Full name').fill('Ana Rivera');
  await page.getByLabel('Email').fill('ana@rofo.test');
  await page.getByLabel(/^Password/).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use at least 10 characters.');

  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('We sent a 6 digit code to ana@rofo.test');

  await page.getByLabel('Confirmation code').fill('000000');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('alert')).toHaveText('That code is not right. Check it and try again.');

  await page.getByLabel('Confirmation code').fill(await backend.code('ana@rofo.test', 'signup'));
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Confirmed and signed in with the same password, then sent to `next`.
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByText('Ana Rivera')).toBeVisible();
  await expect(page.locator('dt', { hasText: 'Access' }).locator('+ dd')).toHaveText('Client');
});

test('an existing email cannot sign up twice', async ({ page }) => {
  await backend.user('ana@rofo.test', 'Ana');
  await page.goto('/login');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Full name').fill('Ana Again');
  await page.getByLabel('Email').fill('ana@rofo.test');
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('An account with this email already exists');
});

test('wrong password and unknown email get the same vague answer', async ({ page }) => {
  await backend.user('ana@rofo.test', 'Ana');
  for (const [email, pw] of [['ana@rofo.test', 'Wr0ngPassword'], ['nobody@rofo.test', PASSWORD]]) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password/).fill(pw);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  }
});

test('forgot password: reset with the emailed code, old password stops working', async ({ page }) => {
  await backend.user('ana@rofo.test', 'Ana');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email').fill('ana@rofo.test');
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists for ana@rofo.test');

  await page.getByLabel('Code from the email').fill(await backend.code('ana@rofo.test', 'reset'));
  await page.getByLabel(/^New password/).fill('N3wPassword99');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toHaveText('Password updated. Sign in with your new password.');

  await page.getByLabel('Email').fill('ana@rofo.test');
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');

  await page.getByLabel(/^Password/).fill('N3wPassword99');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'ana@rofo.test' })).toBeVisible();
});

test('turn on two step verification, then sign in needs the app code', async ({ page }) => {
  await backend.user('ana@rofo.test', 'Ana');
  await signIn(page, 'ana@rofo.test');
  await page.getByRole('link', { name: 'ana@rofo.test' }).click();
  await page.getByRole('button', { name: 'Turn on two step verification' }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();

  // The key shown on screen is what the person types into their app.
  const secret = (await page.locator('.mfa-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Code from the app').fill('000000');
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('alert')).toContainText('That code is not right');
  await page.getByLabel('Code from the app').fill(codeFor(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('status')).toContainText('Two step verification is on.');
  expect((await backend.account('ana@rofo.test'))?.totpEnabled).toBe(true);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill('ana@rofo.test');
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Two step verification' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('That code is not right');
  await page.getByLabel('Authenticator code').fill(codeFor(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('link', { name: 'ana@rofo.test' })).toBeVisible();
});

test('the session survives a reload and sign out ends it', async ({ page }) => {
  await backend.user('ana@rofo.test', 'Ana');
  await signIn(page, 'ana@rofo.test');
  await page.reload();
  await expect(page.getByRole('link', { name: 'ana@rofo.test' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});
