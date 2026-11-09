/**
 * Buying pools, end to end, with three people in three browsers:
 * a buyer starts a pool from a listing, a second buyer joins, they vote,
 * and an admin (with two step verification) records and reverses a payment.
 */
import { apiTest as test, backend, expect, listing, newPerson, signIn } from '../support';
import type { Page } from '@playwright/test';

let listingId = '';
let adminSecret = '';
test.beforeEach(async () => {
  await backend.user('agent@rofo.test', 'Maya Agent', ['Client', 'Agent']);
  [listingId] = (await backend.listings('agent@rofo.test', [listing()])).ids;
  await backend.user('ana@rofo.test', 'Ana Rivera');
  await backend.user('ben@rofo.test', 'Ben Koster');
  adminSecret = (await backend.user('admin@rofo.test', 'Ops Admin', ['Client', 'Admin'], true)).totpSecret!;
});

/** Ana starts a pool for the seeded listing from the property page. Returns the pool URL. */
async function startPool(page: Page): Promise<string> {
  await signIn(page, 'ana@rofo.test');
  await page.goto(`/property/${listingId}`);
  await page.getByRole('link', { name: 'Start a pool' }).click();
  await expect(page.getByRole('heading', { name: 'Start a pool' })).toBeVisible();
  await page.getByLabel('Pool name').fill('Kerkplein Crew');
  await page.getByRole('button', { name: 'Create pool' }).click();
  await expect(page.getByRole('heading', { name: 'Kerkplein Crew' })).toBeVisible();
  return new URL(page.url()).pathname;
}

const membersTable = (page: Page) => page.getByRole('table');

test('start a pool, a second buyer joins, and both see real names and shares', async ({ page, context }) => {
  const poolPath = await startPool(page);
  await expect(membersTable(page)).toContainText('Ana Rivera (you)');

  const ben = await newPerson(context);
  await signIn(ben, 'ben@rofo.test');
  await ben.goto('/pools');
  // Ben is not a member yet, so the list shows totals only.
  await ben.getByRole('link', { name: /Kerkplein Crew/ }).click();
  await expect(ben.getByText(/Names, shares, payments and votes are visible to members only/)).toBeVisible();
  await ben.getByRole('slider').fill('300');
  await ben.getByRole('button', { name: 'Join pool' }).click();
  await expect(membersTable(ben)).toContainText('Ben Koster (you)');
  await expect(membersTable(ben)).toContainText('Ana Rivera');

  await page.goto(poolPath);
  await expect(membersTable(page)).toContainText('Ben Koster');
  await expect(membersTable(page).getByRole('row', { name: /Ben Koster/ })).toContainText('$300');
});

test('members propose and vote; the proposal passes when the threshold is met', async ({ page, context }) => {
  const poolPath = await startPool(page);
  const ben = await newPerson(context);
  await signIn(ben, 'ben@rofo.test');
  await ben.goto(poolPath);
  await ben.getByRole('button', { name: 'Join pool' }).click();
  await expect(membersTable(ben)).toContainText('Ben Koster (you)');

  await page.reload();
  await page.getByRole('button', { name: 'New proposal' }).click();
  await page.getByLabel(/What should the group decide/).fill('Offer 240,000 USD');
  await page.getByLabel('Details (optional)').fill('Asking is 250,000. Deposit goal not reached yet.');
  await page.getByRole('button', { name: 'Post proposal' }).click();
  const card = page.getByRole('article', { name: 'Offer 240,000 USD' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Yes' }).click();
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', '1 yes, 0 no, 2 yes needed');
  await expect(card).toContainText('Open');

  await ben.reload();
  const benCard = ben.getByRole('article', { name: 'Offer 240,000 USD' });
  await benCard.getByRole('button', { name: 'Yes' }).click();
  await expect(benCard.getByRole('img')).toHaveAttribute('aria-label', '2 yes, 0 no, 2 yes needed');
  await expect(benCard).toContainText('Passed');
});

test('admin records a payment, a duplicate reference is refused, and a reversal undoes it', async ({ page, context }) => {
  const poolPath = await startPool(page);

  const admin = await newPerson(context);
  await signIn(admin, 'admin@rofo.test', { secret: adminSecret });
  await admin.goto(poolPath);
  await admin.getByRole('combobox', { name: 'Member' }).selectOption({ label: 'Ana Rivera' });
  await admin.getByLabel('Amount (USD)').fill('600');
  await admin.getByLabel('Escrow or bank reference').fill('ESC-1001');
  admin.once('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Record payment' }).click();
  await expect(admin.getByRole('status')).toHaveText('Recorded $600 for Ana Rivera.');
  await expect(admin.locator('.ledger')).toContainText('ref ESC-1001');

  // The same bank reference again, with different case and spacing.
  await admin.getByRole('combobox', { name: 'Member' }).selectOption({ label: 'Ana Rivera' });
  await admin.getByLabel('Amount (USD)').fill('600');
  await admin.getByLabel('Escrow or bank reference').fill('  esc-1001 ');
  admin.once('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Record payment' }).click();
  await expect(admin.locator('.payment-panel [role="alert"]')).toContainText(/already recorded/i);

  // Ana sees the money and her share.
  await page.goto(poolPath);
  await expect(page.locator('.mine dt', { hasText: 'Paid in' }).locator('+ dd')).toHaveText('$600');
  await expect(page.locator('.mine dt', { hasText: 'Your share' }).locator('+ dd')).toHaveText('100.0%');
  // Members cannot pay themselves in API mode.
  await expect(page.getByText(/confirmed through escrow/)).toBeVisible();

  // Reverse it.
  await admin.getByRole('button', { name: 'Reverse' }).click();
  await admin.getByLabel('Reason for reversal').fill('Payment bounced');
  await admin.getByRole('button', { name: 'Confirm reversal' }).click();
  await expect(admin.locator('.ledger')).toContainText('Reversed');
  await page.reload();
  await expect(page.locator('.mine dt', { hasText: 'Paid in' }).locator('+ dd')).toHaveText('$0');
});

test('an admin without two step verification gets no payment tools', async ({ page, context }) => {
  const poolPath = await startPool(page);
  await backend.user('lax@rofo.test', 'Lax Admin', ['Client', 'Admin'], false);
  const lax = await newPerson(context);
  await signIn(lax, 'lax@rofo.test');
  await lax.goto(poolPath);
  await expect(lax.getByRole('heading', { name: 'Kerkplein Crew' })).toBeVisible();
  await expect(lax.getByRole('heading', { name: 'Record a confirmed payment' })).toHaveCount(0);
});

test('signed out visitors are asked to sign in', async ({ page }) => {
  await page.goto('/pools');
  await expect(page.getByText('Sign in to browse and join pools.')).toBeVisible();
});
