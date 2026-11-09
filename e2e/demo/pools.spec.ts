/**
 * Demo pools (stored in the browser), end to end: start a pool from a listing, pay, propose, vote,
 * join an existing pool, and keep it all after a reload.
 */
import { expect, test } from '../support';

test('start a pool from a listing, pay, propose and vote; it survives a reload', async ({ page }) => {
  await page.goto('/property/l1');
  await page.getByRole('link', { name: 'Start a pool' }).click();
  await expect(page.getByRole('heading', { name: 'Start a pool' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveValue('l1');
  await page.getByLabel('Pool name').fill('Cayman Crew');
  await page.getByRole('button', { name: 'Create pool' }).click();

  await expect(page.getByRole('heading', { name: 'Cayman Crew' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('You (you)');
  await page.getByRole('button', { name: 'Pay this month (demo)' }).click();
  await expect(page.locator('.mine dt', { hasText: 'Payments' }).locator('+ dd')).toContainText('1');
  await expect(page.getByRole('button', { name: 'Leave pool' })).toHaveCount(0); // money is in, so no simple exit

  await page.getByRole('button', { name: 'New proposal' }).click();
  await page.getByLabel(/What should the group decide/).fill('Hire a surveyor');
  await page.getByRole('button', { name: 'Post proposal' }).click();
  const card = page.getByRole('article', { name: 'Hire a surveyor' });
  await card.getByRole('button', { name: 'Yes' }).click();
  await expect(card).toContainText('Passed'); // one member, one vote needed

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cayman Crew' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Hire a surveyor' })).toContainText('You voted yes');
  await page.goto('/pools');
  await expect(page.getByRole('link', { name: /Cayman Crew/ })).toBeVisible();
});

test('join an existing pool with a chosen monthly amount, then leave before paying', async ({ page }) => {
  await page.goto('/pools/p2');
  await expect(page.getByRole('heading', { name: 'Kingston Starter Flat' })).toBeVisible();
  await expect(page.getByText('2 seats open.')).toBeVisible();
  await page.getByRole('slider').fill('350');
  await page.getByRole('button', { name: 'Join pool' }).click();
  await expect(page.getByRole('row', { name: /You \(you\)/ })).toContainText('$350');
  await page.getByRole('button', { name: 'Leave pool' }).click();
  await expect(page.getByText('2 seats open.')).toBeVisible();
});
